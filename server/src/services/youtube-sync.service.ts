import type { YouTubeRecentVideo, YouTubeSyncResponse } from '../models/source.model';
import { SourceProviderRegistry } from './source-providers/source-provider-registry';
import type { SourceProvider } from './source-providers/source-provider';
import type { YouTubeChannelLookup } from './source-providers/source-provider';
import { YouTubeSourceProvider } from './source-providers/youtube-source.provider';
import { YouTubeSyncStore } from './youtube-sync.store';

export class YouTubeSyncService {
  private readonly providerRegistry: SourceProviderRegistry;

  constructor(
    private readonly store = new YouTubeSyncStore(),
    providers: SourceProvider[] = [new YouTubeSourceProvider()],
  ) {
    this.providerRegistry = new SourceProviderRegistry(providers);
  }

  async syncUrl(url: string): Promise<YouTubeSyncResponse> {
    const normalizedUrl = url.trim();
    let parsed: URL;

    try {
      parsed = new URL(normalizedUrl);
    } catch {
      return this.failed(normalizedUrl, 'Invalid URL.');
    }

    const detection = this.detectChannel(parsed);
    if (!detection || !detection.channelLookup) {
      return this.failed(normalizedUrl, 'Use a YouTube channel URL.');
    }

    const sourceId = this.sourceId(detection.channelLookup, normalizedUrl);
    const previous = await this.store.getSource(sourceId);
    const checkedAt = new Date().toISOString();

    const baseState = {
      sourceId,
      channelId: previous?.channelId ?? (detection.channelLookup.kind === 'channel-id' ? detection.channelLookup.value : ''),
      channelUrl: normalizedUrl,
      handle: detection.channelLookup.kind === 'handle'
        ? detection.channelLookup.value
        : previous?.handle ?? null,
      lastCheckedAt: checkedAt,
      lastSuccessfulSyncAt: previous?.lastSuccessfulSyncAt ?? null,
    };

    await this.store.upsertSource({
      ...baseState,
      channelId: baseState.channelId || previous?.channelId || '',
    });

const detectedSource = {
  platform: 'youtube' as const,
  type: 'channel' as const,
  url: normalizedUrl,
  externalId: detection.externalId,
  channelLookup: detection.channelLookup,
};

let resolvedSource = detectedSource;

if (
  detection.channelLookup.kind !== 'channel-id'
) {
  const resolution = await this.providerRegistry.resolveChannel(
    detectedSource,
  );

  if (!resolution.channelId) {
    return {
      platform: 'youtube',
      type: 'channel',
      url: normalizedUrl,
      channelId: null,
      handle: resolution.handle,
      feedUrl: null,
      status: 'needs-review',
      sync: await this.store.getSource(sourceId),
      discovered: [],
      skipped: [],
      newVideos: [],
      message: resolution.message,
    };
  }

  resolvedSource = {
    ...detectedSource,
    externalId: resolution.channelId,
    channelLookup: {
      kind: 'channel-id',
      value: resolution.channelId,
    },
  };
}

const result = await this.providerRegistry.syncChannel(
  resolvedSource,
  previous,
);

    if (result.status !== 'completed' || !result.channelId) {
      const status = result.status === 'completed' ? 'needs-review' : result.status;
      return {
        platform: 'youtube',
        type: 'channel',
        url: normalizedUrl,
        channelId: result.channelId,
        handle: result.handle,
        feedUrl: result.feedUrl,
        status,
        sync: await this.store.getSource(sourceId),
        discovered: [],
        skipped: [],
        newVideos: [],
        message: result.message ?? (
          result.status === 'completed'
            ? 'Channel ID could not be resolved, so the public YouTube feed cannot be synchronized.'
            : null
        ),
      };
    }

    const discovered: YouTubeRecentVideo[] = [];
    const skipped: YouTubeRecentVideo[] = [];

    try {
      for (const video of result.videos) {
        if (await this.store.hasVideo(video.videoId)) {
          skipped.push({ ...video, status: 'skipped' });
          // YouTube's feed is a recent, newest-first discovery surface. Once a
          // previously known video is reached, older entries are not scanned.
          break;
        }

        const discoveredVideo = {
          ...video,
          discoveredAt: checkedAt,
          status: 'discovered' as const,
        };
        await this.store.upsertVideo(discoveredVideo);
        discovered.push(discoveredVideo);
      }
    } catch {
      return {
        platform: 'youtube', type: 'channel', url: normalizedUrl,
        channelId: result.channelId, handle: result.handle, feedUrl: result.feedUrl,
        status: 'failed', sync: await this.store.getSource(sourceId),
        discovered, skipped, newVideos: discovered,
        message: 'The sync was interrupted while persisting discovered videos. The successful sync boundary was not advanced.',
      };
    }

    const successfulState = {
      ...baseState,
      channelId: result.channelId,
      handle: result.handle ?? baseState.handle,
      lastSuccessfulSyncAt: checkedAt,
    };
    await this.store.upsertSource(successfulState);

    return {
      platform: 'youtube', type: 'channel', url: normalizedUrl,
      channelId: result.channelId,
      handle: successfulState.handle,
      feedUrl: result.feedUrl,
      status: 'completed',
      sync: successfulState,
      discovered,
      skipped,
      newVideos: discovered,
      message: result.message,
    };
  }

  private detectChannel(url: URL): {
    externalId: string;
    channelLookup: YouTubeChannelLookup;
  } | null {
    const hostname = url.hostname.toLowerCase();
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(hostname)) return null;

    const handle = url.pathname.match(/^\/@([^/]+)\/?$/);
    if (handle) {
      return { externalId: `@${handle[1]}`, channelLookup: { kind: 'handle', value: `@${handle[1]}` } };
    }

    const channelId = url.pathname.match(/^\/channel\/([^/]+)\/?$/);
    if (channelId) {
      return { externalId: channelId[1], channelLookup: { kind: 'channel-id', value: channelId[1] } };
    }

    const custom = url.pathname.match(/^\/c\/([^/]+)\/?$/);
    if (custom) {
      return { externalId: custom[1], channelLookup: { kind: 'custom-url', value: custom[1] } };
    }

    const username = url.pathname.match(/^\/user\/([^/]+)\/?$/);
    if (username) {
      return { externalId: username[1], channelLookup: { kind: 'username', value: username[1] } };
    }

    return null;
  }

  private sourceId(lookup: YouTubeChannelLookup, url: string): string {
    if (lookup) return `youtube:${lookup.kind}:${lookup.value.toLowerCase()}`;
    return `youtube:url:${url.toLowerCase()}`;
  }

  private failed(url: string, message: string): YouTubeSyncResponse {
    return {
      platform: 'youtube', type: 'channel', url, channelId: null, handle: null,
      feedUrl: null, status: 'failed', sync: null,
      discovered: [], skipped: [], newVideos: [], message,
    };
  }
}
