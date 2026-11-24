import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { VideoProcessingResult } from "./video-processing.service";

import type {
  SourceType,
  SourceStatement,
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

export interface DeletedSourceData {
  sourceKey: string;
  deletedVideos: number;
  deletedProcessingAttempts: number;
  deletedContentVersions: number;
}

export class YouTubeSyncStore {
  private readonly filePath: string;
  private db: DatabaseSync | null = null;

  constructor(filePath = DEFAULT_PATH) {
    this.filePath = filePath;
  }

  async beginProcessing(videoId: string, sourceKey: string): Promise<
    { status: "started"; attemptId: number } | { status: "not-found" | "conflict" }
  > {
    const db = this.database();
    db.exec("BEGIN IMMEDIATE");
    try {
      const video = db.prepare("SELECT status FROM youtube_videos WHERE video_id = ? AND source_key = ?")
        .get(videoId, sourceKey) as { status: string | null } | undefined;
      if (!video) {
        db.exec("COMMIT");
        return { status: "not-found" };
      }
      const active = db.prepare("SELECT 1 FROM video_processing_attempts WHERE video_id = ? AND status = 'processing'").get(videoId);
      if (active || !["needs-review", "failed", "processed"].includes(video.status ?? "")) {
        db.exec("COMMIT");
        return { status: "conflict" };
      }
      const inserted = db.prepare(`INSERT INTO video_processing_attempts
        (video_id, source_key, status, started_at) VALUES (?, ?, 'processing', ?)`)
        .run(videoId, sourceKey, new Date().toISOString());
      db.prepare("UPDATE youtube_videos SET status = 'processing' WHERE video_id = ? AND source_key = ?")
        .run(videoId, sourceKey);
      db.exec("COMMIT");
      return { status: "started", attemptId: Number(inserted.lastInsertRowid) };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  async finishProcessing(attemptId: number, result: VideoProcessingResult | null, error: string | null): Promise<{ status: "processed" | "unchanged" | "failed"; versionId: number | null }> {
    const db = this.database();
    db.exec("BEGIN IMMEDIATE");
    try {
      const attempt = db.prepare("SELECT video_id, source_key FROM video_processing_attempts WHERE id = ? AND status = 'processing'")
        .get(attemptId) as { video_id: string; source_key: string } | undefined;
      if (!attempt) throw new Error("Active processing attempt not found.");
      let status: "processed" | "unchanged" | "failed" = result ? "processed" : "failed";
      let versionId: number | null = null;
      if (result) {
        const existing = db.prepare("SELECT id FROM content_versions WHERE video_id = ? AND content_hash = ?")
          .get(attempt.video_id, result.contentHash) as { id: number } | undefined;
        if (existing) {
          status = "unchanged";
          versionId = existing.id;
        } else {
          const version = db.prepare(`INSERT INTO content_versions
            (video_id, source_key, content_hash, provider, processor_version, result_json, created_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'processed')`)
            .run(attempt.video_id, attempt.source_key, result.contentHash, result.provider,
              result.processorVersion, JSON.stringify(result), new Date().toISOString());
          versionId = Number(version.lastInsertRowid);
        }
      }
      const updated = db.prepare("UPDATE youtube_videos SET status = ? WHERE video_id = ? AND source_key = ? AND status = 'processing'")
        .run(result ? "processed" : "failed", attempt.video_id, attempt.source_key);
      if (updated.changes !== 1) throw new Error("Video ownership or processing state changed.");
      if (versionId !== null) {
        db.prepare("UPDATE youtube_videos SET current_version_id = ? WHERE video_id = ?")
          .run(versionId, attempt.video_id);
      }
      db.prepare(`UPDATE video_processing_attempts SET status = ?, finished_at = ?, result_json = NULL, error = ?, content_version_id = ? WHERE id = ?`)
        .run(status === "unchanged" ? "processed" : status, new Date().toISOString(), error, versionId, attemptId);
      db.exec("COMMIT");
      return { status, versionId };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  async listProcessingAttempts(videoId: string, sourceKey: string) {
    return this.database().prepare(`SELECT id, status, started_at AS startedAt,
      finished_at AS finishedAt, result_json AS resultJson, error,
      content_version_id AS contentVersionId
      FROM video_processing_attempts WHERE video_id = ? AND source_key = ? ORDER BY id`)
      .all(videoId, sourceKey);
  }

  async listContentVersions(videoId: string, sourceKey: string) {
    return this.database().prepare(`SELECT id, content_hash AS contentHash,
      provider, processor_version AS processorVersion, result_json AS resultJson,
      created_at AS createdAt, status FROM content_versions
      WHERE video_id = ? AND source_key = ? ORDER BY id`).all(videoId, sourceKey);
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

  async deleteSource(sourceKey: string): Promise<DeletedSourceData | null> {
    const db = this.database();
    db.exec("BEGIN IMMEDIATE");

    try {
      const source = db
        .prepare("SELECT 1 FROM source_accounts WHERE source_key = ?")
        .get(sourceKey);

      if (!source) {
        db.exec("COMMIT");
        return null;
      }

      const processingAttempts = db
        .prepare("DELETE FROM video_processing_attempts WHERE source_key = ?")
        .run(sourceKey);
      const contentVersions = db
        .prepare("DELETE FROM content_versions WHERE source_key = ?")
        .run(sourceKey);
      const videos = db
        .prepare("DELETE FROM youtube_videos WHERE source_key = ?")
        .run(sourceKey);
      const sourceAccount = db
        .prepare("DELETE FROM source_accounts WHERE source_key = ?")
        .run(sourceKey);

      if (sourceAccount.changes !== 1) {
        throw new Error("Source account changed during deletion.");
      }

      db.exec("COMMIT");

      return {
        sourceKey,
        deletedVideos: Number(videos.changes),
        deletedProcessingAttempts: Number(processingAttempts.changes),
        deletedContentVersions: Number(contentVersions.changes),
      };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
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

  async transitionVideoStatus(
    videoId: string,
    sourceKey: string,
    status: "needs-review" | "skipped",
  ): Promise<"updated" | "not-found" | "conflict"> {
    const video = this.database().prepare(
      "SELECT status FROM youtube_videos WHERE video_id = ? AND source_key = ?",
    ).get(videoId, sourceKey) as { status: string | null } | undefined;
    if (!video) return "not-found";

    const allowed = status === "needs-review"
      ? ["discovered", "failed", "skipped"]
      : ["discovered", "needs-review", "failed"];
    if (!allowed.includes(video.status ?? "")) return "conflict";

    const result = this.database().prepare(
      "UPDATE youtube_videos SET status = ? WHERE video_id = ? AND source_key = ? AND status = ?",
    ).run(status, videoId, sourceKey, video.status);
    return result.changes === 1 ? "updated" : "conflict";
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
        yv.video_id AS videoId,
        yv.title,
        yv.url,
        yv.published_at AS publishedAt,
        yv.discovered_at AS discoveredAt,
        yv.status,
        current_version_id AS currentVersionId,
        cv.created_at AS processedAt,
        cv.result_json AS resultJson
      FROM youtube_videos yv
      LEFT JOIN content_versions cv ON cv.id = yv.current_version_id
      WHERE yv.source_key = ?
      ORDER BY
        yv.published_at DESC,
        yv.discovered_at DESC,
        yv.video_id ASC
      `,
      )
      .all(sourceKey) as unknown as Array<
      Omit<SourceVideo, "claimCount" | "sourceStatements"> & { resultJson: string | null }
    >;

    return rows.map(({ resultJson, ...row }) => {
      let sourceStatements: SourceStatement[] = [];

      if (resultJson) {
        try {
          const parsed = JSON.parse(resultJson) as { claims?: unknown };

          if (Array.isArray(parsed.claims)) {
            sourceStatements = parsed.claims.flatMap((value): SourceStatement[] => {
              if (!value || typeof value !== "object") {
                return [];
              }

              const statement = value as Record<string, unknown>;

              if (typeof statement["text"] !== "string") {
                return [];
              }

              return [{
                text: statement["text"],
                context: typeof statement["context"] === "string" ? statement["context"] : "",
                startSeconds: typeof statement["startSeconds"] === "number"
                  ? statement["startSeconds"]
                  : null,
                endSeconds: typeof statement["endSeconds"] === "number"
                  ? statement["endSeconds"]
                  : null,
              }];
            });
          }
        } catch {
          sourceStatements = [];
        }
      }

      return {
        ...row,
        claimCount: sourceStatements.length,
        sourceStatements,
      };
    });
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
      CREATE TABLE IF NOT EXISTS video_processing_attempts (
        id INTEGER PRIMARY KEY,
        video_id TEXT NOT NULL,
        source_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('processing', 'processed', 'unchanged', 'failed')),
        started_at TEXT NOT NULL,
        finished_at TEXT,
        result_json TEXT,
        error TEXT,
        content_version_id INTEGER
      );
      CREATE TABLE IF NOT EXISTS content_versions (
        id INTEGER PRIMARY KEY,
        video_id TEXT NOT NULL,
        source_key TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        provider TEXT NOT NULL,
        processor_version TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL,
        UNIQUE(video_id, content_hash)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_video_processing_active
        ON video_processing_attempts(video_id) WHERE status = 'processing';
      CREATE INDEX IF NOT EXISTS idx_video_processing_history
        ON video_processing_attempts(video_id, source_key, id);
    `);

    this.migrateProcessingSchema();
    this.recoverInterruptedProcessing();

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS
        idx_youtube_videos_published_at
        ON youtube_videos(published_at);

      CREATE INDEX IF NOT EXISTS
        idx_youtube_videos_source_key
        ON youtube_videos(source_key);
    `);
  }

  private migrateProcessingSchema(): void {
    if (!this.db) return;
    const videoColumns = this.db.prepare("PRAGMA table_info(youtube_videos)").all() as unknown as Array<{ name: string }>;
    if (!videoColumns.some(column => column.name === "current_version_id")) {
      this.db.exec("ALTER TABLE youtube_videos ADD COLUMN current_version_id INTEGER");
    }
    const attemptColumns = this.db.prepare("PRAGMA table_info(video_processing_attempts)").all() as unknown as Array<{ name: string }>;
    if (!attemptColumns.some(column => column.name === "content_version_id")) {
      this.db.exec("ALTER TABLE video_processing_attempts ADD COLUMN content_version_id INTEGER");
    }
  }

  private recoverInterruptedProcessing(): void {
    if (!this.db) return;
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const finishedAt = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`UPDATE youtube_videos AS yv SET status = 'failed'
        WHERE status = 'processing' AND EXISTS (
          SELECT 1 FROM video_processing_attempts AS attempt
          WHERE attempt.video_id = yv.video_id
            AND attempt.source_key = yv.source_key
            AND attempt.status = 'processing'
            AND attempt.started_at < ?
        )`).run(cutoff);
      this.db.prepare(`UPDATE video_processing_attempts
        SET status = 'failed', finished_at = ?,
          error = 'Processing was interrupted before completion. It can be retried.'
        WHERE status = 'processing' AND started_at < ?`).run(finishedAt, cutoff);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
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
