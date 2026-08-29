import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { YouTubeSyncService } from './youtube-sync.service';
import { YouTubeSyncStore } from './youtube-sync.store';
import type { SourceProvider } from './source-providers/source-provider';

function providerFor(videos: Array<{ videoId: string; title: string; publishedAt: string }>): SourceProvider {
  return {
    platform: 'youtube',
    getMetadata: async () => ({ status: 'unavailable', metadata: null, channel: null, message: null }),
    syncChannel: async (source) => ({
      status: 'completed',
      channelId: source.channelLookup?.kind === 'channel-id' ? source.channelLookup.value : null,
      handle: null,
      channelUrl: source.url,
      feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCtest',
      videos: videos.map((video) => ({
        ...video,
        url: `https://www.youtube.com/watch?v=${video.videoId}`,
      })),
      message: null,
    }),
  };
}

test('persists source sync state and deduplicates by stable videoId', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lens-youtube-sync-'));
  const store = new YouTubeSyncStore(join(dir, 'state.json'));
  const service = new YouTubeSyncService(store, [providerFor([
    { videoId: 'A', title: 'A', publishedAt: '2026-08-28T00:00:00Z' },
    { videoId: 'B', title: 'B', publishedAt: '2026-08-20T00:00:00Z' },
  ])]);

  const first = await service.syncUrl('https://youtube.com/channel/UCtest');
  assert.equal(first.status, 'completed');
  assert.equal(first.newVideos.length, 2);
  assert.ok(first.sync?.lastSuccessfulSyncAt);

  const second = await service.syncUrl('https://youtube.com/channel/UCtest');
  assert.equal(second.status, 'completed');
  assert.equal(second.newVideos.length, 0);
  assert.equal(second.skipped.length, 1);
  assert.equal(second.skipped[0]?.videoId, 'A');

  const persisted = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')) as {
    sources: Record<string, unknown>;
    videos: Record<string, unknown>;
  };
  assert.ok(persisted.sources['youtube:channel-id:uctest']);
  assert.ok(persisted.videos.A);
  assert.ok(persisted.videos.B);
});

test('does not advance successful sync state when channel ID cannot be resolved', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lens-youtube-sync-'));
  const store = new YouTubeSyncStore(join(dir, 'state.json'));
  const service = new YouTubeSyncService(store, [providerFor([])]);

  const result = await service.syncUrl('https://youtube.com/@OpenAI');
  assert.equal(result.status, 'needs-review');
  assert.equal(result.sync?.lastSuccessfulSyncAt, null);
});
