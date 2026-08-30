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

test("reports content inventory only for videos owned by each source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lens-youtube-inventory-"));
  const databasePath = join(directory, "sync.sqlite");

  try {
    const store = new YouTubeSyncStore(databasePath);

    await store.getVideo("inventory-initialize");

    const db = new DatabaseSync(databasePath);

    db.prepare(
      `
      INSERT INTO source_accounts (
        source_key,
        platform,
        source_type,
        external_id,
        url,
        handle,
        status,
        last_checked_at,
        last_successful_sync_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      "youtube:channel-id:source-a",
      "youtube",
      "channel",
      "UCA",
      "https://youtube.com/channel/UCA",
      "@sourceA",
      "active",
      null,
      null,
      "2026-08-30T00:00:00.000Z",
      "2026-08-30T00:00:00.000Z",
    );

    db.prepare(
      `
      INSERT INTO source_accounts (
        source_key,
        platform,
        source_type,
        external_id,
        url,
        handle,
        status,
        last_checked_at,
        last_successful_sync_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      "youtube:channel-id:source-b",
      "youtube",
      "channel",
      "UCB",
      "https://youtube.com/channel/UCB",
      "@sourceB",
      "active",
      null,
      null,
      "2026-08-30T00:00:00.000Z",
      "2026-08-30T00:00:00.000Z",
    );

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
      VALUES
        (?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      "youtube:channel-id:source-a",
      "A-1",
      "Source A video 1",
      "https://youtube.com/watch?v=A-1",
      "2026-08-29T00:00:00.000Z",
      "2026-08-30T00:00:00.000Z",
      "discovered",

      "youtube:channel-id:source-a",
      "A-2",
      "Source A video 2",
      "https://youtube.com/watch?v=A-2",
      "2026-08-28T00:00:00.000Z",
      "2026-08-30T00:00:00.000Z",
      "discovered",

      "youtube:channel-id:source-b",
      "B-1",
      "Source B video 1",
      "https://youtube.com/watch?v=B-1",
      "2026-08-27T00:00:00.000Z",
      "2026-08-30T00:00:00.000Z",
      "discovered",
    );

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
      "LEGACY-UNOWNED",
      "Legacy unowned video",
      "https://youtube.com/watch?v=LEGACY-UNOWNED",
      "2026-08-26T00:00:00.000Z",
    );

    db.close();

    const sources = await store.listSourceAccounts();

    const sourceA = sources.find(
      (source) => source.sourceKey === "youtube:channel-id:source-a",
    );

    const sourceB = sources.find(
      (source) => source.sourceKey === "youtube:channel-id:source-b",
    );

    assert.ok(sourceA);
    assert.ok(sourceB);

    assert.equal(sourceA.contentCount, 2);
    assert.equal(sourceB.contentCount, 1);

    /*
     * The unowned legacy video must not appear in either
     * source's inventory.
     */
    assert.equal(
      sources.reduce((total, source) => total + source.contentCount, 0),
      3,
    );

    await store.close();
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
});

