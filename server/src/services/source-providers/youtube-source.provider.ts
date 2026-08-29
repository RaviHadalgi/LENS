import type { ChannelMetadata, SourceMetadata } from '../../models/source.model';
import type {
  DetectedSource,
  SourceMetadataResult,
  SourceProvider,
} from './source-provider';

interface YouTubeOEmbedResponse {
  title?: unknown;
  author_name?: unknown;
  author_url?: unknown;
  thumbnail_url?: unknown;
  provider_name?: unknown;
}

interface YouTubeChannelApiResponse {
  items?: Array<{
    id?: unknown;
    snippet?: {
      title?: unknown;
      description?: unknown;
      customUrl?: unknown;
      publishedAt?: unknown;
      country?: unknown;
      thumbnails?: { high?: { url?: unknown }; medium?: { url?: unknown }; default?: { url?: unknown } };
    };
    contentDetails?: { relatedPlaylists?: { uploads?: unknown } };
    statistics?: {
      subscriberCount?: unknown;
      hiddenSubscriberCount?: unknown;
      videoCount?: unknown;
      viewCount?: unknown;
    };
  }>;
  error?: { errors?: Array<{ reason?: unknown }> };
}

type FetchImplementation = typeof fetch;

export interface YouTubeSourceProviderOptions {
  apiKey?: string;
  fetchImplementation?: FetchImplementation;
}

const OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';
const DATA_API_ENDPOINT = 'https://www.googleapis.com/youtube/v3/channels';
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Uses YouTube's official Data API for public channel details when the server
 * has YOUTUBE_DATA_API_KEY. oEmbed remains a keyless, video-only fallback.
 */
export class YouTubeSourceProvider implements SourceProvider {
  readonly platform = 'youtube' as const;
  private readonly apiKey: string | undefined;
  private readonly fetchImplementation: FetchImplementation;

