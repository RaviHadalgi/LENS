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

`data/youtube-sync-state.json` stores source state and discovered video IDs. It is gitignored.

`lastCheckedAt` is updated when a sync begins. `lastSuccessfulSyncAt` advances only after the feed has been read and all discovered entries have been persisted.

Known video IDs are the authoritative deduplication identity. The feed is treated as a recent, newest-first discovery surface, so the sync stops at the first already-known video rather than traversing older entries unnecessarily.
