# LENS Client Requirements and Implementation Status

Last reconciled: 24 November 2026

This document reconciles the LENS product specification, technical architecture, development checkpoint, and implementation trackers with the client code that exists today. The shared Word documents describe intended behavior and earlier plans; the checked-in Angular application is the authority for current behavior.

Server status is documented separately in [`../server/PROJECT-REQUIREMENTS-AND-STATUS.md`](../server/PROJECT-REQUIREMENTS-AND-STATUS.md).

## Maintenance rule

Every user-requested client, route, component, user-flow, presentation, accessibility, or client-integration change must update this file in the same change. Update the affected requirement status, implemented behavior, limitations, roadmap, verification evidence, and `Last reconciled` date, then add a concise entry to **Change history**. Cross-cutting changes must also update the server status document. The repository-wide rule is defined in [`../AGENTS.md`](../AGENTS.md).

## Status legend

| Status | Meaning |
| --- | --- |
| **Implemented** | Present in the current client and covered by the normal verification suite. |
| **Partial** | A visible or useful foundation exists, but the complete product workflow is not available. |
| **Not implemented** | Required by the product documents but no working client workflow exists yet. |

## Product and experience requirements

### Application structure and design principles

| Requirement from the shared documents | Status | Current client behavior | Remaining work |
| --- | --- | --- | --- |
| Calm, non-technical interface around Listen, Extract, Navigate, and Synthesize | **Partial** | A consistent application shell, sidebar, top bar, cards, badges, buttons, fields, and modal patterns are present. Technical ingestion details are mostly hidden. | Complete the core product pages and replace placeholder content with real knowledge workflows. |
| Main areas: Ask, Sources, Knowledge, Review, Compare, Life, and Settings | **Partial** | Ask and Sources have routes. The sidebar shows the broader information architecture. | Implement routes and working pages for Knowledge, Review, Compare, Life, and Settings. |
| Responsive desktop-first experience | **Partial** | The shell, source modal, cards, and source inventory have responsive styling. | Test and refine all final workflows at supported desktop/tablet sizes and define accessibility targets. |
| Shared reusable UI components | **Implemented** | The client uses shared `LensButton`, `LensCard`, `LensBadge`, `LensFormField`, and `LensModal` components plus reusable Ask components. | Expand the system with tables, empty/error states, evidence displays, review controls, and notifications. |
| Make source material, LENS synthesis, and user judgment visually distinct | **Partial** | Saved transcript panels explicitly label verbatim source material, while Ask cards and perspective labels demonstrate the intended synthesis presentation. | Bind Ask to real data and add explicit labels for verification and user notes. |

### Sources and ingestion

