import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  SourceType,
  SourceVideo,
  YouTubeRecentVideo,
  YouTubeSyncState,
} from "../models/source.model";

const DEFAULT_PATH = resolve(process.cwd(), "data/youtube-sync.sqlite");

export interface SourceInventory {
  contentCount: number;
}

export interface SourceAccount {
  sourceKey: string;
  platform: "youtube";
  sourceType: SourceType;
  externalId: string;
  url: string;
  handle: string | null;
  status: "active" | "needs-review" | "failed";
  lastCheckedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertSourceAccountInput {
  sourceKey: string;
  platform: "youtube";
  sourceType: SourceType;
  externalId: string;
  url: string;
  handle: string | null;
  status: SourceAccount["status"];
  lastCheckedAt: string | null;
  lastSuccessfulSyncAt: string | null;
}

export class YouTubeSyncStore {
  private readonly filePath: string;
  private db: DatabaseSync | null = null;

  constructor(filePath = DEFAULT_PATH) {
    this.filePath = filePath;
  }

  async getSource(sourceKey: string): Promise<YouTubeSyncState | null> {
    const account = await this.getSourceAccount(sourceKey);

    if (!account) {
      return null;
    }

    return {
      sourceId: account.sourceKey,
      channelId: account.externalId,
      channelUrl: account.url,
      handle: account.handle,
      lastCheckedAt: account.lastCheckedAt,
      lastSuccessfulSyncAt: account.lastSuccessfulSyncAt,
    };
  }

  async getSourceAccount(sourceKey: string): Promise<SourceAccount | null> {
    const row = this.database()
      .prepare(
        `
        SELECT
          source_key AS sourceKey,
          platform,
          source_type AS sourceType,
          external_id AS externalId,
          url,
          handle,
          status,
          last_checked_at AS lastCheckedAt,
          last_successful_sync_at AS lastSuccessfulSyncAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM source_accounts
        WHERE source_key = ?
      `,
      )
      .get(sourceKey) as unknown as SourceAccount | undefined;

    return row ?? null;
  }

  async listSourceAccounts(): Promise<Array<SourceAccount & SourceInventory>> {
    const rows = this.database()
      .prepare(
        `
      SELECT
        sa.source_key AS sourceKey,
        sa.platform,
        sa.source_type AS sourceType,
        sa.external_id AS externalId,
        sa.url,
        sa.handle,
        sa.status,
        sa.last_checked_at AS lastCheckedAt,
        sa.last_successful_sync_at AS lastSuccessfulSyncAt,
        sa.created_at AS createdAt,
        sa.updated_at AS updatedAt,
        COUNT(yv.video_id) AS contentCount
      FROM source_accounts sa
      LEFT JOIN youtube_videos yv
        ON yv.source_key = sa.source_key
      GROUP BY
        sa.source_key,
        sa.platform,
        sa.source_type,
        sa.external_id,
        sa.url,
        sa.handle,
        sa.status,
        sa.last_checked_at,
        sa.last_successful_sync_at,
        sa.created_at,
        sa.updated_at
      ORDER BY sa.updated_at DESC
      `,
      )
      .all() as unknown as Array<SourceAccount & SourceInventory>;

    return rows;
  }

  async updateVideoStatus(
    videoId: string,
    sourceKey: string,
    status: NonNullable<YouTubeRecentVideo["status"]>,
  ): Promise<boolean> {
    const result = this.database()
      .prepare(
        `
      UPDATE youtube_videos
      SET status = ?
      WHERE video_id = ?
        AND source_key = ?
      `,
      )
      .run(status, videoId, sourceKey);

    return result.changes > 0;
  }

  async upsertSourceAccount(source: UpsertSourceAccountInput): Promise<void> {
    const now = new Date().toISOString();

    this.database()
      .prepare(
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
        ON CONFLICT(source_key) DO UPDATE SET
          platform = excluded.platform,
          source_type = excluded.source_type,
          external_id = excluded.external_id,
          url = excluded.url,
          handle = excluded.handle,
          status = excluded.status,
          last_checked_at = excluded.last_checked_at,
          last_successful_sync_at =
            excluded.last_successful_sync_at,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        source.sourceKey,
        source.platform,
        source.sourceType,
        source.externalId,
        source.url,
        source.handle,
        source.status,
        source.lastCheckedAt,
        source.lastSuccessfulSyncAt,
        now,
        now,
      );
  }

  /*
   * Compatibility wrapper used by the current YouTube sync service.
   *
   * Keep this while the sync service continues to work with
   * YouTubeSyncState.
   */
  async upsertSource(source: YouTubeSyncState): Promise<void> {
    await this.upsertSourceAccount({
      sourceKey: source.sourceId,
      platform: "youtube",
      sourceType: "channel",
      externalId: source.channelId,
      url: source.channelUrl,
      handle: source.handle,
      status: "active",
      lastCheckedAt: source.lastCheckedAt,
      lastSuccessfulSyncAt: source.lastSuccessfulSyncAt,
    });
  }

