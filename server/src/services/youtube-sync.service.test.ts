import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { YouTubeSyncService } from "./youtube-sync.service";
import { YouTubeSyncStore } from "./youtube-sync.store";
import type {
  YouTubeRecentVideo,
  YouTubeSyncState,
} from "../models/source.model";
import type {
  SourceProvider,
  YouTubeSyncResult,
} from "./source-providers/source-provider";

class FakeYouTubeProvider implements SourceProvider {
  readonly platform = "youtube" as const;

  constructor(
    private readonly videos: YouTubeRecentVideo[],
    private readonly channelId = "UCtest",
  ) {}

  async getMetadata() {
    return {
      status: "unavailable" as const,
      metadata: null,
      channel: null,
      message: null,
    };
  }

  async resolveChannel() {
    return {
      channelId: this.channelId,
      handle: "@test",
      channelUrl: "https://youtube.com/channel/UCtest",
      message: null,
    };
  }

  async syncChannel(): Promise<YouTubeSyncResult> {
    return {
      status: "completed",
      channelId: this.channelId,
      handle: "@test",
      channelUrl: "https://youtube.com/channel/UCtest",
      feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${this.channelId}`,
      videos: this.videos,
      message: null,
    };
  }
}

test("persists source sync state and deduplicates by stable videoId", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lens-youtube-sync-"));
  const databasePath = join(directory, "sync.sqlite");

  try {
    const store = new YouTubeSyncStore(databasePath);

    const videos: YouTubeRecentVideo[] = [
      {
        videoId: "AAA",
        title: "Video A",
        url: "https://www.youtube.com/watch?v=AAA",
        publishedAt: "2026-08-28T00:00:00+00:00",
      },
      {
        videoId: "BBB",
        title: "Video B",
        url: "https://www.youtube.com/watch?v=BBB",
        publishedAt: "2026-08-27T00:00:00+00:00",
      },
    ];

    const service = new YouTubeSyncService(store, [
      new FakeYouTubeProvider(videos),
    ]);

    const first = await service.syncUrl("https://youtube.com/channel/UCtest");

    assert.equal(first.status, "completed");
    assert.equal(first.channelId, "UCtest");
    assert.equal(first.discovered.length, 2);
    assert.equal(first.skipped.length, 0);
    assert.equal(first.newVideos.length, 2);

    const persisted = await store.getSource("youtube:channel-id:uctest");

    assert.ok(persisted);
    assert.equal(persisted.channelId, "UCtest");
    assert.equal(persisted.channelUrl, "https://youtube.com/channel/UCtest");
    assert.equal(persisted.handle, "@test");
    assert.ok(persisted.lastCheckedAt);
    assert.ok(persisted.lastSuccessfulSyncAt);

    assert.equal(await store.hasVideo("AAA"), true);
    assert.equal(await store.hasVideo("BBB"), true);
    assert.equal(await store.hasVideo("DOES-NOT-EXIST"), false);

    const second = await service.syncUrl("https://youtube.com/channel/UCtest");

    assert.equal(second.status, "completed");
    assert.equal(second.discovered.length, 0);
    assert.equal(second.skipped.length, 1);
    assert.equal(second.skipped[0]?.videoId, "AAA");
    assert.equal(second.newVideos.length, 0);

    /*
     * Verify that persistence is genuinely SQLite rather than the old
     * JSON-file implementation.
     */
    const db = new DatabaseSync(databasePath);

    const sourceCount = db
      .prepare("SELECT COUNT(*) AS count FROM source_accounts")
      .get() as { count: number | bigint };

    assert.equal(Number(sourceCount.count), 1);

    const sourceAccount = db
      .prepare(
        `
    SELECT
      source_key AS sourceKey,
      platform,
      source_type AS sourceType,
      external_id AS externalId,
      url,
      handle,
      status
    FROM source_accounts
    WHERE source_key = ?
  `,
      )
      .get("youtube:channel-id:uctest") as
      | {
          sourceKey: string;
          platform: string;
          sourceType: string;
          externalId: string;
          url: string;
          handle: string | null;
          status: string;
        }
      | undefined;

    assert.ok(sourceAccount);
    assert.equal(sourceAccount.sourceKey, "youtube:channel-id:uctest");
    assert.equal(sourceAccount.platform, "youtube");
    assert.equal(sourceAccount.sourceType, "channel");
    assert.equal(sourceAccount.externalId, "UCtest");
    assert.equal(sourceAccount.url, "https://youtube.com/channel/UCtest");
    assert.equal(sourceAccount.handle, "@test");
    assert.equal(sourceAccount.status, "active");

    const videoCount = db
      .prepare("SELECT COUNT(*) AS count FROM youtube_videos")
      .get() as { count: number | bigint };

    assert.equal(Number(sourceCount.count), 1);
    assert.equal(Number(videoCount.count), 2);

    db.close();
    await store.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("claims unowned legacy videos without allowing ownership to be stolen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lens-youtube-ownership-"));
  const databasePath = join(directory, "sync.sqlite");

  try {
    const store = new YouTubeSyncStore(databasePath);
    await store.getVideo("LEGACY-VIDEO");
    /*
     * Create the video directly as an unowned legacy record.
     */
    const db = new DatabaseSync(databasePath);

    db.prepare(
      `
      INSERT INTO youtube_videos (
        source_key,
        video_id,
        title,
        url,
        published_at,
        discovered_at,
        status
      )
      VALUES (NULL, ?, ?, ?, ?, NULL, NULL)
      `,
    ).run(
      "LEGACY-VIDEO",
      "Legacy Video",
      "https://www.youtube.com/watch?v=LEGACY-VIDEO",
      "2026-08-28T00:00:00+00:00",
    );

    db.close();

    const unowned = await store.getVideo("LEGACY-VIDEO");

    assert.ok(unowned);
    assert.equal(unowned.sourceKey, null);

    /*
     * Source A claims the legacy video.
     */
    const claimedByA = await store.claimVideo(
      "LEGACY-VIDEO",
      "youtube:channel-id:source-a",
    );

    assert.equal(claimedByA, true);

    const ownedByA = await store.getVideo("LEGACY-VIDEO");

    assert.ok(ownedByA);
    assert.equal(ownedByA.sourceKey, "youtube:channel-id:source-a");

    /*
     * Source B must not be able to steal ownership.
     */
    const claimedByB = await store.claimVideo(
      "LEGACY-VIDEO",
      "youtube:channel-id:source-b",
    );

    assert.equal(claimedByB, false);

    const finalOwnership = await store.getVideo("LEGACY-VIDEO");

    assert.ok(finalOwnership);
    assert.equal(finalOwnership.sourceKey, "youtube:channel-id:source-a");
  } finally {
    /*
     * Temporary database is isolated under tmpdir().
     */
  }
});

test("does not advance successful sync state when channel ID cannot be resolved", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lens-youtube-sync-"));
  const databasePath = join(directory, "sync.sqlite");

  try {
    const store = new YouTubeSyncStore(databasePath);

    const provider: SourceProvider = {
      platform: "youtube",

      async getMetadata() {
        return {
          status: "unavailable",
          metadata: null,
          channel: null,
          message: null,
        };
      },

      async resolveChannel() {
        return {
          channelId: null,
          handle: "@OpenAI",
          channelUrl: "https://youtube.com/@OpenAI",
          message: "Unable to resolve the channel ID.",
        };
      },

      async syncChannel() {
        throw new Error("syncChannel should not be called");
      },
    };

    const service = new YouTubeSyncService(store, [provider]);

    const result = await service.syncUrl("https://youtube.com/@OpenAI");

    assert.equal(result.status, "needs-review");
    assert.equal(result.channelId, null);
    assert.equal(result.handle, "@OpenAI");
    assert.match(result.message ?? "", /Unable to resolve the channel ID/);

    const source = await store.getSource("youtube:handle:@openai");

    assert.ok(source);
    assert.equal(source.channelId, "");
    assert.equal(source.lastSuccessfulSyncAt, null);

    await store.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
