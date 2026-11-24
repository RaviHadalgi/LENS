import assert from 'node:assert/strict';
import test from 'node:test';

import { SourceService } from './source.service';
import { SourceProviderRegistry } from './source-providers/source-provider-registry';
import { YouTubeSourceProvider } from './source-providers/youtube-source.provider';

// Keep unit tests offline; live YouTube availability is not a test prerequisite.
const sourceService = new SourceService(new SourceProviderRegistry([
  new YouTubeSourceProvider({
    fetchImplementation: async () => new Response(`<html><head>
      <meta itemprop="channelId" content="UCXZCJLdBC09xxGZ6gcdrc6A">
      <meta name="title" content="OpenAI">
      </head></html>`, { status: 200, headers: { 'content-type': 'text/html' } }),
  }),
]));

test('resolves an @handle channel URL from public YouTube metadata', async () => {
  const result = await sourceService.analyzeUrl(
    'https://youtube.com/@OpenAI',
  );

  assert.equal(result.status, 'detected');
  assert.equal(result.type, 'channel');
  assert.equal(result.externalId, '@OpenAI');

  assert.ok(result.channel);
  assert.equal(
    result.channel.channelId,
    'UCXZCJLdBC09xxGZ6gcdrc6A',
  );
  assert.equal(result.channel.handle, '@OpenAI');
  assert.equal(result.channel.name, 'OpenAI');

  assert.equal(result.metadataStatus, 'available');
});

test('detects a canonical YouTube channel ID URL', async () => {
  const result = await sourceService.analyzeUrl(
    'https://www.youtube.com/channel/UCK8sQmJBp8GCxrOtXWBpyEA',
  );

  assert.equal(result.status, 'detected');
  assert.equal(result.type, 'channel');
  assert.equal(result.externalId, 'UCK8sQmJBp8GCxrOtXWBpyEA');
});

test('marks an invalid YouTube path as invalid', async () => {
  const result = await sourceService.analyzeUrl('https://www.youtube.com/not-a-source');

  assert.equal(result.status, 'invalid');
  assert.equal(result.type, 'unknown');
});

test('rejects a non-YouTube URL', async () => {
  const result = await sourceService.analyzeUrl('https://example.com/channel');

  assert.equal(result.status, 'unsupported');
  assert.equal(result.platform, 'unknown');
});
