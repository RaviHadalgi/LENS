import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { YouTubeSyncStore } from "./youtube-sync.store";
import {
  TranscriptProcessingAdapter,
  VideoProcessingService,
  type VideoProcessingResult,
} from "./video-processing.service";

const result: VideoProcessingResult = {
  provider: "test-fixture", processorVersion: "1", contentHash: "fixture-content-hash",
  claims: [{ text: "A source statement", context: "A test example", startSeconds: 12, endSeconds: 18 }],
};

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "lens-processing-"));
  const path = join(directory, "test.sqlite");
  const store = new YouTubeSyncStore(path);
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.upsertVideo("source-a", {
    videoId: "video-a", title: "Example", url: "https://youtube.com/watch?v=video-a",
    publishedAt: null, status: "needs-review",
  });
  return { store, path };
}

test("persists successful results, timestamps and audit history across reopen", async t => {
  const { store } = await fixture(t);
  const service = new VideoProcessingService(store, { async process() { return result; } });
  assert.equal((await service.process("video-a", "source-a")).status, "processed");
  await store.close();
  const savedVideo = (await store.listSourceVideos("source-a"))[0];
  assert.equal(savedVideo.status, "processed");
  assert.deepEqual(savedVideo.sourceStatements, result.claims);
  const attempts = await store.listProcessingAttempts("video-a", "source-a");
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].resultJson, null);
  const versions = await store.listContentVersions("video-a", "source-a");
  assert.deepEqual(JSON.parse(String(versions[0].resultJson)), result);
  assert.ok(attempts[0].startedAt);
  assert.ok(attempts[0].finishedAt);
  assert.equal(attempts[0].error, null);
  const unchanged = await service.process("video-a", "source-a");
  assert.equal(unchanged.status, "unchanged");
  assert.equal((await store.listProcessingAttempts("video-a", "source-a")).length, 2);
  assert.equal((await store.listContentVersions("video-a", "source-a")).length, 1);
});

test("failure is persisted safely and a retry retains both attempts", async t => {
  const { store } = await fixture(t);
  let fail = true;
  const service = new VideoProcessingService(store, { async process() {
    if (fail) throw new Error("secret-provider-token");
    return result;
  } });
  assert.equal((await service.process("video-a", "source-a")).status, "failed");
  assert.equal((await store.listSourceVideos("source-a"))[0].status, "failed");
  fail = false;
  assert.equal((await service.process("video-a", "source-a")).status, "processed");
  const history = await store.listProcessingAttempts("video-a", "source-a");
  assert.deepEqual(history.map(x => x.status), ["failed", "processed"]);
  assert.equal(history[0].resultJson, null);
  assert.doesNotMatch(String(history[0].error), /secret-provider-token/);
});

test("wrong ownership and missing videos never invoke the adapter or create attempts", async t => {
  const { store } = await fixture(t);
  const service = new VideoProcessingService(store, { async process() { assert.fail("Adapter must not run"); } });
  assert.equal((await service.process("video-a", "source-b")).status, "not-found");
  assert.equal((await service.process("missing", "source-a")).status, "not-found");
  assert.equal((await store.listProcessingAttempts("video-a", "source-a")).length, 0);
  assert.equal((await store.listSourceVideos("source-a"))[0].status, "needs-review");
});

test("concurrent services cannot process the same video twice", async t => {
  const { store, path } = await fixture(t);
  const otherStore = new YouTubeSyncStore(path);
  t.after(() => otherStore.close());
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = new VideoProcessingService(store, { async process() { entered(); await gate; return result; } });
  const second = new VideoProcessingService(otherStore, { async process() { assert.fail("Duplicate processing"); } });
  const pending = first.process("video-a", "source-a");
  await started;
  try {
    assert.equal((await second.process("video-a", "source-a")).status, "conflict");
  } finally { release(); }
  assert.equal((await pending).status, "processed");
});

