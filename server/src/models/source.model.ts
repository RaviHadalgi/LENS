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

/**
 * Provider-independent public channel information. Counts can be absent when
 * YouTube does not expose them, so they are nullable rather than invented.
 */
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

/**
 * A draft based only on data returned by the supplied source. It is never a
 * credential or identity verification result.
 */
export interface CreatorIdentityDraft {
  displayName: string;
  profileUrl: string | null;
  status: 'needs-review';
  basis: string;
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
