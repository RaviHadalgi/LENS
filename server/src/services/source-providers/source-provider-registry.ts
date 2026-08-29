import type {
  DetectedSource,
  SourceMetadataResult,
  SourceProvider,
  YouTubeChannelResolution,
  YouTubeSyncResult,
} from './source-provider';
import type { YouTubeSyncState } from '../../models/source.model';

export class SourceProviderRegistry {
  constructor(private readonly providers: SourceProvider[]) {}

  getMetadata(source: DetectedSource): Promise<SourceMetadataResult> {
    const provider = this.providers.find(
      (candidate) => candidate.platform === source.platform,
    );

    if (!provider) {
      return Promise.resolve({
        status: 'not-requested',
        metadata: null,
        channel: null,
        message: `No metadata provider is configured for ${source.platform}.`,
      });
    }

    return provider.getMetadata(source);
  }

  syncChannel(
    source: DetectedSource,
    state: YouTubeSyncState | null,
  ): Promise<YouTubeSyncResult> {
    const provider = this.providers.find(
      (candidate) => candidate.platform === source.platform,
    );

    if (!provider?.syncChannel) {
      return Promise.resolve({
        status: 'failed',
        channelId: null,
        handle: null,
        channelUrl: source.url,
        feedUrl: null,
        videos: [],
        message: `No channel sync provider is configured for ${source.platform}.`,
      });
    }

    return provider.syncChannel(source, state);
  }

  resolveChannel(
  source: DetectedSource,
): Promise<YouTubeChannelResolution> {
  const provider = this.providers.find(
    (candidate) => candidate.platform === source.platform,
  );

  if (!provider?.resolveChannel) {
    return Promise.resolve({
      channelId: null,
      handle: null,
      channelUrl: source.url,
      message: `No channel resolver is configured for ${source.platform}.`,
    });
  }

  return provider.resolveChannel(source);
}
}
