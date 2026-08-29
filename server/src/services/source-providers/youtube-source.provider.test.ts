import assert from 'node:assert/strict';
import test from 'node:test';

import { YouTubeSourceProvider } from './youtube-source.provider';

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

test('normalizes official Data API channel details for a handle', async () => {
  const provider = new YouTubeSourceProvider({
    apiKey: 'test-key',
    fetchImplementation: (async (input) => {
      const requestUrl = new URL(input.toString());
      assert.equal(requestUrl.searchParams.get('forHandle'), '@OpenAI');
      assert.equal(requestUrl.searchParams.get('key'), 'test-key');

      return response(200, {
        items: [{
          id: 'UCtest',
          snippet: {
            title: 'OpenAI', customUrl: '@OpenAI', description: 'Research',
            country: 'US', publishedAt: '2015-12-11T00:00:00Z',
            thumbnails: { high: { url: 'https://example.test/openai.jpg' } },
          },
          contentDetails: { relatedPlaylists: { uploads: 'UUtest' } },
          statistics: {
            subscriberCount: '1000', hiddenSubscriberCount: false,
            videoCount: '42', viewCount: '9000',
          },
        }],
      });
    }) as typeof fetch,
  });

  const result = await provider.getMetadata({
    platform: 'youtube', type: 'channel', url: 'https://youtube.com/@OpenAI',
    externalId: '@OpenAI', channelLookup: { kind: 'handle', value: '@OpenAI' },
  });

  assert.equal(result.status, 'available');
  assert.deepEqual(result.channel && {
    channelId: result.channel.channelId,
    handle: result.channel.handle,
    name: result.channel.name,
    uploadsPlaylistId: result.channel.uploadsPlaylistId,
    subscriberCount: result.channel.subscriberCount,
  }, {
    channelId: 'UCtest', handle: '@OpenAI', name: 'OpenAI',
    uploadsPlaylistId: 'UUtest', subscriberCount: 1000,
  });
});

test('returns an unavailable result for a private or missing channel', async () => {
  const provider = new YouTubeSourceProvider({
    apiKey: 'test-key',
    fetchImplementation: (async () => response(200, { items: [] })) as typeof fetch,
  });

  const result = await provider.getMetadata({
    platform: 'youtube', type: 'channel', url: 'https://youtube.com/channel/UCmissing',
    externalId: 'UCmissing', channelLookup: { kind: 'channel-id', value: 'UCmissing' },
  });

  assert.equal(result.status, 'unavailable');
  assert.match(result.message ?? '', /unavailable, private, or could not be found/);
});

test('reports quota and rate-limit failures without exposing credentials', async () => {
  const provider = new YouTubeSourceProvider({
    apiKey: 'secret-key',
    fetchImplementation: (async () => response(403, {
      error: { errors: [{ reason: 'quotaExceeded' }] },
    })) as typeof fetch,
  });

  const result = await provider.getMetadata({
    platform: 'youtube', type: 'channel', url: 'https://youtube.com/@OpenAI',
    externalId: '@OpenAI', channelLookup: { kind: 'handle', value: '@OpenAI' },
  });

  assert.equal(result.status, 'unavailable');
  assert.match(result.message ?? '', /quota or rate limit/);
  assert.doesNotMatch(result.message ?? '', /secret-key/);
});

test('reports a transport failure from the Data API', async () => {
  const provider = new YouTubeSourceProvider({
    apiKey: 'test-key',
    fetchImplementation: (async () => {
      throw new Error('network offline');
    }) as typeof fetch,
  });

  const result = await provider.getMetadata({
    platform: 'youtube', type: 'channel', url: 'https://youtube.com/@OpenAI',
    externalId: '@OpenAI', channelLookup: { kind: 'handle', value: '@OpenAI' },
  });

  assert.equal(result.status, 'unavailable');
  assert.match(result.message ?? '', /could not reach the YouTube Data API/);
});

test('uses keyless oEmbed as the video-only fallback', async () => {
  const provider = new YouTubeSourceProvider({
    fetchImplementation: (async (input) => {
      assert.equal(new URL(input.toString()).hostname, 'www.youtube.com');
      return response(200, {
        title: 'Example video', author_name: 'Example creator',
        author_url: 'https://youtube.com/@example', provider_name: 'YouTube',
      });
    }) as typeof fetch,
  });

  const result = await provider.getMetadata({
    platform: 'youtube', type: 'video', url: 'https://youtube.com/watch?v=example',
    externalId: 'example', channelLookup: null,
  });

  assert.equal(result.status, 'available');
  assert.equal(result.metadata?.authorName, 'Example creator');
  assert.equal(result.channel, null);
});

test('does not call the API for a legacy custom channel URL', async () => {
  let wasCalled = false;
  const provider = new YouTubeSourceProvider({
    apiKey: 'test-key',
    fetchImplementation: (async () => {
      wasCalled = true;
      return response(500, {});
    }) as typeof fetch,
  });

  const result = await provider.getMetadata({
    platform: 'youtube', type: 'channel', url: 'https://youtube.com/c/LegacyName',
    externalId: 'LegacyName', channelLookup: { kind: 'custom-url', value: 'LegacyName' },
  });

  assert.equal(wasCalled, false);
  assert.equal(result.status, 'unavailable');
  assert.match(result.message ?? '', /cannot be resolved deterministically/);
});
