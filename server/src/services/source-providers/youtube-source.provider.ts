import type {
  SourceMetadata,
  YouTubeRecentVideo,
  YouTubeSyncState,
} from "../../models/source.model";
import type {
  DetectedSource,
  SourceMetadataResult,
  SourceProvider,
  YouTubeChannelResolution,
  YouTubeSyncResult,
} from "./source-provider";

type FetchImplementation = typeof fetch;

interface YouTubeOEmbedResponse {
  title?: unknown;
  author_name?: unknown;
  author_url?: unknown;
  thumbnail_url?: unknown;
  provider_name?: unknown;
}

interface AtomEntry {
  videoId: string;
  title: string | null;
  publishedAt: string | null;
}

export interface YouTubeSourceProviderOptions {
  fetchImplementation?: FetchImplementation;
  now?: () => Date;
}

const OEMBED_ENDPOINT = "https://www.youtube.com/oembed";
const RSS_ENDPOINT = "https://www.youtube.com/feeds/videos.xml";
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * YouTube provider using only YouTube's public oEmbed and channel Atom feed.
 * Channel RSS requires the stable channel ID; handle/custom URLs are retained
 * but cannot be converted to a channel ID without another public resolver.
 */
export class YouTubeSourceProvider implements SourceProvider {
  readonly platform = "youtube" as const;
  private readonly fetchImplementation: FetchImplementation;

  constructor(options: YouTubeSourceProviderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async getMetadata(source: DetectedSource): Promise<SourceMetadataResult> {
    if (source.type === "channel") {
      return this.unavailable(
        "Channel profile metadata is not resolved from RSS alone. Use channel sync for video discovery.",
      );
    }

    if (source.type !== "video") {
      return this.unavailable(
        "This source type does not expose metadata through this provider.",
      );
    }

    return this.getVideoMetadata(source);
  }

  async syncChannel(
    source: DetectedSource,
    state: YouTubeSyncState | null,
  ): Promise<YouTubeSyncResult> {
    if (source.type !== "channel" || !source.channelLookup) {
      return this.failedSync(source.url, "A YouTube channel URL is required.");
    }

    if (source.channelLookup.kind !== "channel-id") {
      return {
        status: "needs-review",
        channelId: state?.channelId ?? null,
        handle: state?.handle ?? null,
        channelUrl: source.url,
        feedUrl: state?.channelId ? this.feedUrl(state.channelId) : null,
        videos: [],
        message:
          "The public YouTube Atom feed requires a channel ID. A handle/custom/legacy URL can be retained, but resolving its channel ID requires a separate YouTube resolver, which is intentionally outside this RSS-only step.",
      };
    }

    const channelId = source.channelLookup.value;
    const feedUrl = this.feedUrl(channelId);
    const entries = await this.fetchFeed(feedUrl);

    if (!entries) {
      return this.failedSync(
        source.url,
        "The YouTube public channel feed could not be retrieved or parsed.",
      );
    }

    const videos = entries.map((entry) => this.toRecentVideo(entry));

    return {
      status: "completed",
      channelId,
      handle: state?.handle ?? null,
      channelUrl: source.url,
      feedUrl,
      videos,
      message: videos.length
        ? null
        : "The channel feed returned no video entries.",
    };
  }

  private async getVideoMetadata(
    source: DetectedSource,
  ): Promise<SourceMetadataResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const requestUrl = new URL(OEMBED_ENDPOINT);
      requestUrl.searchParams.set("url", source.url);
      requestUrl.searchParams.set("format", "json");
      const response = await this.fetchImplementation(requestUrl, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        return this.unavailable(
          "YouTube metadata is unavailable for this video.",
        );
      }

      const payload = (await response.json()) as YouTubeOEmbedResponse;
      const metadata = this.toMetadata(payload);
      return metadata
        ? { status: "available", metadata, channel: null, message: null }
        : this.unavailable(
            "YouTube returned incomplete metadata for this video.",
          );
    } catch {
      return this.unavailable(
        "LENS could not reach the public YouTube metadata endpoint.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchFeed(feedUrl: string): Promise<AtomEntry[] | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetchImplementation(feedUrl, {
        signal: controller.signal,
        headers: { Accept: "application/atom+xml, application/xml, text/xml" },
      });