test("invalid adapter output fails without persisting partial results", async t => {
  const { store } = await fixture(t);
  const service = new VideoProcessingService(store, { async process() {
    return { ...result, claims: [{ ...result.claims[0], startSeconds: 20, endSeconds: 10 }] };
  } });
  assert.equal((await service.process("video-a", "source-a")).status, "failed");
  assert.equal((await store.listProcessingAttempts("video-a", "source-a"))[0].resultJson, null);
});

test("discovered videos must pass the review gate", async t => {
  const { store } = await fixture(t);
  await store.updateVideoStatus("video-a", "source-a", "discovered");
  const service = new VideoProcessingService(store, { async process() { assert.fail("Review required"); } });
  assert.equal((await service.process("video-a", "source-a")).status, "conflict");
});

test("completion rolls back if video state changed and cannot finalize twice", async t => {
  const { store } = await fixture(t);
  const attempt = await store.beginProcessing("video-a", "source-a");
  assert.equal(attempt.status, "started");
  if (attempt.status !== "started") return;
  await store.updateVideoStatus("video-a", "source-a", "needs-review");
  await assert.rejects(store.finishProcessing(attempt.attemptId, result, null));
  assert.equal((await store.listProcessingAttempts("video-a", "source-a"))[0].status, "processing");
  await store.updateVideoStatus("video-a", "source-a", "processing");
  await store.finishProcessing(attempt.attemptId, result, null);
  await assert.rejects(store.finishProcessing(attempt.attemptId, result, null));
});

test("transcript adapter normalizes content hashing and preserves source statements", async () => {
  const first = await new TranscriptProcessingAdapter({
    language: "en",
    segments: [{ text: "A  source statement", startSeconds: 3, endSeconds: 7 }],
  }).process();
  const same = await new TranscriptProcessingAdapter({
    language: "EN",
    segments: [{ text: "A source statement", startSeconds: 3, endSeconds: 7 }],
  }).process();

  assert.equal(first.contentHash, same.contentHash);
  assert.equal(first.claims[0]?.text, "A  source statement");
  assert.equal(first.claims[0]?.startSeconds, 3);
  assert.equal(first.provider, "user-supplied-transcript");
});

test("changed transcript creates a new content version", async t => {
  const { store } = await fixture(t);
  let current = result;
  const service = new VideoProcessingService(store, { async process() { return current; } });

  assert.equal((await service.process("video-a", "source-a")).status, "processed");
  current = { ...result, contentHash: "changed-content-hash", claims: [
    { text: "Changed statement", context: "Changed", startSeconds: null, endSeconds: null },
  ] };
  const changed = await service.process("video-a", "source-a");
  assert.equal(changed.status, "processed");
  assert.equal((await store.listContentVersions("video-a", "source-a")).length, 2);
});

test("stale processing attempts recover to a retryable failure", async t => {
  const { store, path } = await fixture(t);
  const started = await store.beginProcessing("video-a", "source-a");
  assert.equal(started.status, "started");
  await store.close();

  const db = new DatabaseSync(path);
  db.prepare("UPDATE video_processing_attempts SET started_at = ? WHERE video_id = ?")
    .run("2000-01-01T00:00:00.000Z", "video-a");
  db.close();

  const reopened = new YouTubeSyncStore(path);
  t.after(() => reopened.close());
  assert.equal((await reopened.listSourceVideos("source-a"))[0]?.status, "failed");
  const attempts = await reopened.listProcessingAttempts("video-a", "source-a");
  assert.equal(attempts[0]?.status, "failed");
  assert.match(String(attempts[0]?.error), /interrupted/);
});

test("manual status transitions cannot overwrite processing or processed states", async t => {
  const { store } = await fixture(t);
  assert.equal(await store.transitionVideoStatus("video-a", "source-a", "skipped"), "updated");
  assert.equal(await store.transitionVideoStatus("video-a", "source-a", "needs-review"), "updated");
  const attempt = await store.beginProcessing("video-a", "source-a");
  assert.equal(attempt.status, "started");
  assert.equal(await store.transitionVideoStatus("video-a", "source-a", "skipped"), "conflict");
});
