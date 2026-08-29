import type {
  AnalyzeSourceResponse,
  ChannelMetadata,
  CreatorIdentityDraft,
  SourceMetadata,
  SourceType,
} from '../models/source.model';
import { SourceProviderRegistry } from './source-providers/source-provider-registry';
import type { YouTubeChannelLookup } from './source-providers/source-provider';
import { YouTubeSourceProvider } from './source-providers/youtube-source.provider';

const providerRegistry = new SourceProviderRegistry([new YouTubeSourceProvider()]);

export class SourceService {
  async analyzeUrl(url: string): Promise<AnalyzeSourceResponse> {
    const normalizedUrl = url.trim();

    if (!normalizedUrl) {
      return {
        platform: 'unknown',
        type: 'unknown',
        url: normalizedUrl,
        externalId: null,
        status: 'invalid',
        metadataStatus: 'not-requested',
        metadata: null,
        metadataMessage: null,
        channel: null,
        creatorIdentity: null,
      };
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return {
        platform: 'unknown',
        type: 'unknown',
        url: normalizedUrl,
        externalId: null,
        status: 'invalid',
        metadataStatus: 'not-requested',
        metadata: null,
        metadataMessage: null,
        channel: null,
        creatorIdentity: null,
      };
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    const isYouTube =
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'youtu.be';

    if (!isYouTube) {
      return {
        platform: 'unknown',
        type: 'unknown',
        url: normalizedUrl,
        externalId: null,
        status: 'unsupported',
        metadataStatus: 'not-requested',
        metadata: null,
        metadataMessage: null,
        channel: null,
        creatorIdentity: null,
      };
    }

    const result = this.detectYouTubeSource(parsedUrl);

    if (result.type === 'unknown') {
      return {
        platform: 'youtube',
        type: 'unknown',
        url: normalizedUrl,
        externalId: null,
        status: 'invalid',
        metadataStatus: 'not-requested',
        metadata: null,
        metadataMessage: 'Use a YouTube channel, playlist, or video URL.',
        channel: null,
        creatorIdentity: null,
      };
    }

    const detectedSource = {
      platform: 'youtube',
      type: result.type,
      url: normalizedUrl,
      externalId: result.externalId,
      channelLookup: result.channelLookup,
    } as const;

    const metadataResult = await providerRegistry.getMetadata(detectedSource);

    return {
      ...detectedSource,
      status: 'detected',
      metadataStatus: metadataResult.status,
      metadata: metadataResult.metadata,
      metadataMessage: metadataResult.message,
      channel: metadataResult.channel,
      creatorIdentity: this.createIdentityDraft(
        detectedSource,
        metadataResult.metadata,
        metadataResult.channel,
      ),
    };
  }

  private createIdentityDraft(
    source: {
      type: SourceType | 'unknown';
      url: string;
      externalId: string | null;
    },
    metadata: SourceMetadata | null,
    channel: ChannelMetadata | null,
  ): CreatorIdentityDraft {
    if (metadata) {
      return {
        displayName: metadata.authorName,
        profileUrl: metadata.authorUrl,
        status: 'needs-review',
        basis: `Public ${metadata.providerName} metadata for the supplied video.`,
      };
    }

    if (channel) {
      return {
        displayName: channel.name,
        profileUrl: channel.sourceUrl,
        status: 'needs-review',
        basis: `Public channel metadata from ${channel.provider}; no independent verification performed.`,
      };
    }

    if (source.type === 'channel' && source.externalId?.startsWith('@')) {
      return {
        displayName: source.externalId,
        profileUrl: source.url,
        status: 'needs-review',
        basis: 'Channel handle from the supplied URL; no independent verification performed.',
      };
    }

    return {
      displayName: 'Creator identity not yet resolved',
      profileUrl: null,
      status: 'needs-review',
      basis: 'The supplied source did not return creator metadata.',
    };
  }

  private detectYouTubeSource(url: URL): {
    type: SourceType | 'unknown';
    externalId: string | null;
    channelLookup: YouTubeChannelLookup;
  } {
    const hostname = url.hostname.toLowerCase();

    if (hostname === 'youtu.be') {
      const videoId = url.pathname.replace('/', '').trim();

      return {
        type: videoId ? 'video' : 'unknown',
        externalId: videoId || null,
        channelLookup: null,
      };
    }

    const playlistId = url.searchParams.get('list');

    if (playlistId) {
      return {
        type: 'playlist',
        externalId: playlistId,
        channelLookup: null,
      };
    }

    const videoId = url.searchParams.get('v');

    if (videoId) {
      return {
        type: 'video',
        externalId: videoId,
        channelLookup: null,
      };
    }

    const handleMatch = url.pathname.match(
      /^\/(@[^/]+)(?:\/)?$/,
    );

    if (handleMatch) {
      return {
        type: 'channel',
        externalId: handleMatch[1],
        channelLookup: { kind: 'handle', value: handleMatch[1] },
      };
    }

    const channelMatch = url.pathname.match(
      /^\/channel\/([^/]+)(?:\/)?$/,
    );

    if (channelMatch) {
      return {
        type: 'channel',
        externalId: channelMatch[1],
        channelLookup: { kind: 'channel-id', value: channelMatch[1] },
      };
    }

    const customUrlMatch = url.pathname.match(/^\/c\/([^/]+)(?:\/)?$/);

    if (customUrlMatch) {
      return {
        type: 'channel',
        externalId: customUrlMatch[1],
        channelLookup: { kind: 'custom-url', value: customUrlMatch[1] },
      };
    }

    const usernameMatch = url.pathname.match(/^\/user\/([^/]+)(?:\/)?$/);

    if (usernameMatch) {
      return {
        type: 'channel',
        externalId: usernameMatch[1],
        channelLookup: { kind: 'username', value: usernameMatch[1] },
      };
    }

    return {
      type: 'unknown',
      externalId: null,
      channelLookup: null,
    };
  }
}
