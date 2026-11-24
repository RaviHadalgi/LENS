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

Verification at this checkpoint: all 33 server tests and all 32 client tests pass. Coverage includes
success, failure and retry, ownership, review gating, duplicate prevention,
unchanged and changed versions, stale-attempt recovery, validation, persistence,
transaction rollback, and the client transcript request. Source-service tests use
local HTML fixtures rather than live YouTube access. Angular's application test
bundle and production build both complete successfully. The component-style warning
threshold is 12 kB, with the existing 16 kB error limit retained; the Sources page
remains below the configured warning threshold.

## Source deletion checkpoint — 24 November 2026

`DELETE /api/sources/:sourceKey` permanently removes a source account and all of
the data currently owned by that source: discovered videos, processing attempts,
and content versions. The operation uses one immediate SQLite transaction, returns
`404` when the source does not exist, and rolls back every deletion if any step
fails. Records owned by other sources are not changed.

The Sources page exposes this action only after a source is selected. A confirmation
modal names the source, lists the associated data that will be removed, and provides
Cancel and Remove source actions. Cancel and modal close leave all data unchanged.
After a successful confirmation, the client removes the source from the library and
clears its selected videos and processing state. A failed request keeps the source
and confirmation open with an error so the user can retry.

Verification now includes all 33 server tests and all 32 client tests. The deletion
coverage checks associated-data removal, rollback-safe transactional structure,
cross-source isolation, the DELETE request, confirmation cancellation, successful UI
cleanup, and failure preservation.

## Fetch latest checkpoint — 24 November 2026

`POST /api/sources/:sourceKey/sync` refreshes a previously saved YouTube channel
using its stored canonical channel identity. The server reads the public newest-first
Atom feed and uses the YouTube video ID as the authoritative identity. It persists
new entries until it reaches the first known ID, then stops. Repeating the refresh
therefore creates no duplicate video rows and does not overwrite existing ownership.

The selected-source header now includes Fetch latest beside Remove source. While a
refresh is active, overlapping refresh/removal actions are blocked. On success, the
client reloads the inventory from the server, updates the source item count, and
reports either how many items were added or that the available content was already
current. A failed refresh preserves the existing inventory and displays a retryable
error.

Verification now includes all 34 server tests and all 35 client tests. New coverage
proves that a newer video is added before a known feed entry, repeated refreshes add
nothing, the client uses the saved-source sync endpoint, inventory counts refresh,
and failures preserve existing content.

## Ask conversation checkpoint — 24 November 2026

Ask sessions are now stored locally in `data/lens-conversations.sqlite`. The first
submitted question creates a UUID conversation and derives its display title from
that question. Follow-up questions append ordered turns to the same conversation and
advance its updated timestamp. The conversation API lists the 30 most recently
updated sessions and restores a selected session with its complete turn history.
SQLite foreign keys keep every turn owned by one conversation, and the store remains
available after a server restart.

The Angular sidebar loads the persisted Recent list. Selecting an item restores its
context, while New chat clears the active context so the next question creates a
separate session. Answers are still generated by the existing client mock and stored
only so the conversation can be replayed. Server-side knowledge retrieval, grounded
synthesis, conversation rename/delete/search, and configurable retention remain
future work.

Verification now includes all 36 server tests and all 41 client tests, plus the
Angular production build. Conversation coverage checks first-turn creation,
follow-up append, recent-list deduplication, persistence across reopen, unknown-session
rejection, API integration, session restoration, and the New chat state boundary.

Recent conversations can now be permanently deleted through
`DELETE /api/conversations/:conversationId`. SQLite foreign-key cascade ownership
removes every saved turn for that conversation and leaves other conversations
unchanged. The client asks for confirmation before calling this endpoint. Deleting
the open conversation also resets Ask to a clean new session. New chat now invalidates
pending conversation loads and saves, so a late response cannot reactivate the
previous context. Verification includes all 36 server tests and all 42 client tests.
