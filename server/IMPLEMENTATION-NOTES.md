# LENS YouTube RSS sync

This server implementation uses YouTube's public channel Atom feed only for channel video discovery:

`https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID`

No YouTube Data API key, OAuth, Piped, RapidAPI, scraping service, or external YouTube data provider is used.

## Supported sync input

- `/channel/UC...`: synchronizes the public Atom feed.
- `/@handle`, `/c/...`, `/user/...`: retained as detected sources but return `needs-review` because the RSS endpoint requires the underlying channel ID.

## Discovered video fields

- `videoId`
- `title`
- `url`
- `publishedAt`
- `discoveredAt` (added by the sync service)
- `status`

## Sync state

`data/youtube-sync.sqlite` stores source accounts and discovered video IDs. It is gitignored.

`lastCheckedAt` is updated when a sync begins. `lastSuccessfulSyncAt` advances only after the feed has been read and all discovered entries have been persisted.

Known video IDs are the authoritative deduplication identity. The feed is treated as a recent, newest-first discovery surface, so the sync stops at the first already-known video rather than traversing older entries unnecessarily.

## Transcript processing checkpoint — 24 November 2026

`VideoProcessingService` defines a provider-independent processing contract. The
first connected adapter accepts a user-supplied transcript, validates its size and
timestamps, hashes normalized content, and preserves each supplied segment as a
source statement. It does not summarize text or invent claims. The HTTP processing
endpoint and Sources UI now use this path. No media download, credential, paid
service, external model call, or automatic transcript scraper was added.

Processing is transactional. Starting an owned video records an attempt and changes
its state to `processing`. Completion creates or reuses a `content_versions` row,
sets the video's current version, and changes its state to `processed`. Failures use
a safe stored message and become retryable. Identical content returns `unchanged`
and reuses the existing version; changed text creates a new version. A unique index
prevents simultaneous attempts. Attempts left active for more than 15 minutes are
recovered as interrupted failures when the store reopens.
Processing attempts retain audit metadata and a content-version reference; transcript
statements are stored once in the version rather than duplicated in the audit log.

Manual status changes can only move eligible videos to `needs-review` or `skipped`.
They cannot overwrite `processing` or `processed`. The former UI action that marked
content processed without a result has been removed. The inventory now shows the
persisted current version and source-statement count after refresh.

The current transcript input is manual and has no timestamps in the UI. The API
adapter already accepts reliable segment timestamps when a future permitted caption
provider supplies them. The stored statements are the ingestion layer; semantic
claim extraction, concepts, relationships, novelty classification, and retrieval-first
Ask remain later knowledge-engine milestones.

Verification: all 32 server tests and all 28 client tests pass. Coverage includes
success, failure and retry, ownership, review gating, duplicate prevention,
unchanged and changed versions, stale-attempt recovery, validation, persistence,
transaction rollback, and the client transcript request. Source-service tests use
local HTML fixtures rather than live YouTube access. Angular's application test
bundle and production build both complete successfully. The component-style warning
threshold is 12 kB, with the existing 16 kB error limit retained; the Sources page
is currently about 10 kB.
