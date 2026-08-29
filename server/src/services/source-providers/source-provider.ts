import type {
  ChannelMetadata,
  SourceMetadata,
  SourceMetadataStatus,
  SourceType,
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

/**
 * A provider owns platform-specific metadata retrieval. It deliberately does
 * not own persistence or ingestion so another permitted YouTube provider can
 * replace it without changing the source API.
 */
export interface SourceProvider {
  readonly platform: DetectedSource['platform'];

  getMetadata(source: DetectedSource): Promise<SourceMetadataResult>;
}
