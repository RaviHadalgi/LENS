import type { Request, Response } from "express";

import type { AnalyzeSourceRequest } from "../models/source.model";
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
  const sourceKey = req.params['sourceKey'];

  if (typeof sourceKey !== 'string' || sourceKey.length === 0) {
    res.status(400).json({
      status: 'invalid',
      message: 'A source key is required.',
    });
    return;
  }

  const source = await youtubeSyncStore.getSourceAccount(sourceKey);

  if (!source) {
    res.status(404).json({
      status: 'not-found',
      message: 'Source not found.',
    });
    return;
  }

  const videos = await youtubeSyncStore.listSourceVideos(sourceKey);

  res.status(200).json({
    sourceKey,
    videos,
  });
}


