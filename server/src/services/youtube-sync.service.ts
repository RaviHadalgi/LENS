import type {
  YouTubeRecentVideo,
  YouTubeSyncResponse,
} from "../models/source.model";
import { SourceProviderRegistry } from "./source-providers/source-provider-registry";
import type { SourceProvider } from "./source-providers/source-provider";
import type { YouTubeChannelLookup } from "./source-providers/source-provider";
import { YouTubeSourceProvider } from "./source-providers/youtube-source.provider";
import {
  YouTubeSyncStore,
  type SourceAccount,
  type UpsertSourceAccountInput,
} from "./youtube-sync.store";

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
      return this.failed(normalizedUrl, "Invalid URL.");
    }

    const detection = this.detectChannel(parsed);

    if (!detection?.channelLookup) {
      return this.failed(normalizedUrl, "Use a YouTube channel URL.");
    }

    const detectedSource = {
      platform: "youtube" as const,
      type: "channel" as const,
      url: normalizedUrl,
      externalId: detection.externalId,
      channelLookup: detection.channelLookup,
    };

    const checkedAt = new Date().toISOString();

    /*
     * First resolve the URL to the canonical YouTube channel identity.
     *
     * For a canonical /channel/<id> URL, the channel ID is already known.
     *
     * For handles, custom URLs, and usernames, ask the provider to resolve
     * the real channel ID before creating the canonical source account.
     */
    let channelId: string | null = null;
    let handle: string | null = null;

    if (detection.channelLookup.kind === "channel-id") {
      channelId = detection.channelLookup.value;
    } else {
      const resolution =
        await this.providerRegistry.resolveChannel(detectedSource);

      handle =
        resolution.handle ??
        (detection.channelLookup.kind === "handle"
          ? detection.channelLookup.value
          : null);

      if (!resolution.channelId) {
        /*
         * The source itself is still useful even though we could not resolve
         * its canonical YouTube channel ID.
         *
         * Persist it under the URL/lookup identity as needs-review.
         *
         * IMPORTANT:
         * - lastSuccessfulSyncAt remains null.
         * - We do not attempt feed synchronization.
         * - The UI receives the persisted source state instead of sync: null.
         */
        const unresolvedSourceKey = this.lookupSourceKey(
          detection.channelLookup,
        );

        const previous = await this.store.getSourceAccount(unresolvedSourceKey);

        const unresolvedAccount: UpsertSourceAccountInput = {
          sourceKey: unresolvedSourceKey,
          platform: "youtube",
          sourceType: "channel",
          externalId: "",
          url: normalizedUrl,
          handle,
          status: "needs-review",
          lastCheckedAt: checkedAt,
          lastSuccessfulSyncAt: previous?.lastSuccessfulSyncAt ?? null,
        };

        await this.store.upsertSourceAccount(unresolvedAccount);

        return {
          platform: "youtube",
          type: "channel",
          url: normalizedUrl,
          channelId: null,
          handle,
          feedUrl: null,
          status: "needs-review",
          sync: await this.store.getSource(unresolvedSourceKey),
          discovered: [],
          skipped: [],
          newVideos: [],
          message:
            resolution.message ??
            "The YouTube channel could not be resolved to a canonical channel ID.",
        };
      }

      channelId = resolution.channelId;
    }

    if (!channelId) {
      return this.failed(
        normalizedUrl,
        "The YouTube channel could not be resolved to a canonical channel ID.",
      );
    }

    /*
     * The canonical channel ID is the stable source identity.
     *
     * This means:
     *
     *   @OpenAI
     *   /c/OpenAI
     *   /user/OpenAI
     *   /channel/UC...
     *
     * can all eventually map to one source account.
     */
    const sourceKey = this.canonicalSourceKey(channelId);

    const previous = await this.store.getSourceAccount(sourceKey);

    const effectiveHandle =
      handle ??
      previous?.handle ??
      (detection.channelLookup.kind === "handle"
        ? detection.channelLookup.value
        : null);

    const resolvedSource = {
      ...detectedSource,
      externalId: channelId,
      channelLookup: {
        kind: "channel-id" as const,
        value: channelId,
      },
    };

    const result = await this.providerRegistry.syncChannel(
      resolvedSource,
      previous ? this.toSyncState(previous) : null,
    );

    if (result.status !== "completed" || !result.channelId) {
      const status =
        result.status === "completed" ? "needs-review" : result.status;

      /*
       * The canonical identity is known, so persist the source even when
       * synchronization itself fails.
       *
       * Never advance lastSuccessfulSyncAt on an unsuccessful sync.
       */
      const failedAccount: UpsertSourceAccountInput = {
        sourceKey,
        platform: "youtube",
        sourceType: "channel",
        externalId: channelId,
        url: normalizedUrl,
        handle: result.handle ?? effectiveHandle,
        status,
        lastCheckedAt: checkedAt,
        lastSuccessfulSyncAt: previous?.lastSuccessfulSyncAt ?? null,
      };

      await this.store.upsertSourceAccount(failedAccount);

      return {
        platform: "youtube",
        type: "channel",
        url: normalizedUrl,
        channelId: result.channelId ?? channelId,
        handle: result.handle ?? effectiveHandle,
        feedUrl: result.feedUrl,
        status,
        sync: await this.store.getSource(sourceKey),
        discovered: [],
        skipped: [],
        newVideos: [],
        message:
          result.message ??
          (result.status === "completed"
            ? "Channel synchronization requires review."
            : "The YouTube channel synchronization failed."),
      };
    }

    const discovered: YouTubeRecentVideo[] = [];
    const skipped: YouTubeRecentVideo[] = [];

    try {
      for (const video of result.videos) {
        const existingVideo = await this.store.getVideo(video.videoId);

        if (existingVideo) {
          /*
           * Legacy videos may exist without source ownership.
           *
           * If this sync encounters an unowned legacy video, claim it for
           * the current source. claimVideo() only updates rows whose
           * source_key is NULL, so ownership can never be stolen.
           */
          if (existingVideo.sourceKey === null) {
            const claimed = await this.store.claimVideo(
              video.videoId,
              sourceKey,
            );

            if (claimed) {
              discovered.push({
                ...video,
                discoveredAt: checkedAt,
                status: "discovered",
              });
            } else {
              skipped.push({
                ...video,
                status: "skipped",
              });
            }
          } else {
            /*
             * The video is already owned.
             *
             * Whether it belongs to this source or another source, do not
             * overwrite ownership.
             */
            skipped.push({
              ...video,
              status: "skipped",
            });
          }

          /*
           * The feed is newest-first. A known video marks the point
           * where older entries are already represented in the database.
           */
          break;
        }

        const discoveredVideo = {
          ...video,
          discoveredAt: checkedAt,
          status: "discovered" as const,
        };

        await this.store.upsertVideo(sourceKey, discoveredVideo);

        discovered.push(discoveredVideo);
      }
    } catch {
      /*
       * Videos may have been persisted before the failure.
       *
       * Do not move the successful-sync boundary forward because the entire
       * sync operation did not complete successfully.
       */
      const failedAccount: UpsertSourceAccountInput = {
        sourceKey,
        platform: "youtube",
        sourceType: "channel",
        externalId: result.channelId,
        url: normalizedUrl,
        handle: result.handle ?? effectiveHandle,
        status: "failed",
        lastCheckedAt: checkedAt,
        lastSuccessfulSyncAt: previous?.lastSuccessfulSyncAt ?? null,
      };

      await this.store.upsertSourceAccount(failedAccount);

      return {
        platform: "youtube",
        type: "channel",
        url: normalizedUrl,
        channelId: result.channelId,
        handle: result.handle ?? effectiveHandle,
        feedUrl: result.feedUrl,
        status: "failed",
        sync: await this.store.getSource(sourceKey),
        discovered,
        skipped,
        newVideos: discovered,
        message:
          "The sync was interrupted while persisting discovered videos. The successful sync boundary was not advanced.",
      };
    }

    /*
     * Only now has the synchronization completed successfully.
     *
     * Advance lastSuccessfulSyncAt only at this point.
     */
    const successfulAccount: UpsertSourceAccountInput = {
      sourceKey,
      platform: "youtube",
      sourceType: "channel",
      externalId: result.channelId,
      url: normalizedUrl,
      handle: result.handle ?? effectiveHandle,
      status: "active",
      lastCheckedAt: checkedAt,
      lastSuccessfulSyncAt: checkedAt,
    };

    await this.store.upsertSourceAccount(successfulAccount);

    const successfulSyncState = await this.store.getSource(sourceKey);

    return {
      platform: "youtube",
      type: "channel",
      url: normalizedUrl,
      channelId: result.channelId,
      handle: result.handle ?? effectiveHandle,
      feedUrl: result.feedUrl,
      status: "completed",
      sync: successfulSyncState,
      discovered,
      skipped,
      newVideos: discovered,
      message: result.message,
    };
  }

  async updateVideoStatus(
    videoId: string,
    sourceKey: string,
    status: NonNullable<YouTubeRecentVideo["status"]>,
  ): Promise<boolean> {
    return this.store.updateVideoStatus(videoId, sourceKey, status);
  }

  private detectChannel(url: URL): {
    externalId: string;
    channelLookup: YouTubeChannelLookup;
  } | null {
    const hostname = url.hostname.toLowerCase();

    if (
      !["youtube.com", "www.youtube.com", "m.youtube.com"].includes(hostname)
    ) {
      return null;
    }

    const handle = url.pathname.match(/^\/@([^/]+)\/?$/);

    if (handle) {
      return {
        externalId: `@${handle[1]}`,
        channelLookup: {
          kind: "handle",
          value: `@${handle[1]}`,
        },
      };
    }

    const channelId = url.pathname.match(/^\/channel\/([^/]+)\/?$/);

    if (channelId) {
      return {
        externalId: channelId[1],
        channelLookup: {
          kind: "channel-id",
          value: channelId[1],
        },
      };
    }

    const custom = url.pathname.match(/^\/c\/([^/]+)\/?$/);

    if (custom) {
      return {
        externalId: custom[1],
        channelLookup: {
          kind: "custom-url",
          value: custom[1],
        },
      };
    }

    const username = url.pathname.match(/^\/user\/([^/]+)\/?$/);

    if (username) {
      return {
        externalId: username[1],
        channelLookup: {
          kind: "username",
          value: username[1],
        },
      };
    }

    return null;
  }

  private canonicalSourceKey(channelId: string): string {
    return `youtube:channel-id:${channelId.toLowerCase()}`;
  }

  private lookupSourceKey(lookup: Exclude<YouTubeChannelLookup, null>): string {
    return `youtube:${lookup.kind}:${lookup.value.toLowerCase()}`;
  }

  private toSyncState(account: SourceAccount) {
    return {
      sourceId: account.sourceKey,
      channelId: account.externalId,
      channelUrl: account.url,
      handle: account.handle,
      lastCheckedAt: account.lastCheckedAt,
      lastSuccessfulSyncAt: account.lastSuccessfulSyncAt,
    };
  }

  private failed(url: string, message: string): YouTubeSyncResponse {
    return {
      platform: "youtube",
      type: "channel",
      url,
      channelId: null,
      handle: null,
      feedUrl: null,
      status: "failed",
      sync: null,
      discovered: [],
      skipped: [],
      newVideos: [],
      message,
    };
  }
}
