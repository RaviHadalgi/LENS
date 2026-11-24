# LENS Server Requirements and Implementation Status

Last reconciled: 24 November 2026

This document reconciles the LENS product specification, technical architecture, development checkpoint, and implementation trackers with the server code that exists today. The shared Word documents describe product intent and earlier plans; the checked-in code is the authority for current behavior.

Client status is documented separately in [`../client/PROJECT-REQUIREMENTS-AND-STATUS.md`](../client/PROJECT-REQUIREMENTS-AND-STATUS.md).

## Maintenance rule

Every user-requested server, API, data-model, ingestion, processing, retrieval, security, or operational change must update this file in the same change. Update the affected requirement status, implemented behavior, limitations, roadmap, verification evidence, and `Last reconciled` date, then add a concise entry to **Change history**. Cross-cutting changes must also update the client status document. The repository-wide rule is defined in [`../AGENTS.md`](../AGENTS.md).

## Status legend

| Status | Meaning |
| --- | --- |
| **Implemented** | Present in the current server and covered by the normal verification suite. |
| **Partial** | A useful foundation exists, but the full product requirement is not complete. |
| **Not implemented** | Required by the product documents but no working server capability exists yet. |

## Product and architecture requirements

### Product boundaries

| Requirement from the shared documents | Status | Current server behavior | Remaining work |
| --- | --- | --- | --- |
| Local-first personal knowledge and perspective engine | **Partial** | Source inventory and processing results are stored in a local SQLite database. | Build the knowledge, retrieval, review, user-state, and export layers. |
| Knowledge-first storage instead of a media archive | **Implemented** | The server stores URLs, metadata, transcript-derived source statements, hashes, and processing records. It does not download or retain original video/audio. | Add richer provenance and normalized knowledge entities without changing this boundary. |
| Preserve source wording, context, uncertainty, and provenance | **Partial** | User-supplied transcript segments are stored verbatim as source statements with language context and optional timestamps. | Store structured provenance per statement, preserve ambiguity explicitly, and separate later LENS synthesis from source material. |
| Keep source statements, LENS interpretation, and user judgment separate | **Partial** | The processing adapter produces only source statements and does not fabricate summaries. | Add separate stores and APIs for interpretations, verification, user classifications, notes, and conclusions. |
| Avoid inventing creator credentials or identity claims | **Implemented** | Creator identity is returned as a conservative `needs-review` draft based on public source metadata. | Add reviewed creator records and evidence-backed identity fields. |
| Local ownership, export, and deletion | **Partial** | Data is local by default. A source can be deleted with all owned data, and an individual video's saved transcript can be deleted with every version and processing attempt while retaining the source and video. | Add Markdown/JSON export, backup, restore, full account deletion, and data-retention controls. |

### Source ingestion and inventory

