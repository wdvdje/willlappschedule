# Sync Git Log Reconciliation

Date: 2026-05-10

## Current Sync Baseline (keep as source of truth)

- Active sync model is PouchDB/CouchDB configured in `index.html` settings and runtime helpers.
- Active persistence/events are wired through:
  - `window.initPouchSync` / `window.stopPouchSync` in `index.html`
  - `pouch-sync:*` events in `index.html`
  - service worker in `sw.js` for offline + push notifications
  - adapter-backed storage via `assets/storage-adapter.js`

## Reconciliation Decisions From Git Log

### Keep / Already represented in current code

- `7401fe2` (merge): Sync button/settings placement direction aligns with current settings sync section.
- `59bea86`: Sync error logging and fixes are aligned with current status/error reporting in settings sync handlers.
- `a930183`: Broad app feature bundle; only sync-toggle/settings intent is relevant and already reflected.
- `d594da6` (merge): Historical schedule-sync fixes conceptually superseded by current Pouch flow.

### Drop (legacy sync systems, not present in current architecture)

- `c22937f`: iCloud/background-sync-focused feature bundle (requires files not in current repo).
- `2c238b3`: iCloud Drive sync implementation (`icloud-sync.js`) not present.
- `65351ca`: iCloud sync WIP (`icloud-sync.js`) not present.
- `bc4c51c`: GitHub Gist sync (`gist-sync.js`) not present.
- `f46be3e`: Removal/toggling around gist sync from legacy branch path; not relevant to current Pouch baseline.
- `967562d`: Couchbase/server `sync.js` architecture is a different sync stack than current Pouch-in-browser model.

## Practical Rule Set

1. Do not reintroduce `icloud-sync.js`, `gist-sync.js`, or legacy `sync.js` paths.
2. Keep one sync architecture only: PouchDB/CouchDB + `pouch-sync:*` events.
3. If backporting from old commits, only cherry-pick bugfix hunks that touch existing current files and avoid introducing dead sync files.
4. Prefer manual patching over blind cherry-picks for old sync commits that bundled unrelated UI/features.

## Safe Backport Strategy

1. Start from current `main`.
2. For each old commit, inspect with:
   - `git show --name-only <hash>`
   - `git show <hash> -- index.html assets/app.js sw.js notifications.js push.js`
3. Copy only relevant bugfix lines into current files.
4. Verify settings sync still works (`start`, `stop`, `import`, status updates).

## Candidate Commits for selective manual review only

- `59bea86`
- `d594da6`

All other reviewed commits are architecture-divergent relative to current Pouch baseline and should remain excluded.

## Step 2 Outcome (detailed hunk review)

- Reviewed `59bea86` and `d594da6` against current files (`index.html`, `assets/app.js`, `sw.js`, `notifications.js`, `push.js`).
- Result: no directly applicable sync hunks remain to patch into current HEAD.

Notes:

1. `59bea86` references older symbols/sections not present in current code shape (e.g., old routine/sync-specific blocks and settings-pin constants from prior UI structure).
2. `d594da6` is a merge containing no meaningful sync changes for the current Pouch path.
3. Decision: mark both as reviewed/no-op for current architecture; do not cherry-pick.