| Requirement from the shared documents | Status | Current client behavior | Remaining work |
| --- | --- | --- | --- |
| Add a YouTube channel, playlist, or video by URL | **Partial** | The add-source modal accepts a URL and calls the analysis API. The UI recognizes channel, playlist, and video types. | Implement saved inventory/sync flows for playlist and direct-video sources; current processing start is channel-oriented. |
| Show source metadata before processing | **Implemented** | The analysis step shows available title, author, thumbnail, source type, and a conservative creator identity draft. It includes error and unavailable-metadata states. | Add explicit metadata provenance and user correction for source identity. |
| Review and edit creator identity without fabricated credentials | **Partial** | The profile step uses public metadata, marks identity for review, and avoids inventing biography or credentials. Editable profile controls exist. | Persist edits to the server, store evidence, distinguish self-claims from independent evidence, and support later correction. |
| Choose full channel, playlists, recent videos, or selected videos | **Partial** | Backfill choices are represented in the add-source interface. | Connect each selection to a distinct server request; current channel sync uses the recent public feed regardless of the visual choice. |
| Save a source library | **Implemented** | The Sources page loads persisted source accounts from the server and displays source type, state, inventory size, and sync details. | Add search/filter, optional archive, health indicators, and source settings. |
| Fetch latest content from a saved source without duplicates | **Implemented** | A selected source has a Fetch latest action. It refreshes the saved source through its source key, reloads the inventory, updates the item count, prevents overlapping refreshes, and reports whether new content was added or the source was already current. Server-side stable-ID handling prevents duplicates. | Add scheduled refresh, notification preferences, and refresh support for future playlist/direct-video sources. |
| Delete a source with explicit confirmation | **Implemented** | A selected source has a Remove source action. A modal explains that associated content and history will be deleted; Cancel/close leaves the source unchanged, while Remove calls the deletion API and clears the deleted source from the interface. Server errors keep the source and modal available for retry. | Extend the warning text if future source-owned data categories are added. |
| Show per-source content inventory, saved transcripts, and processing status | **Implemented** | Selecting a source loads its videos with published date, workflow status, current version, statement count, and the persisted verbatim transcript statements. Optional timestamps are formatted as readable ranges, and long transcripts remain contained within the video card. | Add pagination, sorting, richer failure details, processing history, prior-version browsing, and direct statement editing. |
| Support discovered, processing, processed, skipped, needs-review, and failed states | **Implemented** | The inventory renders the persisted workflow state and exposes allowed review/skip/process/retry actions. It does not let the user manually mark an item processed. | Add a queued state and background progress/notification experience. |
| Retry failed processing | **Implemented** | Failed items can be retried through the transcript-processing flow. | Add retry explanation, attempt history, and policy/limit feedback. |
| Notify users when new content or review work arrives | **Not implemented** | No notification center or background update exists. | Add scheduled-sync results, review counts, completion/failure notices, and user preferences. |

### Transcript and processing experience

| Requirement from the shared documents | Status | Current client behavior | Remaining work |
| --- | --- | --- | --- |
| Obtain and process transcripts where permitted | **Partial** | A user can paste transcript text for a video and submit it to the server. | Add a permitted automatic transcript option, availability state, provider choice, and clear fallback behavior. |
| Segment long-form content | **Partial** | Blank-line-separated paragraphs are submitted as individual segments/source statements. | Add automatic topic segmentation, editing/reordering, merge/split controls, and contextual overlap. |
| Retain source timestamps | **Partial** | The API model stores optional start/end timestamps and the saved transcript view renders them as readable ranges. The current paste interface still sends `null` timestamps. | Add timestamp input/import and links back to the original source moment. |
| Show safe processing results | **Implemented** | The client reports processed versus unchanged content, current version, source-statement count, and every stored statement for the current version. Newly processed text appears immediately. | Add richer provenance, attempt history, prior-version selection, and changed-version comparison. |
| Allow transcript correction and new versions | **Implemented** | A processed item can be opened again with an updated transcript; unchanged input reuses the version and changed input creates a new version. | Preload the existing transcript, present diffs, and allow version selection/rollback. |
| Allow users to edit segments and extracted claims | **Not implemented** | Transcript text can be resubmitted, but there is no segment or claim editor after processing. | Add reviewed segment/claim editing with audit history and immutable source text. |

### Ask and knowledge navigation