| Requirement from the shared documents | Status | Current server behavior | Remaining work |
| --- | --- | --- | --- |
| Accept YouTube channel, playlist, and video URLs | **Partial** | URL analysis detects channel, playlist, and video forms. | Implement inventory/sync for playlist and individual-video sources. |
| Analyze source metadata before saving | **Partial** | Public YouTube page metadata and video oEmbed data are used when available. Invalid and unsupported inputs are rejected. | Improve metadata reliability, caching, rate handling, and evidence attribution. |
| Support channel handles, IDs, custom URLs, and usernames | **Partial** | Common URL forms are detected. Canonical channel IDs are the reliable RSS sync path; other forms depend on public page resolution and can remain `needs-review`. | Add a robust channel-resolution flow with explicit user correction. |
| Backfill full channel, selected playlists, recent content, or specific videos | **Partial** | Recent channel videos can be discovered from YouTube's public Atom feed. | Implement the selected backfill mode, full history pagination, playlist ingestion, and specific-video import. |
| Stable external identity and duplicate prevention | **Implemented** | YouTube video ID is the stable content key. Initial and later refreshes skip existing videos and stop the newest-first feed scan at the first known ID, so repeated Fetch latest requests do not create duplicates. | Extend duplicate handling across playlists, direct video imports, and changed metadata. |
| Source library and per-source content inventory | **Implemented** | SQLite stores source accounts and discovered videos. The inventory API returns counts, processing information, and the verbatim source statements from each video's current saved content version. Source-level and individual-transcript deletion preserve ownership boundaries. | Add filtering, pagination, optional archival, richer source health data, and version-history browsing. |
| Delete a source and all associated data | **Implemented** | `DELETE /api/sources/:sourceKey` removes processing attempts, content versions, videos, and the source account in one SQLite transaction. Missing sources return `404`; any failure rolls back the operation. | Extend the deletion transaction when future source-owned knowledge tables are introduced. |
| Delete a saved transcript and its associated processing data | **Implemented** | `DELETE /api/sources/:sourceKey/videos/:videoId/transcript` transactionally removes every processing attempt and content version for the owned video, clears its current version, and returns it to `needs-review` without deleting the source or video. | Extend transcript deletion when normalized statement, claim, provenance, or embedding tables are added. |
| Lightweight recurring monitoring | **Partial** | A saved YouTube channel can be refreshed manually through its source key. Each refresh stores last-check and last-success timestamps and returns only newly discovered videos. | Add a scheduler, configurable cadence, background execution, notifications, and failure recovery. |

### Processing lifecycle and versioning

| Requirement from the shared documents | Status | Current server behavior | Remaining work |
| --- | --- | --- | --- |
| Track discovered, queued, processing, processed, skipped, needs-review, and failed states | **Partial** | The persisted lifecycle supports `discovered`, `processing`, `processed`, `skipped`, `needs-review`, and `failed`. State changes enforce ownership and valid transitions. | Add a real queued state and background worker. |
| Prevent concurrent processing of the same item | **Implemented** | Processing begins inside a SQLite immediate transaction and rejects an active attempt or invalid source state. | Move the same guarantee into a future job queue. |
| Record processing attempts and safe errors | **Implemented** | Each attempt stores start/end time, status, content-version link, and a sanitized error. Provider details and transcript content are not leaked in stored errors. | Add operational inspection APIs and structured failure categories. |
| Recover from interrupted work | **Implemented** | Stale `processing` attempts are recovered after the configured 15-minute threshold. | Make timeout configurable and add worker heartbeat/lease semantics. |
| Retry failed or reviewed content | **Implemented** | Failed, processed, or needs-review content can enter processing; manual status changes cannot overwrite active or completed processing. | Add explicit retry policies, limits, and operator history. |
| Detect unchanged content and version changed content | **Implemented** | Canonical transcript input is SHA-256 hashed. An existing hash reuses its version and returns `unchanged`; a changed hash creates a new immutable content version and updates the video's current version. | Add version comparison and rollback APIs, and version metadata for future providers. |
| Keep a content-version history | **Implemented** | `content_versions` records provider, processor version, hash, serialized result, creation time, and status. | Expose history through supported APIs and migrate serialized results into normalized knowledge tables. |

### Transcript, segmentation, and knowledge extraction