  async hasVideo(videoId: string): Promise<boolean> {
    const row = this.database()
      .prepare(
        `
        SELECT 1 AS found
        FROM youtube_videos
        WHERE video_id = ?
        LIMIT 1
      `,
      )
      .get(videoId) as { found: number } | undefined;

    return Boolean(row);
  }

  async getVideo(videoId: string): Promise<{
    videoId: string;
    sourceKey: string | null;
  } | null> {
    const row = this.database()
      .prepare(
        `
      SELECT
        video_id AS videoId,
        source_key AS sourceKey
      FROM youtube_videos
      WHERE video_id = ?
      LIMIT 1
      `,
      )
      .get(videoId) as
      | {
          videoId: string;
          sourceKey: string | null;
        }
      | undefined;

    return row ?? null;
  }

  async listSourceVideos(sourceKey: string): Promise<SourceVideo[]> {
    const rows = this.database()
      .prepare(
        `
      SELECT
        video_id AS videoId,
        title,
        url,
        published_at AS publishedAt,
        discovered_at AS discoveredAt,
        status
      FROM youtube_videos
      WHERE source_key = ?
      ORDER BY
        published_at DESC,
        discovered_at DESC,
        video_id ASC
      `,
      )
      .all(sourceKey) as unknown as SourceVideo[];

    return rows;
  }

  async claimVideo(videoId: string, sourceKey: string): Promise<boolean> {
    const result = this.database()
      .prepare(
        `
      UPDATE youtube_videos
      SET source_key = ?
      WHERE video_id = ?
        AND source_key IS NULL
      `,
      )
      .run(sourceKey, videoId);

    return result.changes > 0;
  }

  async upsertVideo(
    sourceKey: string,
    video: YouTubeRecentVideo,
  ): Promise<void> {
    this.database()
      .prepare(
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
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(video_id) DO UPDATE SET
        title = excluded.title,
        url = excluded.url,
        published_at = excluded.published_at,
        discovered_at = excluded.discovered_at,
        status = excluded.status
      `,
      )
      .run(
        sourceKey,
        video.videoId,
        video.title,
        video.url,
        video.publishedAt,
        video.discoveredAt ?? null,
        video.status ?? null,
      );
  }

  async close(): Promise<void> {
    if (!this.db) {
      return;
    }

    this.db.close();
    this.db = null;
  }

  private database(): DatabaseSync {
    if (this.db) {
      return this.db;
    }

    const directory = dirname(this.filePath);

    mkdirSync(directory, {
      recursive: true,
    });

    this.db = new DatabaseSync(this.filePath);

    this.initializeSchema();

    return this.db;
  }

  private initializeSchema(): void {
    if (!this.db) {
      throw new Error("Database must be opened before initializing schema.");
    }

    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS source_accounts (
        source_key TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        source_type TEXT NOT NULL,
        external_id TEXT NOT NULL,
        url TEXT NOT NULL,
        handle TEXT,
        status TEXT NOT NULL,
        last_checked_at TEXT,
        last_successful_sync_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS
        idx_source_accounts_external_id
        ON source_accounts(platform, external_id);

      CREATE INDEX IF NOT EXISTS
        idx_source_accounts_handle
        ON source_accounts(platform, handle);
    `);

    this.migrateYouTubeVideos();

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS
        idx_youtube_videos_published_at
        ON youtube_videos(published_at);

      CREATE INDEX IF NOT EXISTS
        idx_youtube_videos_source_key
        ON youtube_videos(source_key);
    `);
  }

  private migrateYouTubeVideos(): void {
    if (!this.db) {
      throw new Error("Database must be opened before migration.");
    }

    const columns = this.db
      .prepare(
        `
        PRAGMA table_info(youtube_videos)
      `,
      )
      .all() as unknown as Array<{
      name: string;
    }>;

    /*
     * Fresh database.
     */
    if (columns.length === 0) {
      this.db.exec(`
        CREATE TABLE youtube_videos (
          source_key TEXT,
          video_id TEXT PRIMARY KEY,
          title TEXT,
          url TEXT NOT NULL,
          published_at TEXT,
          discovered_at TEXT,
          status TEXT
        );
      `);

      return;
    }

    /*
     * Existing database already has source ownership.
     */
    const hasSourceKey = columns.some((column) => column.name === "source_key");

    if (hasSourceKey) {
      return;
    }

    /*
     * Existing database from the old schema.
     *
     * Preserve all existing videos.
     *
     * source_key remains NULL because the legacy database
     * does not contain enough information to determine which
     * source originally discovered each video.
     */
    this.db.exec(`
      ALTER TABLE youtube_videos
      RENAME TO youtube_videos_legacy;

      CREATE TABLE youtube_videos (
        source_key TEXT,
        video_id TEXT PRIMARY KEY,
        title TEXT,
        url TEXT NOT NULL,
        published_at TEXT,
        discovered_at TEXT,
        status TEXT
      );

      INSERT INTO youtube_videos (
        source_key,
        video_id,
        title,
        url,
        published_at,
        discovered_at,
        status
      )
      SELECT
        NULL,
        video_id,
        title,
        url,
        published_at,
        discovered_at,
        status
      FROM youtube_videos_legacy;

      DROP TABLE youtube_videos_legacy;
    `);
  }
}
