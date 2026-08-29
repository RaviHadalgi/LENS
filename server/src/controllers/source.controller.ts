import type { Request, Response } from 'express';

import type { AnalyzeSourceRequest } from '../models/source.model';
import { SourceService } from '../services/source.service';

const sourceService = new SourceService();

export async function analyzeSource(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as Partial<AnalyzeSourceRequest>;

  if (typeof body.url !== 'string') {
    res.status(400).json({
      status: 'invalid',
      message: 'A source URL is required.',
    });

    return;
  }

  const result = await sourceService.analyzeUrl(body.url);

  const statusCode =
    result.status === 'invalid'
      ? 400
      : result.status === 'unsupported'
        ? 422
        : 200;

  res.status(statusCode).json(result);
}