| Requirement from the shared documents | Status | Current client behavior | Remaining work |
| --- | --- | --- | --- |
| Natural-language Ask interface | **Partial** | Ask input, submission behavior, Enter/Shift+Enter handling, suggestions, multi-turn conversation layout, and answer cards are implemented. Each submitted turn is saved to the active local session, but responses are generated from local mock data. | Connect Ask to a real server retrieval and synthesis API. |
| Persist, resume, and delete Ask conversations | **Implemented** | The first question creates a session titled from that question. Follow-ups remain in the same context, update its position in Recent, and survive reload/restart. Selecting Recent restores every ordered turn. New chat immediately clears the page and invalidates older in-flight work so the next question creates a separate session. Each Recent row has a confirmed Delete action; deleting the open session returns Ask to a clean new chat. | Add conversation rename, search, pagination, and retention controls when required. |
| Quick/current, related knowledge, and deep analysis levels | **Partial** | The interface exposes All, Related, and Deep modes and changes mock copy. | Define the final names/contracts and send mode-specific queries to the server. |
| Compare creator perspectives | **Partial** | The mock answer presents separate source-perspective cards, common ground, differences, and example timestamps. | Populate these from saved claims and implement a dedicated Compare workflow. |
| Filter repetition and surface new connections | **Partial** | The mock answer displays example counts for repeated items and new connections. | Compute and explain these values from real novelty classifications. |
| Preserve provenance and link to source moments | **Partial** | Mock perspective cards display creator, perspective, context, statement, and timestamp. | Use real evidence records, source URLs, timestamp links, and confidence/verification labels. |
| Explain “Why am I seeing this?” | **Partial** | A visual control is present in the answer design. | Wire it to a retrieval explanation with matched concepts, ranking reason, and provenance. |
| Browse a structured knowledge library | **Not implemented** | There is no Knowledge route or real knowledge browser. | Add claim/concept/theme browsing, filters, source context, versions, and relationships. |
| Source-only, evidence, timeline, conflict, and decision-support modes | **Not implemented** | No real query modes or responses exist. | Add mode selection and mode-specific results once server support exists. |

### Review and user knowledge

| Requirement from the shared documents | Status | Current client behavior | Remaining work |
| --- | --- | --- | --- |
| Central review queue | **Not implemented** | Video-level `needs-review` is visible under Sources, but there is no Review page or cross-product queue. | Add reasons, priority, source context, approve/edit/reject actions, and history. |
| Mark knowledge as already know, know/do, know/not consistently apply, new, irrelevant, disagree, explore, or remember | **Not implemented** | No user knowledge controls exist. | Add clear controls and bind them to a UserKnowledge API. |
| Keep personal notes, goals, actions, and conclusions separate from source knowledge | **Not implemented** | No personal knowledge workflow exists. | Add separate creation, linking, browsing, and history interfaces. |
| Allow correction of creator/source classification | **Partial** | The creator profile form is editable during source setup. | Persist changes, show evidence and source of each field, and expose later editing. |

### Life, ownership, and settings

| Requirement from the shared documents | Status | Current client behavior | Remaining work |
| --- | --- | --- | --- |
| Reflective Life view without a universal score | **Not implemented** | A sidebar destination is shown but no route or data view exists. | Build descriptive timelines and trends with observed/user-reported/estimated/AI provenance. |
| Local data visibility and control | **Partial** | Sources and processing data come from the local server, and an individual source can be permanently removed after confirmation. | Add storage location/status, export, backup, restore, retention, and full-account deletion controls. |
| Markdown/JSON export and optional Google Drive backup | **Not implemented** | No export or backup UI exists. | Add previewable local export first, then an explicitly connected Drive option. |
| Secure provider/model settings and cost controls | **Not implemented** | There is no settings workflow for secrets, providers, budgets, or usage. | Add secure configuration, estimated/actual usage, processing consent, and model/provider choices. |

## Implemented client surface

### Routes

| Route | Current state |
| --- | --- |
| `/ask` | Working persistent multi-turn interface. `?chat=<conversationId>` restores a saved session; answers are still mock and no real retrieval occurs. |
| `/sources` | Working local-server integration for analysis, channel sync, latest-content refresh, source inventory, saved transcript display, video status, transcript processing, and confirmed source deletion. |
| `/knowledge` | Not defined; sidebar navigation ultimately falls back to `/ask`. |
| `/review` | Not defined; sidebar navigation ultimately falls back to `/ask`. |
| `/compare` | Not defined; sidebar navigation ultimately falls back to `/ask`. |
| `/life` | Not defined; sidebar navigation ultimately falls back to `/ask`. |
| `/settings` | Not defined. |

The root route redirects to `/ask`, and unknown routes also redirect to `/ask`.

### Working Sources flow

