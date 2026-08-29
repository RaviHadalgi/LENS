import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  YouTubeRecentVideo,
  YouTubeSyncState,
} from '../models/source.model';

interface PersistedState {
  sources: Record<string, YouTubeSyncState>;
  videos: Record<string, YouTubeRecentVideo>;
}

const DEFAULT_PATH = resolve(process.cwd(), 'data/youtube-sync-state.json');

export class YouTubeSyncStore {
  private readonly filePath: string;
  private cache: PersistedState | null = null;

  constructor(filePath = DEFAULT_PATH) {
    this.filePath = filePath;
  }

  async getSource(sourceId: string): Promise<YouTubeSyncState | null> {
    const state = await this.load();
    return state.sources[sourceId] ?? null;
  }

  async upsertSource(source: YouTubeSyncState): Promise<void> {
    const state = await this.load();
    state.sources[source.sourceId] = source;
    await this.save(state);
  }

  async hasVideo(videoId: string): Promise<boolean> {
    const state = await this.load();
    return Boolean(state.videos[videoId]);
  }

  async upsertVideo(video: YouTubeRecentVideo): Promise<void> {
    const state = await this.load();
    state.videos[video.videoId] = video;
    await this.save(state);
  }

  private async load(): Promise<PersistedState> {
    if (this.cache) return this.cache;

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      this.cache = {
        sources: parsed.sources ?? {},
        videos: parsed.videos ?? {},
      };
    } catch {
      this.cache = { sources: {}, videos: {} };
    }

    return this.cache;
  }

  private async save(state: PersistedState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    this.cache = state;
  }
}