| Requirement from the shared documents | Status | Current server behavior | Remaining work |
| --- | --- | --- | --- |
| Acquire transcripts where permitted | **Partial** | The process endpoint accepts a user-supplied transcript. It does not scrape transcripts or download media. | Add a permitted transcript-provider adapter with explicit availability and policy handling. |
| Segment long-form content with timestamps | **Partial** | The API accepts up to 2,000 segments, optional start/end seconds, and validates timestamp order. | Add automatic topic segmentation, segment editing, overlap/context handling, and reliable timestamps. |
| Extract claims while preserving the original statement | **Partial** | Each submitted transcript segment becomes one verbatim source statement in the processing result. | Add normalized claim extraction, claim boundaries, evidence type, confidence, and human review. |
| Preserve ambiguous claims and possible interpretations | **Not implemented** | No interpretation layer exists yet. | Add ambiguity flags and separately stored possible interpretations without overwriting the original. |
| Classify claim/evidence type and perspective | **Not implemented** | No semantic classifier or model call is present. | Add conservative, reviewable classifiers for claim type, evidence type, creator perspective, and context. |
| Identify concepts and relationships | **Not implemented** | No concept or relationship graph is stored. | Add Concept, SharedTheme, and Relationship entities with provenance. |
| Compare with existing knowledge | **Not implemented** | Processing does not retrieve prior knowledge. | Add retrieval and comparison before classification. |
| Classify repeat, reinforcement, refinement, new perspective, contradiction, and new concept | **Not implemented** | No novelty classification exists. | Implement evidence-backed novelty classification and confidence/review rules. |
| Track recurring creator positions and their evolution | **Not implemented** | Content versions exist, but creator-position history does not. | Add creator claim timelines, change detection, and versioned summaries. |

### Retrieval, review, and personal knowledge

| Requirement from the shared documents | Status | Current server behavior | Remaining work |
| --- | --- | --- | --- |
| Persist, resume, and delete Ask conversations | **Implemented** | The local conversation store creates a session from the first question, appends later question/answer turns to that session, updates its recent timestamp, lists the 30 most recently updated sessions, restores the full ordered context after a restart, and permanently deletes a selected session with all turns through SQLite cascade ownership. | Add rename, search, pagination, and retention controls when required. |
| Retrieval-first Ask service | **Not implemented** | The server persists Ask session history, but it does not query, retrieve, rank, or synthesize knowledge. | Implement local retrieval, intent parsing, scoped context assembly, and cited synthesis, then generate answers on the server rather than accepting the current client mock payload. |
| Ask modes: quick, deep, compare, source-only, evidence, timeline, conflicts, decision support | **Not implemented** | Conversation turns retain the selected `all`, `related`, or `deep` presentation mode, but no mode changes server-side retrieval or synthesis. | Add explicit query modes and mode-specific response contracts. |
| Explain “Why am I seeing this?” | **Not implemented** | No retrieval trace is available. | Return source, match reason, ranking signal, and provenance with each answer item. |
| Review queue | **Not implemented** | `needs-review` exists as a video status only; there is no ReviewItem entity or queue API. | Add review reasons, priority, decisions, and audit history. |
| User knowledge states | **Not implemented** | No UserKnowledge entity exists. | Add the specified states: already know, know/do, know/not consistently apply, new, irrelevant, disagree, explore, and remember. |
| Personal notes, goals, actions, and conclusions | **Not implemented** | No personal-state entities or APIs exist. | Store these separately from source knowledge with history and provenance. |
| External research as a separate source class | **Not implemented** | Only YouTube source analysis exists. | Add web/document research with a distinct store and clear labeling. |
| Life-event and reflective analytics data | **Not implemented** | No LifeEvent or analytics model exists. | Add user-controlled observations with observed/user-reported/estimated/AI provenance and no scoring. |

### Safety, operations, and cost controls

| Requirement from the shared documents | Status | Current server behavior | Remaining work |
| --- | --- | --- | --- |
| Validate untrusted input | **Implemented** | Request and transcript data are validated; transcript segment count, segment size, total size, and timestamp ordering are bounded. | Apply the same approach to all future endpoints. |
| Protect ownership during updates | **Implemented** | Video operations require both source key and video ID, and transactional completion verifies the active processing state. | Add user-level authorization if the app becomes multi-user or remotely accessible. |
| Secure secrets | **Partial** | Current ingestion uses public endpoints and introduces no provider secret. | Add secure secret storage before any authenticated provider or model integration. |
| Authentication and remote-access security | **Not implemented** | The local Express service has no authentication and uses permissive CORS defaults. | Keep the service loopback-only by default or add authentication, origin restrictions, and transport security. |
| Cost-aware processing | **Partial** | No paid model or media processing is invoked; unchanged transcript input is deduplicated. | Add budgets, usage accounting, caching, model selection, and explicit consent before paid processing. |
| Backup and Google Drive export | **Not implemented** | No backup connector or export job exists. | Implement local export first, then optional user-authorized Drive backup. |

