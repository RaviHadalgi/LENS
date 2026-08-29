import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  YouTubeRecentVideo,
  YouTubeSyncState,
} from '../models/source.model';

const DEFAULT_PATH = resolve(process.cwd(), 'data/youtube-sync.sqlite');

export class YouTubeSyncStore {
  private readonly filePath: string;
  private db: DatabaseSync | null = null;

  constructor(filePath = DEFAULT_PATH) {
    this.filePath = filePath;
  }

  async getSource(sourceId: string): Promise<YouTubeSyncState | null> {
    const row = this.database()
      .prepare(`
        SELECT
          source_id AS sourceId,
          channel_id AS channelId,
          channel_url AS channelUrl,
          handle,
          last_checked_at AS lastCheckedAt,
          last_successful_sync_at AS lastSuccessfulSyncAt
        FROM youtube_sources
        WHERE source_id = ?
      `)
      .get(sourceId) as YouTubeSyncState | undefined;

    return row ?? null;
  }

  async upsertSource(source: YouTubeSyncState): Promise<void> {
    this.database()
      .prepare(`
        INSERT INTO youtube_sources (
          source_id,
          channel_id,
          channel_url,
          handle,
          last_checked_at,
          last_successful_sync_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id) DO UPDATE SET
          channel_id = excluded.channel_id,
          channel_url = excluded.channel_url,
          handle = excluded.handle,
          last_checked_at = excluded.last_checked_at,
          last_successful_sync_at = excluded.last_successful_sync_at
      `)
      .run(
        source.sourceId,
        source.channelId,
        source.channelUrl,
        source.handle,
        source.lastCheckedAt,
        source.lastSuccessfulSyncAt,
      );
  }

  async hasVideo(videoId: string): Promise<boolean> {
    const row = this.database()
      .prepare(`
        SELECT 1 AS found
        FROM youtube_videos
        WHERE video_id = ?
        LIMIT 1
      `)
      .get(videoId) as { found: number } | undefined;

    return Boolean(row);
  }

  async upsertVideo(video: YouTubeRecentVideo): Promise<void> {
    this.database()
      .prepare(`
        INSERT INTO youtube_videos (
          video_id,
          title,
          url,
          published_at,
          discovered_at,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(video_id) DO UPDATE SET
          title = excluded.title,
          url = excluded.url,
          published_at = excluded.published_at,
          discovered_at = excluded.discovered_at,
          status = excluded.status
      `)
      .run(
        video.videoId,
        video.title,
        video.url,
        video.publishedAt,
        video.discoveredAt ?? null,
        video.status ?? null,
      );
  }

  async close(): Promise<void> {
    if (!this.db) return;

    this.db.close();
    this.db = null;
  }

  private database(): DatabaseSync {
    if (this.db) return this.db;

    void mkdir(dirname(this.filePath), { recursive: true });

    this.db = new DatabaseSync(this.filePath);

    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS youtube_sources (
        source_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        channel_url TEXT NOT NULL,
        handle TEXT,
        last_checked_at TEXT,
        last_successful_sync_at TEXT
      );

      CREATE TABLE IF NOT EXISTS youtube_videos (
        video_id TEXT PRIMARY KEY,
        title TEXT,
        url TEXT NOT NULL,
        published_at TEXT,
        discovered_at TEXT,
        status TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_youtube_videos_published_at
        ON youtube_videos(published_at);
    `);

    return this.db;
  }
}