      if (!response.ok) return null;
      const xml = await response.text();
      return this.parseAtomFeed(xml);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseAtomFeed(xml: string): AtomEntry[] | null {
    const normalized = xml.replace(/^\uFEFF/, "").trim();

    // XML declarations, comments, and whitespace may appear before <feed>.
    const feedStart = normalized.search(/<feed\b/i);
    if (feedStart < 0) return null;

    const feedXml = normalized.slice(feedStart);

    if (!/^<feed\b[^>]*>/i.test(feedXml)) return null;
    if (!/<\/feed>\s*$/i.test(feedXml)) return null;

    const entries = [
      ...feedXml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi),
    ];

    return entries.flatMap((match) => {
      const body = match[1] ?? "";
      const videoId = this.readTag(body, "yt:videoId");

      if (!videoId) return [];

      return [
        {
          videoId,
          title: this.readTag(body, "title"),
          publishedAt: this.readTag(body, "published"),
        },
      ];
    });
  }

  private readTag(xml: string, tagName: string): string | null {
    const escaped = tagName.replace(":", "\\:");
    const match = xml.match(
      new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"),
    );
    if (!match?.[1]) return null;
    return this.decodeXml(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim());
  }

  private decodeXml(value: string): string {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  private feedUrl(channelId: string): string {
    const url = new URL(RSS_ENDPOINT);
    url.searchParams.set("channel_id", channelId);
    return url.toString();
  }

  private toRecentVideo(entry: AtomEntry): YouTubeRecentVideo {
    return {
      videoId: entry.videoId,
      title: entry.title,
      url: `https://www.youtube.com/watch?v=${entry.videoId}`,
      publishedAt: entry.publishedAt,
    };
  }

  private toMetadata(payload: YouTubeOEmbedResponse): SourceMetadata | null {
    if (
      typeof payload.title !== "string" ||
      typeof payload.author_name !== "string" ||
      typeof payload.author_url !== "string"
    )
      return null;

    return {
      title: payload.title,
      authorName: payload.author_name,
      authorUrl: payload.author_url,
      thumbnailUrl:
        typeof payload.thumbnail_url === "string"
          ? payload.thumbnail_url
          : null,
      providerName:
        typeof payload.provider_name === "string"
          ? payload.provider_name
          : "YouTube",
    };
  }

  private unavailable(message: string): SourceMetadataResult {
    return { status: "unavailable", metadata: null, channel: null, message };
  }

  private failedSync(channelUrl: string, message: string): YouTubeSyncResult {
    return {
      status: "failed",
      channelId: null,
      handle: null,
      channelUrl,
      feedUrl: null,
      videos: [],
      message,
    };
  }

  async resolveChannel(
    source: DetectedSource,
  ): Promise<YouTubeChannelResolution> {
    if (source.type !== "channel" || !source.channelLookup) {
      return {
        channelId: null,
        handle: null,
        channelUrl: source.url,
        message: "A YouTube channel URL is required.",
      };
    }

    if (source.channelLookup.kind === "channel-id") {
      return {
        channelId: source.channelLookup.value,
        handle: null,
        channelUrl: source.url,
        message: null,
      };
    }

    if (source.channelLookup.kind !== "handle") {
      return {
        channelId: null,
        handle: null,
        channelUrl: source.url,
        message:
          "Only YouTube channel handles and channel ID URLs can be resolved using the public YouTube page.",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await this.fetchImplementation(source.url, {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        },
      });

      if (!response.ok) {
        return {
          channelId: null,
          handle: source.channelLookup.value,
          channelUrl: source.url,
          message: `YouTube channel page returned HTTP ${response.status}.`,
        };
      }

      const html = await response.text();
      const channelId = this.extractChannelId(html);

      if (!channelId) {
        return {
          channelId: null,
          handle: source.channelLookup.value,
          channelUrl: source.url,
          message:
            "The public YouTube channel page did not expose a channel ID.",
        };
      }

      return {
        channelId,
        handle: source.channelLookup.value,
        channelUrl: source.url,
        message: null,
      };
    } catch {
      return {
        channelId: null,
        handle: source.channelLookup.value,
        channelUrl: source.url,
        message: "LENS could not reach the public YouTube channel page.",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractChannelId(html: string): string | null {
    const patterns = [
      /<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[a-zA-Z0-9_-]{20,})["']/i,
      /"channelId"\s*:\s*"((?:UC)[a-zA-Z0-9_-]{20,})"/,
      /\\"channelId\\"\s*:\s*\\"((?:UC)[a-zA-Z0-9_-]{20,})\\"/,
      /"externalId"\s*:\s*"((?:UC)[a-zA-Z0-9_-]{20,})"/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);

      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }
}
