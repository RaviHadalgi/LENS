export type SourceType = 'channel' | 'playlist' | 'video';

export type SourceMetadataStatus =
  | 'available'
  | 'unavailable'
  | 'not-requested';

export interface SourceMetadata {
  title: string;
  authorName: string;
  authorUrl: string;
  thumbnailUrl: string | null;
  providerName: string;
}

export interface ChannelMetadata {
  platform: 'youtube';
  channelId: string;
  handle: string | null;
  name: string;
  description: string | null;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  hiddenSubscriberCount: boolean | null;
  videoCount: number | null;
  viewCount: number | null;
  country: string | null;
  createdAt: string | null;
  uploadsPlaylistId: string | null;
  sourceUrl: string;
  provider: string;
  fetchedAt: string;
}

export interface CreatorIdentityDraft {
  displayName: string;
  profileUrl: string | null;
  status: 'needs-review';
  basis: string;
}

export interface YouTubeRecentVideo {
  videoId: string;
  title: string | null;
  url: string;
  publishedAt: string | null;
  discoveredAt?: string;
  status?: 'discovered' | 'skipped' | 'processed' | 'failed' | 'needs-review';
}

export interface YouTubeSyncState {
  sourceId: string;
  channelId: string;
  channelUrl: string;
  handle: string | null;
  lastCheckedAt: string | null;
  lastSuccessfulSyncAt: string | null;
}

export interface AnalyzeSourceRequest {
  url: string;
}

export interface AnalyzeSourceResponse {
  platform: 'youtube' | 'unknown';
  type: SourceType | 'unknown';
  url: string;
  externalId: string | null;
  status: 'detected' | 'unsupported' | 'invalid';
  metadataStatus: SourceMetadataStatus;
  metadata: SourceMetadata | null;
  metadataMessage: string | null;
  channel: ChannelMetadata | null;
  creatorIdentity: CreatorIdentityDraft | null;
}

export interface YouTubeSyncResponse {
  platform: 'youtube';
  type: 'channel';
  url: string;
  channelId: string | null;
  handle: string | null;
  feedUrl: string | null;
  status: 'completed' | 'needs-review' | 'failed';
  sync: YouTubeSyncState | null;
  discovered: YouTubeRecentVideo[];
  skipped: YouTubeRecentVideo[];
  newVideos: YouTubeRecentVideo[];
  message: string | null;
}
export interface AnalyzeSourceResponse {
  platform: 'youtube' | 'unknown';
  type: SourceType | 'unknown';
  url: string;
  externalId: string | null;
  status: 'detected' | 'unsupported' | 'invalid';
  metadataStatus: SourceMetadataStatus;
  metadata: SourceMetadata | null;
  metadataMessage: string | null;
  channel: ChannelMetadata | null;
  creatorIdentity: CreatorIdentityDraft | null;
  sync?: YouTubeSyncResponse | null;
}