test("lists only content owned by the requested source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lens-youtube-content-"));
  const databasePath = join(directory, "sync.sqlite");

  try {
    const store = new YouTubeSyncStore(databasePath);

    await store.getVideo("initialize");

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
      VALUES
        (?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?),
        (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      "youtube:channel-id:source-a",
      "A-1",
      "A newest",
      "https://youtube.com/watch?v=A-1",
      "2026-08-30T00:00:00.000Z",
      "2026-08-30T01:00:00.000Z",
      "discovered",

      "youtube:channel-id:source-a",
      "A-2",
      "A older",
      "https://youtube.com/watch?v=A-2",
      "2026-08-29T00:00:00.000Z",
      "2026-08-29T01:00:00.000Z",
      "processed",

      "youtube:channel-id:source-b",
      "B-1",
      "B video",
      "https://youtube.com/watch?v=B-1",
      "2026-08-31T00:00:00.000Z",
      "2026-08-31T01:00:00.000Z",
      "discovered",
    );

    db.close();

    const videos = await store.listSourceVideos("youtube:channel-id:source-a");

    assert.equal(videos.length, 2);
    assert.equal(videos[0]?.videoId, "A-1");
    assert.equal(videos[1]?.videoId, "A-2");
    assert.equal(videos[0]?.title, "A newest");
    assert.equal(videos[1]?.status, "processed");

    await store.close();
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
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

test("lists videos only for the owning source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lens-source-inventory-"));
  const databasePath = join(directory, "inventory.sqlite");

  try {
    const store = new YouTubeSyncStore(databasePath);

    await store.upsertSourceAccount({
      sourceKey: "youtube:channel-id:source-a",
      platform: "youtube",
      sourceType: "channel",
      externalId: "SOURCE-A",
      url: "https://youtube.com/channel/SOURCE-A",
      handle: "@sourcea",
      status: "active",
      lastCheckedAt: null,
      lastSuccessfulSyncAt: null,
    });

    await store.upsertSourceAccount({
      sourceKey: "youtube:channel-id:source-b",
      platform: "youtube",
      sourceType: "channel",
      externalId: "SOURCE-B",
      url: "https://youtube.com/channel/SOURCE-B",
      handle: "@sourceb",
      status: "active",
      lastCheckedAt: null,
      lastSuccessfulSyncAt: null,
    });

    await store.upsertVideo("youtube:channel-id:source-a", {
      videoId: "AAA",
      title: "Source A video",
      url: "https://youtube.com/watch?v=AAA",
      publishedAt: "2026-08-30T00:00:00+00:00",
    });

    await store.upsertVideo("youtube:channel-id:source-b", {
      videoId: "BBB",
      title: "Source B video",
      url: "https://youtube.com/watch?v=BBB",
      publishedAt: "2026-08-29T00:00:00+00:00",
    });

    const sourceAVideos = await store.listSourceVideos(
      "youtube:channel-id:source-a",
    );

    assert.equal(sourceAVideos.length, 1);
    assert.equal(sourceAVideos[0]?.videoId, "AAA");
    assert.equal(sourceAVideos[0]?.title, "Source A video");

    const sourceBVideos = await store.listSourceVideos(
      "youtube:channel-id:source-b",
    );

    assert.equal(sourceBVideos.length, 1);
    assert.equal(sourceBVideos[0]?.videoId, "BBB");
  } finally {
    // close/cleanup according to the existing test pattern
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

test("updates the processing status of an owned video", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lens-youtube-video-status-"));
  const databasePath = join(directory, "sync.sqlite");

  try {
    const store = new YouTubeSyncStore(databasePath);

    await store.upsertVideo("youtube:channel-id:source-a", {
      videoId: "STATUS-1",
      title: "Status test video",
      url: "https://youtube.com/watch?v=STATUS-1",
      publishedAt: "2026-08-30T00:00:00.000Z",
      status: "discovered",
    });

    await store.updateVideoStatus(
      "STATUS-1",
      "youtube:channel-id:source-a",
      "processed",
    );

    const videos = await store.listSourceVideos("youtube:channel-id:source-a");

    assert.equal(videos.length, 1);
    assert.equal(videos[0]?.videoId, "STATUS-1");
    assert.equal(videos[0]?.status, "processed");

    await store.close();
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
});

test("starts processing an owned video", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "lens-youtube-video-processing-"),
  );
  const databasePath = join(directory, "sync.sqlite");

  try {
    const store = new YouTubeSyncStore(databasePath);
    const service = new YouTubeSyncService(store);

    const sourceKey = "youtube:channel-id:test";
    const videoId = "video-processing-test";

    await store.upsertVideo(sourceKey, {
      videoId,
      title: "Processing test",
      url: `https://youtube.com/watch?v=${videoId}`,
      publishedAt: null,
      status: "needs-review",
    });

    const result = await service.processVideo(videoId, sourceKey);

    assert.equal(result, true);

    const videos = await store.listSourceVideos(sourceKey);

    assert.equal(videos.length, 1);
    assert.equal(videos[0]?.status, "processing");

    await store.close();
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
});

test("does not start processing a video owned by another source", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "lens-youtube-video-processing-ownership-"),
  );
  const databasePath = join(directory, "sync.sqlite");

  try {
    const store = new YouTubeSyncStore(databasePath);
    const service = new YouTubeSyncService(store);

    const sourceKey = "youtube:channel-id:test";
    const otherSourceKey = "youtube:channel-id:other";
    const videoId = "video-processing-ownership-test";

    await store.upsertVideo(sourceKey, {
      videoId,
      title: "Ownership test",
      url: `https://youtube.com/watch?v=${videoId}`,
      publishedAt: null,
      status: "needs-review",
    });

    const result = await service.processVideo(videoId, otherSourceKey);

    assert.equal(result, false);

    const videos = await store.listSourceVideos(sourceKey);

    assert.equal(videos.length, 1);
    assert.equal(videos[0]?.status, "needs-review");

    await store.close();
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
});
test("does not update processing status when the source does not own the video", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "lens-youtube-video-status-ownership-"),
  );
  const databasePath = join(directory, "sync.sqlite");

  try {
    const store = new YouTubeSyncStore(databasePath);

    await store.upsertVideo("youtube:channel-id:source-a", {
      videoId: "OWNED-STATUS-1",
      title: "Owned status test video",
      url: "https://youtube.com/watch?v=OWNED-STATUS-1",
      publishedAt: "2026-08-30T00:00:00.000Z",
      status: "discovered",
    });

    const updated = await store.updateVideoStatus(
      "OWNED-STATUS-1",
      "youtube:channel-id:source-b",
      "processed",
    );

    assert.equal(updated, false);

    const videos = await store.listSourceVideos("youtube:channel-id:source-a");

    assert.equal(videos.length, 1);
    assert.equal(videos[0]?.status, "discovered");

    await store.close();
  } finally {
    await rm(directory, {
      recursive: true,
      force: true,
    });
  }
});
