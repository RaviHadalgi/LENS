import type {
  AnalyzeSourceResponse,
  SourceType,
} from '../models/source.model';

export class SourceService {
  analyzeUrl(url: string): AnalyzeSourceResponse {
    const normalizedUrl = url.trim();

    if (!normalizedUrl) {
      return {
        platform: 'unknown',
        type: 'unknown',
        url: normalizedUrl,
        externalId: null,
        status: 'invalid',
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
      };
    }

    const result = this.detectYouTubeSource(parsedUrl);

    return {
      platform: 'youtube',
      type: result.type,
      url: normalizedUrl,
      externalId: result.externalId,
      status: 'detected',
    };
  }

  private detectYouTubeSource(url: URL): {
    type: SourceType | 'unknown';
    externalId: string | null;
  } {
    const hostname = url.hostname.toLowerCase();

    if (hostname === 'youtu.be') {
      const videoId = url.pathname.replace('/', '').trim();

      return {
        type: videoId ? 'video' : 'unknown',
        externalId: videoId || null,
      };
    }

    const playlistId = url.searchParams.get('list');

    if (playlistId) {
      return {
        type: 'playlist',
        externalId: playlistId,
      };
    }

    const videoId = url.searchParams.get('v');

    if (videoId) {
      return {
        type: 'video',
        externalId: videoId,
      };
    }

    const handleMatch = url.pathname.match(
      /^\/(@[^/]+)(?:\/)?$/,
    );

    if (handleMatch) {
      return {
        type: 'channel',
        externalId: handleMatch[1],
      };
    }

    const channelMatch = url.pathname.match(
      /^\/channel\/([^/]+)(?:\/)?$/,
    );

    if (channelMatch) {
      return {
        type: 'channel',
        externalId: channelMatch[1],
      };
    }

    return {
      type: 'unknown',
      externalId: null,
    };
  }
}