import assert from 'node:assert/strict';
import test from 'node:test';

import { SourceService } from './source.service';

const sourceService = new SourceService();

test('detects an @handle channel URL without attempting a keyless channel lookup', async () => {
  const result = await sourceService.analyzeUrl('https://youtube.com/@OpenAI');

  assert.equal(result.status, 'detected');
  assert.equal(result.type, 'channel');
  assert.equal(result.externalId, '@OpenAI');
  assert.equal(result.channel, null);
  assert.equal(result.metadataStatus, 'unavailable');
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
