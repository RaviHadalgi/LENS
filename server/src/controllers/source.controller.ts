import type { Request, Response } from "express";

import type {
  AnalyzeSourceRequest,
  YouTubeRecentVideo,
} from "../models/source.model";
import { SourceService } from "../services/source.service";
import { YouTubeSyncService } from "../services/youtube-sync.service";
import { YouTubeSyncStore } from "../services/youtube-sync.store";

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

  const validStatuses = [
    "discovered",
    "skipped",
    "processed",
    "failed",
    "needs-review",
    "processing",
  ] as const;

  if (
    typeof body.status !== "string" ||
    !validStatuses.includes(body.status as (typeof validStatuses)[number])
  ) {
    res.status(400).json({
      status: "invalid",
      message: "A valid video status is required.",
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

  const updated = await youtubeSyncService.updateVideoStatus(
    videoId,
    sourceKey,
    body.status,
  );

  if (!updated) {
    res.status(404).json({
      status: "not-found",
      message: "Video not found for this source.",
    });
    return;
  }

  res.status(200).json({
    sourceKey,
    videoId,
    status: body.status,
  });
}

export async function processSourceVideo(
  req: Request,
  res: Response,
): Promise<void> {
  const sourceKey = req.params["sourceKey"];
  const videoId = req.params["videoId"];

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

  const processed = await youtubeSyncService.processVideo(videoId, sourceKey);

  if (!processed) {
    res.status(404).json({
      status: "not-found",
      message: "Video not found for this source.",
    });
    return;
  }

  res.status(200).json({
    sourceKey,
    videoId,
    status: "processing",
  });
}
