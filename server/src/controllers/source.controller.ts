import type { Request, Response } from 'express';

import type { AnalyzeSourceRequest } from '../models/source.model';
import { SourceService } from '../services/source.service';
import { YouTubeSyncService } from '../services/youtube-sync.service';

const sourceService = new SourceService();
const youtubeSyncService = new YouTubeSyncService();


export async function analyzeSource(req: Request, res: Response): Promise<void> {
  const body = req.body as Partial<AnalyzeSourceRequest>;
  if (typeof body.url !== 'string') {
    res.status(400).json({ status: 'invalid', message: 'A source URL is required.' });
    return;
  }

  const result = await sourceService.analyzeUrl(body.url);
  if (
  result.platform === 'youtube' &&
  result.type === 'channel' &&
  result.status === 'detected'
) {
  const sync = await youtubeSyncService.syncUrl(body.url);

  res.status(sync.status === 'failed' ? 422 : 200).json({
    ...result,
    sync,
    metadataStatus:
      result.metadataStatus === 'available'
        ? result.metadataStatus
        : 'unavailable',
    metadataMessage:
      result.metadataMessage ??
      sync.message,
    channel: null,
    creatorIdentity: null,
  });

  return;
}
  const statusCode = result.status === 'invalid' ? 400 : result.status === 'unsupported' ? 422 : 200;
  res.status(statusCode).json(result);
}

export async function syncYouTubeChannel(req: Request, res: Response): Promise<void> {
  const body = req.body as Partial<AnalyzeSourceRequest>;
  if (typeof body.url !== 'string') {
    res.status(400).json({ status: 'invalid', message: 'A channel URL is required.' });
    return;
  }

  const result = await youtubeSyncService.syncUrl(body.url);
  res.status(result.status === 'failed' ? 422 : 200).json(result);
}
