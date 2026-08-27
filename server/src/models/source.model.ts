export type SourceType = 'channel' | 'playlist' | 'video';

export interface AnalyzeSourceRequest {
  url: string;
}

export interface AnalyzeSourceResponse {
  platform: 'youtube' | 'unknown';
  type: SourceType | 'unknown';
  url: string;
  externalId: string | null;
  status: 'detected' | 'unsupported' | 'invalid';
}