1. Open the add-source modal and enter a YouTube URL.
2. Analyze the URL through the local server and display available metadata.
3. Review the conservative creator/source identity draft.
4. For a supported channel, start sync and display discovered/reused content.
5. Load persisted sources and select one to view its video inventory.
6. Choose Fetch latest to discover only newer YouTube videos, refresh the inventory, and receive an added/already-current message without duplicates.
7. Move a discovered/failed/skipped item to `needs-review`, or skip an eligible item.
8. Paste transcript text; blank lines create separate source statements.
9. Process, retry, or submit an updated transcript.
10. Display processed/unchanged outcome, current content version, statement count, and the saved verbatim transcript statements under the owning video.
11. Show readable timestamp ranges when stored; contain long transcripts in a scrollable statement panel.
12. Choose Remove source, review the permanent-deletion warning, and either cancel without changes or confirm removal of the source and its associated data.

### Working Ask presentation

- Natural-language input and suggestion cards.
- Current/all, related, and deep analysis selector.
- Source perspective cards with creator, perspective, context, statement, and timestamp presentation.
- Common-ground and differences sections.
- Summary statistics and a visual evidence/explanation affordance.
- Persistent multi-turn context for follow-up questions.
- Recent sessions loaded in most-recently-updated order; choosing one restores its full context.
- New chat clears the active session and URL immediately; late load/save responses cannot restore the previous context.
- Each Recent session has a Delete action with a permanent-deletion confirmation. Confirming removes the session and all messages; cancel leaves it unchanged.

Ask questions, modes, answers, and ordering are stored by the local server. Answer content and statistics are currently mock data and must not be treated as retrieved LENS knowledge.

## Current limitations

- Ask calls the server to persist and restore conversation history, but it does not search source knowledge or generate grounded answers.
- Only Ask and Sources are routable. Knowledge, Review, Compare, Life, and Settings remain navigation placeholders.
- Playlist and video URLs can be analyzed, but the end-to-end save/process flow is currently built around channel sync.
- Backfill selection is visual only; it does not yet change the server ingestion strategy.
- Creator profile edits are not persisted.
- Transcript entry is manual, splits only on blank lines, and does not capture timestamps.
- Current saved statements and basic context can be browsed. Rich provenance, processing attempts, prior versions, and version comparisons are not yet visible.
- There is no claim/concept editor, ambiguity review, novelty/contradiction display, or confidence/verification workflow.
- There is no user knowledge state, personal note, goal, action, conclusion, external research, or Life interface.
- There are no background progress updates, notification center, offline/reconnect treatment, or scheduled monitoring controls.
- The API base URL is hard-coded to `http://localhost:3000/api` instead of using environment configuration.
- Conversation rename, search, pagination beyond the 30-item Recent list, and retention controls are not implemented.
- Accessibility, keyboard coverage, and responsive behavior need a dedicated audit after the full workflows exist.

## Future enhancement order

1. **Complete source setup:** persist creator edits, make backfill choices functional, and add playlist/direct-video flows with clear unsupported/error states.
2. **Improve transcript work:** offer permitted automatic retrieval plus manual fallback, timestamps, language, preview, segment editing, and source links.
3. **Expose processing evidence:** add views for statements, normalized claims, provenance, attempts, versions, failures, and changed-content diffs.
4. **Build the Review page:** combine source identity, failed content, uncertain claims, conflicts, and missing evidence into one actionable queue.
5. **Connect Ask to retrieval:** replace mock answers with real local queries, citations, timestamps, and retrieval explanations while retaining the implemented persistent session flow.
6. **Build Knowledge and Compare:** browse concepts/claims/themes, inspect relationships, compare sources, and show position changes over time.
7. **Add user judgment:** implement the full knowledge-state vocabulary and separate notes, goals, actions, and conclusions.
8. **Build monitoring feedback:** background sync/processing progress, completion/failure notices, new-content summaries, and review counts.
9. **Add Life carefully:** descriptive timelines and trends with provenance labels, user correction, and no universal score.
10. **Complete Settings and ownership:** environment/server configuration, export, full-account deletion, backup/restore, optional Drive connection, secret handling, provider choice, and cost controls. Keep source deletion synchronized with future source-owned entities.
11. **Harden the experience:** accessibility, keyboard navigation, responsive QA, offline/reconnect behavior, pagination, filtering, and large-library performance.