## Implemented server surface

### HTTP API

| Method and route | Current purpose |
| --- | --- |
| `GET /api/health` | Basic service health response. |
| `GET /api/sources` | Lists saved source accounts with content counts and sync state. |
| `DELETE /api/sources/:sourceKey` | Permanently deletes a source and its videos, processing attempts, and content versions in one transaction. |
| `POST /api/sources/analyze` | Detects a YouTube URL type and returns available metadata plus a reviewable creator identity draft. |
| `POST /api/sources/youtube/sync` | Resolves and syncs a YouTube channel's recent public feed into the local inventory. |
| `POST /api/sources/:sourceKey/sync` | Fetches the latest public-feed entries for a previously saved YouTube channel using its stored canonical channel identity and stable video-ID deduplication. |
| `GET /api/sources/:sourceKey/videos` | Lists a source's discovered videos, current version, processed time, source-statement count, and the current version's stored verbatim statements with context and optional timestamps. |
| `DELETE /api/sources/:sourceKey/videos/:videoId/transcript` | Permanently removes all saved transcript versions and processing attempts for an owned video, then returns the retained video to `needs-review`. |
| `PATCH /api/sources/:sourceKey/videos/:videoId/status` | Applies the allowed manual transitions to `needs-review` or `skipped`. |
| `POST /api/sources/:sourceKey/videos/:videoId/process` | Validates a supplied transcript, runs the processing adapter, and creates or reuses a content version. |
| `GET /api/conversations` | Lists up to 30 Ask sessions in most-recently-updated order with titles and turn counts. |
| `GET /api/conversations/:conversationId` | Restores one Ask session with all question/answer turns in chronological order. |
| `POST /api/conversations/turns` | Creates a session for a first turn or appends a validated turn to an existing session. |
| `DELETE /api/conversations/:conversationId` | Permanently deletes one Ask session and all of its saved turns; missing sessions return `404`. |

The process request is synchronous. Conversation endpoints persist the current client-generated Ask payload; there is currently no job-status, processing-history, content-version-history, claim, search/retrieval, generated-answer, review, export, or settings endpoint.

### Persisted data

| Current table | What it stores |
| --- | --- |
| `source_accounts` | Platform/source identity, URL, review state, sync timestamps, and audit timestamps. |
| `youtube_videos` | Stable YouTube ID, source ownership, metadata, workflow status, and current content-version reference. |
| `video_processing_attempts` | Processing ownership, state, timing, safe error, and content-version reference. |
| `content_versions` | Immutable content hash, adapter/provider, processor version, serialized source statements, and creation state. |
| `conversations` | Local Ask session identity, first-question title, and created/updated timestamps. |
| `conversation_turns` | Ordered questions, selected presentation modes, serialized client-generated answers, and timestamps for each session. |

The architecture documents also call for Creator, ContentItem, Segment, Claim, Concept, SharedTheme, Relationship, UserKnowledge, PersonalNote, Goal, Action, Conclusion, Provenance, ReviewItem, LifeEvent, and richer ProcessingLog models. Those normalized entities are not yet present.

## Current processing flow

1. Analyze a YouTube URL and obtain conservative metadata.
2. Sync a channel's recent Atom feed into the local video inventory.
3. Move a discovered video to `needs-review`, or skip it.
4. Submit a transcript divided into one or more segments.
5. Validate text size and optional timestamps.
6. Acquire transactional processing ownership and record an attempt.
7. Canonicalize and hash the transcript.
8. Preserve every segment as a source statement; no summary or inferred claim is invented.
9. Reuse the matching content version or create a new immutable version.
10. Mark the video processed, expose the current version and saved source statements, and retain retry/audit data.
11. On confirmed transcript deletion, remove all versions and attempts together while keeping the video available for a replacement transcript.

