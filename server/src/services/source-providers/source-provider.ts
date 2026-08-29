import type {
  ChannelMetadata,
  SourceMetadata,
  SourceMetadataStatus,
  SourceType,
  YouTubeRecentVideo,
} from '../../models/source.model';

export type YouTubeChannelLookup =
  | { kind: 'handle'; value: string }
  | { kind: 'channel-id'; value: string }
  | { kind: 'username'; value: string }
  | { kind: 'custom-url'; value: string }
  | null;

export interface DetectedSource {
  platform: 'youtube';
  type: SourceType | 'unknown';
  url: string;
  externalId: string | null;
  channelLookup: YouTubeChannelLookup;
}

export interface SourceMetadataResult {
  status: SourceMetadataStatus;
  metadata: SourceMetadata | null;
  channel: ChannelMetadata | null;
  message: string | null;
}

export interface YouTubeSyncResult {
  status: 'completed' | 'needs-review' | 'failed';
  channelId: string | null;
  handle: string | null;
  channelUrl: string;
  feedUrl: string | null;
  videos: YouTubeRecentVideo[];
  message: string | null;
}

export interface SourceProvider {
  readonly platform: DetectedSource['platform'];

  getMetadata(source: DetectedSource): Promise<SourceMetadataResult>;

  syncChannel?(source: DetectedSource, state: import('../../models/source.model').YouTubeSyncState | null): Promise<YouTubeSyncResult>;
}

export interface YouTubeChannelResolution {
  channelId: string | null;
  handle: string | null;
  channelUrl: string;
  message: string | null;
}

export interface SourceProvider {
  readonly platform: DetectedSource['platform'];

  getMetadata(source: DetectedSource): Promise<SourceMetadataResult>;

  resolveChannel?(
    source: DetectedSource,
  ): Promise<YouTubeChannelResolution>;

  syncChannel?(
    source: DetectedSource,
    state: import('../../models/source.model').YouTubeSyncState | null,
  ): Promise<YouTubeSyncResult>;
}