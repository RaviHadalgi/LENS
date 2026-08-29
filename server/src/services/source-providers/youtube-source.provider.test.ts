import assert from 'node:assert/strict';
import test from 'node:test';

import { YouTubeSourceProvider } from './youtube-source.provider';

function response(status: number, body: string | unknown, contentType = 'application/xml'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
    json: async () => body,
    headers: new Headers({ 'content-type': contentType }),
  } as Response;
}

const feed = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>OpenAI</title><entry><id>yt:video:AAA</id><yt:videoId>AAA</yt:videoId><title>Video A</title><published>2026-08-28T10:00:00+00:00</published></entry><entry><id>yt:video:BBB</id><yt:videoId>BBB</yt:videoId><title>Video B</title><published>2026-08-20T10:00:00+00:00</published></entry></feed>`;

test('reads channel RSS/Atom entries for a channel ID', async () => {
  const provider = new YouTubeSourceProvider({
    fetchImplementation: async () =>
      new Response(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <title>OpenAI</title>
  <yt:channelId>UCtest</yt:channelId>

  <entry>
    <id>yt:video:A</id>
    <yt:videoId>A</yt:videoId>
    <yt:channelId>UCtest</yt:channelId>
    <title>Video A</title>
    <published>2026-08-28T00:00:00+00:00</published>
    <link rel="alternate" href="https://www.youtube.com/watch?v=A"/>
  </entry>

  <entry>
    <id>yt:video:B</id>
    <yt:videoId>B</yt:videoId>
    <yt:channelId>UCtest</yt:channelId>
    <title>Video B</title>
    <published>2026-08-20T00:00:00+00:00</published>
    <link rel="alternate" href="https://www.youtube.com/watch?v=B"/>
  </entry>
</feed>`, {
        status: 200,
        headers: { 'content-type': 'application/atom+xml' },
      }),
  });

  const result = await provider.syncChannel(
    {
      platform: 'youtube',
      type: 'channel',
      url: 'https://www.youtube.com/channel/UCtest',
      externalId: 'UCtest',
      channelLookup: {
        kind: 'channel-id',
        value: 'UCtest',
      },
    },
    null,
  );

  assert.equal(result.status, 'completed');
  assert.equal(result.channelId, 'UCtest');
  assert.equal(result.videos.length, 2);

  assert.deepEqual(result.videos[0], {
    videoId: 'A',
    title: 'Video A',
    url: 'https://www.youtube.com/watch?v=A',
    publishedAt: '2026-08-28T00:00:00+00:00',
  });

  assert.deepEqual(result.videos[1], {
    videoId: 'B',
    title: 'Video B',
    url: 'https://www.youtube.com/watch?v=B',
    publishedAt: '2026-08-20T00:00:00+00:00',
  });
});

test('does not pretend a handle is a channel ID when using RSS only', async () => {
  let called = false;
  const provider = new YouTubeSourceProvider({
    fetchImplementation: (async () => { called = true; return response(200, feed); }) as typeof fetch,
  });

  const result = await provider.syncChannel({
    platform: 'youtube', type: 'channel', url: 'https://youtube.com/@OpenAI',
    externalId: '@OpenAI', channelLookup: { kind: 'handle', value: '@OpenAI' },
  }, null);

  assert.equal(called, false);
  assert.equal(result.status, 'needs-review');
  assert.match(result.message ?? '', /requires a channel ID/);
});

test('returns failed when the RSS request fails', async () => {
  const provider = new YouTubeSourceProvider({
    fetchImplementation: (async () => response(503, 'unavailable')) as typeof fetch,
  });

  const result = await provider.syncChannel({
    platform: 'youtube', type: 'channel', url: 'https://youtube.com/channel/UCtest',
    externalId: 'UCtest', channelLookup: { kind: 'channel-id', value: 'UCtest' },
  }, null);

  assert.equal(result.status, 'failed');
});


test('returns failed for malformed Atom XML', async () => {
  const provider = new YouTubeSourceProvider({
    fetchImplementation: (async () => response(200, '<feed><entry>broken')) as typeof fetch,
  });

  const result = await provider.syncChannel({
    platform: 'youtube', type: 'channel', url: 'https://youtube.com/channel/UCtest',
    externalId: 'UCtest', channelLookup: { kind: 'channel-id', value: 'UCtest' },
  }, null);

  assert.equal(result.status, 'failed');
});

test('returns completed with an explicit message for an empty feed', async () => {
  const provider = new YouTubeSourceProvider({
    fetchImplementation: (async () => response(200, '<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"></feed>')) as typeof fetch,
  });

  const result = await provider.syncChannel({
    platform: 'youtube', type: 'channel', url: 'https://youtube.com/channel/UCtest',
    externalId: 'UCtest', channelLookup: { kind: 'channel-id', value: 'UCtest' },
  }, null);

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.videos, []);
  assert.match(result.message ?? '', /no video entries/i);
});