This covers the ingestion and safe-processing foundation. It does not yet perform the architecture's semantic extraction, knowledge comparison, graph updates, retrieval indexing, or notification steps.

## Current limitations

- Only recent YouTube channel feed sync is operational; playlist, direct-video, full-history, and selected-backfill workflows are incomplete.
- Transcript input is manual. There is no transcript provider, media download, speech-to-text, or caption availability check.
- Paragraphs/segments are preserved as source statements, not normalized semantic claims.
- No model is used for segmentation, perspective classification, novelty, contradiction detection, synthesis, or verification.
- Processing runs inside the request instead of a durable background queue.
- The current version's source statements are exposed in the source inventory. Prior content-version and processing-attempt histories remain hidden unless the user deletes the transcript, which removes those records together.
- The SQLite result payload is serialized JSON; normalized Claim, Segment, Provenance, Concept, and Relationship tables are still needed.
- Ask conversation history is local and persistent, but the stored answers are still client-generated mock content; there is no search index, embedding store, knowledge graph, retrieval service, grounded synthesis, or retrieval trace.
- Conversation rename, search, pagination beyond the 30-item Recent list, export, and configurable retention are not implemented.
- There is no review queue, user knowledge state, personal history, external research store, or Life data layer.
- There is no authentication, per-user boundary, restricted CORS policy, export service, full-account deletion, backup, monitoring dashboard, or notification system.
- The service URL/port and operational configuration are still development-oriented.

## Future enhancement order

1. **Finish ingestion breadth:** support playlist and direct-video sources, make backfill selection real, add pagination/full history, and improve channel resolution.
2. **Add permitted transcript acquisition:** introduce a provider interface, availability/error states, timestamps, language handling, and user correction while retaining manual paste as fallback.
3. **Normalize the knowledge model:** persist Segment, Claim, Provenance, Creator, Concept, Relationship, ProcessingLog, and ReviewItem records instead of relying on result JSON.
4. **Implement semantic processing:** topic segmentation, original/normalized claim pairs, context, evidence type, perspective, confidence, ambiguity, and conservative verification.
5. **Compare new knowledge:** retrieve relevant prior claims and classify repeat, reinforcement, refinement, new perspective, contradiction, and new concept.
6. **Build review workflows:** queue uncertain identity, metadata, claims, conflicts, missing evidence, and failed content for explicit user decisions.
7. **Implement Ask retrieval:** generate answers from local knowledge with intent parsing, query modes, cited synthesis, source-only responses, comparison, timelines, conflict views, and “Why am I seeing this?” traces while retaining the implemented session history.
8. **Add personal knowledge:** user knowledge states, notes, goals, actions, conclusions, and versioned user history in separate tables.
9. **Add background operation:** durable queue, worker leases, scheduled source monitoring, notifications, retry policies, and observability.
10. **Complete data ownership:** extend source deletion to future knowledge entities, then add Markdown/JSON export, full-account deletion, backup/restore, optional Google Drive backup, secure secrets, and production access controls.
11. **Add external research and Life data:** retain distinct provenance and keep reflective analytics descriptive rather than scored.

## Verification evidence

At this reconciliation point:

- The server test suite passes: **36 tests**.
- Tests cover conversation creation, multi-turn append, recent-session deduplication, restart persistence, complete conversation deletion with unrelated-session isolation, and rejection of unknown sessions, plus source analysis/sync foundations, latest-content refresh and repeated-refresh deduplication, state transitions, ownership, transactional source deletion and isolation, processing success/failure, persisted source-statement retrieval, complete per-video transcript cleanup, idempotent unchanged content, changed-content versioning, retry, concurrent-attempt prevention, stale-attempt recovery, and transcript validation.
- The default SQLite files are `server/data/youtube-sync.sqlite` and `server/data/lens-conversations.sqlite`; runtime data is excluded from version control.