## Verification evidence

At this reconciliation point:

- The client test suite passes: **42 tests**.
- The Angular production build passes.
- The production bundle is approximately **410.60 kB raw** and **103.14 kB estimated transfer** at the latest verification.
- The Sources page stylesheet is below the configured 12 kB warning threshold; the maximum style error limit remains 16 kB.
- Tests cover conversation API calls including deletion, Recent loading, active-session restoration, turn saving, Recent reordering, deletion state cleanup, and rejection of stale load/save responses after New chat, plus Sources interactions including inventory loading, persisted transcript rendering, timestamp formatting, latest-content refresh, failure preservation, status actions, processing, immediate statement display, retry, updated transcript submission, outcome display, deletion confirmation/cancellation, and successful removal.

## Change history

| Date | Change recorded | Requirement/limitation impact | Verification |
| --- | --- | --- | --- |
| 24 November 2026 | Reconciled all five shared LENS documents with the current Angular client; documented the application shell, mock Ask experience, Sources integration, inventory states, transcript submission, retry, and content-version feedback. Added the mandatory documentation-maintenance rule. | Requirements are now classified as Implemented, Partial, or Not implemented. Ask retrieval, remaining product routes, automatic transcripts, persisted creator edits, review, user knowledge, Life, settings, and ownership controls remain future work. | All 28 client tests and the Angular production build passed. Documentation consistency check passed. |
| 24 November 2026 | Added a Remove source action and confirmation modal. Cancel/close preserves the source; confirmation calls the deletion API, removes the source from the library, and clears selected content state. Failed deletion leaves the source visible and shows a retryable error. | Confirmed source deletion is implemented. Export, backup, full-account deletion, and deletion coverage for future knowledge entities remain future work. | All 32 client tests passed; the production build and documentation consistency checks passed. |
| 24 November 2026 | Added Fetch latest beside the selected source controls. It refreshes the saved source, reloads its inventory and count, blocks overlapping refreshes, and reports new-content or already-current outcomes. | Manual latest-content refresh is implemented for saved YouTube channels. Scheduled refresh and non-channel source support remain future work. | All 35 client tests passed; server deduplication coverage and the Angular production build passed. |
| 24 November 2026 | Replaced the illustrative Recent list with locally persisted Ask sessions. The first question creates a session, follow-ups append to the same context, selecting Recent restores the full conversation, and New chat starts a separate context on the next question. | Ask session persistence is implemented. The answer payload remains mock data; retrieval, grounded synthesis, and conversation management controls remain future work. | All 41 client tests, all 36 server tests, and the Angular production build passed. |
| 24 November 2026 | Added a Delete control to every Recent session with a confirmation dialog. Confirming removes the complete saved conversation; deleting the open session returns to a blank Ask page. New chat now hard-resets the Ask URL and ignores late load/save responses so the prior context cannot reappear. | Conversation deletion and reliable New chat isolation are implemented. Rename, search, pagination, retention controls, and grounded answer retrieval remain future work. | All 42 client tests, all 36 server tests, and the Angular production build passed. |
| 24 November 2026 | Added saved transcript display to the selected source inventory. Each processed video now shows its current version's verbatim statements, optional timestamp ranges, and context in a contained panel; newly processed text appears immediately. | Current saved transcripts are browsable. Prior versions, attempt history, richer provenance, and statement editing remain future work. | All 42 client tests, all 36 server tests, and the Angular production build passed. |

## Source documents reconciled

- `LENS_Product_Concept_and_V1_Specification.docx`
- `LENS_Technical_Architecture_V1_final.docx`
- `LENS_Development_Prompts_and_Checkpoint.docx`
- `LENS_Implementation_Progress_Tracker_2026-08-30.docx`
- `LENS_Implementation_Tracker_2026-08-31.docx`

The early architecture proposed possible React choices. The implemented client is Angular 22 with standalone components and Tailwind CSS 4. This document records the implemented stack while retaining the product requirements and interaction goals that still apply.
