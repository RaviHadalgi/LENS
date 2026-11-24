import type { Request, Response } from "express";

import type {
  AnalyzeSourceRequest,
  YouTubeRecentVideo,
} from "../models/source.model";
import { SourceService } from "../services/source.service";
import { YouTubeSyncService } from "../services/youtube-sync.service";
import { YouTubeSyncStore } from "../services/youtube-sync.store";
import {
  TranscriptProcessingAdapter,
  transcriptInputSchema,
  VideoProcessingService,
} from "../services/video-processing.service";

const sourceService = new SourceService();
const youtubeSyncService = new YouTubeSyncService();
const youtubeSyncStore = new YouTubeSyncStore();

export async function listSources(_req: Request, res: Response): Promise<void> {
  const sources = await youtubeSyncStore.listSourceAccounts();

  res.status(200).json({
    sources,
  });
}

export async function analyzeSource(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as Partial<AnalyzeSourceRequest>;

  if (typeof body.url !== "string") {
    res.status(400).json({
      status: "invalid",
      message: "A source URL is required.",
    });
    return;
  }

  const result = await sourceService.analyzeUrl(body.url);

  if (
    result.platform === "youtube" &&
    result.type === "channel" &&
    result.status === "detected"
  ) {
    const sync = await youtubeSyncService.syncUrl(body.url);

    res.status(sync.status === "failed" ? 422 : 200).json({
      ...result,
      sync,
      metadataMessage: result.metadataMessage ?? sync.message,
    });

    return;
  }
  const statusCode =
    result.status === "invalid"
      ? 400
      : result.status === "unsupported"
        ? 422
        : 200;

  res.status(statusCode).json(result);
}

export async function syncYouTubeChannel(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as Partial<AnalyzeSourceRequest>;

  if (typeof body.url !== "string") {
    res.status(400).json({
      status: "invalid",
      message: "A channel URL is required.",
    });
    return;
  }

  const result = await youtubeSyncService.syncUrl(body.url);

  res.status(result.status === "failed" ? 422 : 200).json(result);
}

export async function listSourceVideos(
  req: Request,
  res: Response,
): Promise<void> {
  const sourceKey = req.params["sourceKey"];

  if (typeof sourceKey !== "string" || sourceKey.length === 0) {
    res.status(400).json({
      status: "invalid",
      message: "A source key is required.",
    });
    return;
  }

  const source = await youtubeSyncStore.getSourceAccount(sourceKey);

  if (!source) {
    res.status(404).json({
      status: "not-found",
      message: "Source not found.",
    });
    return;
  }

  const videos = await youtubeSyncStore.listSourceVideos(sourceKey);

  res.status(200).json({
    sourceKey,
    videos,
  });
}

export async function updateSourceVideoStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const sourceKey = req.params["sourceKey"];
  const videoId = req.params["videoId"];
  const body = req.body as {
    status?: YouTubeRecentVideo["status"];
  };

  if (
    typeof sourceKey !== "string" ||
    sourceKey.length === 0 ||
    typeof videoId !== "string" ||
    videoId.length === 0
  ) {
    res.status(400).json({
      status: "invalid",
      message: "A source key and video ID are required.",
    });
    return;
  }

  const validStatuses = ["skipped", "needs-review"] as const;

  if (
    typeof body.status !== "string" ||
    !validStatuses.includes(body.status as (typeof validStatuses)[number])
  ) {
    res.status(400).json({
      status: "invalid",
      message: "Status can only be changed to skipped or needs-review. Processing outcomes are managed by LENS.",
    });
    return;
  }

  const requestedStatus = body.status as (typeof validStatuses)[number];

  const source = await youtubeSyncStore.getSourceAccount(sourceKey);

  if (!source) {
    res.status(404).json({
      status: "not-found",
      message: "Source not found.",
    });
    return;
  }

  const transition = await youtubeSyncStore.transitionVideoStatus(
    videoId,
    sourceKey,
    requestedStatus,
  );

  if (transition === "not-found") {
    res.status(404).json({
      status: "not-found",
      message: "Video not found for this source.",
    });
    return;
  }

  if (transition === "conflict") {
    res.status(409).json({
      status: "conflict",
      message: "This status change is not allowed from the video's current state.",
    });
    return;
  }

  res.status(200).json({
    sourceKey,
    videoId,
    status: requestedStatus,
  });
}

export async function processSourceVideo(
  req: Request,
  res: Response,
): Promise<void> {
  const sourceKey = req.params["sourceKey"];
  const videoId = req.params["videoId"];
  const body = req.body as { transcript?: unknown };

  if (
    typeof sourceKey !== "string" ||
    sourceKey.length === 0 ||
    typeof videoId !== "string" ||
    videoId.length === 0
  ) {
    res.status(400).json({
      status: "invalid",
      message: "A source key and video ID are required.",
    });
    return;
  }

  const source = await youtubeSyncStore.getSourceAccount(sourceKey);

  if (!source) {
    res.status(404).json({
      status: "not-found",
      message: "Source not found.",
    });
    return;
  }

  const transcript = transcriptInputSchema.safeParse(body.transcript);

  if (!transcript.success) {
    res.status(400).json({
      status: "invalid",
      message: "Provide transcript text before processing this video.",
    });
    return;
  }

  const processingService = new VideoProcessingService(
    youtubeSyncStore,
    new TranscriptProcessingAdapter(transcript.data),
  );
  const outcome = await processingService.process(videoId, sourceKey);

  if (outcome.status === "not-found") {
    res.status(404).json({ status: outcome.status, message: "Video not found for this source." });
    return;
  }

  if (outcome.status === "conflict") {
    res.status(409).json({ status: outcome.status, message: "This video cannot be processed in its current state." });
    return;
  }

  if (outcome.status === "failed") {
    res.status(422).json({ ...outcome, sourceKey, videoId });
    return;
  }

  if (outcome.status !== "processed" && outcome.status !== "unchanged") {
    res.status(500).json({ status: "failed", message: "Unexpected processing outcome." });
    return;
  }

  res.status(200).json({
    sourceKey,
    videoId,
    status: outcome.status,
    attemptId: outcome.attemptId,
    versionId: outcome.versionId,
    claimCount: outcome.result.claims.length,
  });
}