## Change history

| Date | Change recorded | Requirement/limitation impact | Verification |
| --- | --- | --- | --- |
| 24 November 2026 | Reconciled all five shared LENS documents with the current server; documented source ingestion, SQLite inventory, transcript processing, content versioning, retry, ownership, and stale-attempt recovery. Added the mandatory documentation-maintenance rule. | Requirements are now classified as Implemented, Partial, or Not implemented. Automatic transcript acquisition, semantic knowledge extraction, retrieval, review, personal knowledge, background monitoring, export, and production access controls remain future work. | Server build and all 32 server tests passed. Documentation consistency check passed. |
| 24 November 2026 | Added permanent source deletion through `DELETE /api/sources/:sourceKey`. The deletion transaction removes the source account, owned videos, processing attempts, and content versions while preserving unrelated sources. | Source-level deletion is implemented. Future source-owned knowledge tables must join the same transaction; export, backup, retention, and full-account deletion remain future work. | Server build and all 33 server tests passed, including associated-data deletion and cross-source isolation. |
| 24 November 2026 | Added `POST /api/sources/:sourceKey/sync` for manually fetching the latest content from a saved YouTube channel. It uses the stored canonical channel identity and stops at the first known stable YouTube video ID. | Manual latest-content refresh is implemented for saved YouTube channels. Scheduled monitoring and playlist/direct-video refresh remain future work. | Server build and all 34 server tests passed, including new-before-known discovery and repeated-refresh duplicate prevention. |
| 24 November 2026 | Added local Ask conversation storage and APIs. A first turn creates a titled session, later turns append to the same context, Recent is ordered by the updated timestamp, and full ordered history survives server restart. | Ask session persistence is implemented. Answers remain client-generated mock data; retrieval, grounded synthesis, rename/delete/search, and retention controls remain future work. | Server build and all 36 server tests passed, including multi-turn append, recent-session behavior, restart persistence, and unknown-session rejection. |
| 24 November 2026 | Added `DELETE /api/conversations/:conversationId`. Deleting a conversation removes its complete turn history through the conversation foreign key while preserving every other session. | Ask conversation deletion is implemented. Rename, search, pagination, export, and configurable retention remain future work. | Server build and all 36 server tests passed, including complete deletion, repeat-delete handling, and unrelated-session isolation. |
| 24 November 2026 | Extended the per-source video inventory to return the current content version's stored source statements, context, and optional timestamps. Malformed legacy result JSON falls back to an empty statement list without breaking the inventory. | Saved transcripts can now be read when a source is selected. Prior-version browsing, attempt history, transcript editing, and normalized provenance remain future work. | Server build and all 36 server tests passed, including persisted statement and timestamp retrieval. |
| 24 November 2026 | Added transactional deletion for an individual video's saved transcript. The operation removes all content versions and processing attempts, clears the current version, returns the retained video to `needs-review`, and rejects missing or cross-source data. | Per-video transcript ownership and deletion are implemented. Future normalized statements, claims, provenance, and embeddings must join the same deletion boundary. | Server build and all 36 server tests passed, including complete transcript-history cleanup; all 44 client tests and the Angular production build passed. |

## Source documents reconciled

- `LENS_Product_Concept_and_V1_Specification.docx`
- `LENS_Technical_Architecture_V1_final.docx`
- `LENS_Development_Prompts_and_Checkpoint.docx`
- `LENS_Implementation_Progress_Tracker_2026-08-30.docx`
- `LENS_Implementation_Tracker_2026-08-31.docx`

The early architecture proposed possible Python/FastAPI and React choices. The implemented project currently uses TypeScript, Express, Node's SQLite API, and an Angular client. This document records that implemented stack while preserving the product and data-design requirements that remain applicable.