  constructor(options: YouTubeSourceProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env['YOUTUBE_DATA_API_KEY'];
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async getMetadata(source: DetectedSource): Promise<SourceMetadataResult> {
    if (source.type === 'channel') {
      return this.getChannelMetadata(source);
    }

    if (source.type !== 'video') {
      return this.unavailable('This source type does not expose metadata through this provider.');
    }

    return this.getVideoMetadata(source);
  }

  private async getChannelMetadata(source: DetectedSource): Promise<SourceMetadataResult> {
    if (!source.channelLookup) {
      return this.unavailable('No usable channel reference was found in this URL.');
    }

    if (source.channelLookup.kind === 'custom-url') {
      return this.unavailable(
        'Legacy /c/ channel URLs cannot be resolved deterministically by the official API. Use the channel handle or /channel/ ID URL.',
      );
    }

    if (!this.apiKey) {
      return this.unavailable(
        'Channel details need the server-side YouTube Data API key. No end-user login is required.',
      );
    }

    const requestUrl = new URL(DATA_API_ENDPOINT);
    requestUrl.searchParams.set('part', 'snippet,contentDetails,statistics');
    requestUrl.searchParams.set('maxResults', '1');
    requestUrl.searchParams.set('key', this.apiKey);

    switch (source.channelLookup.kind) {
      case 'handle':
        requestUrl.searchParams.set('forHandle', source.channelLookup.value);
        break;
      case 'channel-id':
        requestUrl.searchParams.set('id', source.channelLookup.value);
        break;
      case 'username':
        requestUrl.searchParams.set('forUsername', source.channelLookup.value);
        break;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetchImplementation(requestUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json()) as YouTubeChannelApiResponse;

      if (!response.ok) {
        return this.unavailable(this.channelApiErrorMessage(response.status, payload));
      }

      const channel = this.toChannelMetadata(payload, source.url);
      return channel
        ? { status: 'available', metadata: null, channel, message: null }
        : this.unavailable('The channel was unavailable, private, or could not be found.');
    } catch {
      return this.unavailable('LENS could not reach the YouTube Data API. Try again later.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getVideoMetadata(source: DetectedSource): Promise<SourceMetadataResult> {

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const requestUrl = new URL(OEMBED_ENDPOINT);
      requestUrl.searchParams.set('url', source.url);
      requestUrl.searchParams.set('format', 'json');

      const response = await this.fetchImplementation(requestUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return this.unavailable('YouTube metadata is unavailable for this video.');
      }

      const payload = (await response.json()) as YouTubeOEmbedResponse;
      const metadata = this.toMetadata(payload);

      if (!metadata) {
        return this.unavailable('YouTube returned incomplete metadata for this video.');
      }

      return { status: 'available', metadata, channel: null, message: null };
    } catch {
      return this.unavailable(
        'LENS could not reach the public YouTube metadata service. Source detection still succeeded.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private toChannelMetadata(payload: YouTubeChannelApiResponse, sourceUrl: string): ChannelMetadata | null {
    const item = payload.items?.[0];
    if (!item || typeof item.id !== 'string' || typeof item.snippet?.title !== 'string') {
      return null;
    }

    const { snippet, statistics, contentDetails } = item;
    const name = snippet.title as string;
    const thumbnailUrl = [
      snippet.thumbnails?.high?.url,
      snippet.thumbnails?.medium?.url,
      snippet.thumbnails?.default?.url,
    ].find((url): url is string => typeof url === 'string') ?? null;

    return {
      platform: 'youtube', channelId: item.id,
      handle: typeof snippet.customUrl === 'string' && snippet.customUrl.startsWith('@') ? snippet.customUrl : null,
      name,
      description: typeof snippet.description === 'string' ? snippet.description : null,
      thumbnailUrl,
      subscriberCount: this.toNumber(statistics?.subscriberCount),
      hiddenSubscriberCount: typeof statistics?.hiddenSubscriberCount === 'boolean' ? statistics.hiddenSubscriberCount : null,
      videoCount: this.toNumber(statistics?.videoCount),
      viewCount: this.toNumber(statistics?.viewCount),
      country: typeof snippet.country === 'string' ? snippet.country : null,
      createdAt: typeof snippet.publishedAt === 'string' ? snippet.publishedAt : null,
      uploadsPlaylistId: typeof contentDetails?.relatedPlaylists?.uploads === 'string' ? contentDetails.relatedPlaylists.uploads : null,
      sourceUrl,
      provider: 'YouTube Data API v3',
      fetchedAt: new Date().toISOString(),
    };
  }

  private toMetadata(payload: YouTubeOEmbedResponse): SourceMetadata | null {
    if (
      typeof payload.title !== 'string' ||
      typeof payload.author_name !== 'string' ||
      typeof payload.author_url !== 'string'
    ) {
      return null;
    }

    return {
      title: payload.title,
      authorName: payload.author_name,
      authorUrl: payload.author_url,
      thumbnailUrl:
        typeof payload.thumbnail_url === 'string' ? payload.thumbnail_url : null,
      providerName:
        typeof payload.provider_name === 'string' ? payload.provider_name : 'YouTube',
    };
  }

  private toNumber(value: unknown): number | null {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      return null;
    }

    const numberValue = Number(value);
    return Number.isSafeInteger(numberValue) ? numberValue : null;
  }

  private channelApiErrorMessage(status: number, payload: YouTubeChannelApiResponse): string {
    const reasons = payload.error?.errors
      ?.map((error) => error.reason)
      .filter((reason): reason is string => typeof reason === 'string');

    if (status === 429 || reasons?.includes('quotaExceeded') || reasons?.includes('dailyLimitExceeded')) {
      return 'The YouTube Data API quota or rate limit was reached. Try again later.';
    }

    if (status === 403 && reasons?.includes('keyInvalid')) {
      return 'The server-side YouTube Data API key is invalid or not enabled for this API.';
    }

    return 'The YouTube Data API could not retrieve this channel.';
  }

  private unavailable(message: string): SourceMetadataResult {
    return { status: 'unavailable', metadata: null, channel: null, message };
  }
}
