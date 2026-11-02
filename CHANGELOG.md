# Changelog — OCD Savior (强迫症拯救者)

## 0.2.0

- Add **Delete whole workspace (+ all sessions)** action: permanently deletes every
  session in the workspace that owns the clicked session, then removes the
  workspace registration. Does **not** delete the project directory on disk.
- Host half: `POST /api/session-delete/delete-workspace` (body `{ sessionId }`);
  falls back to editing `workspace.json` directly if the workspace controller
  cannot remove the registration.

## 0.1.0

Initial release.

- Add a **Delete session** row to each session's `…` menu
  (`sidebar.workspaces.session.menu.item`), with a confirmation dialog.
- Host half: `POST /api/session-delete/delete` performs a permanent, complete
  removal of a session:
  - archives the session to drop it from the Host registry / sidebar;
  - deletes the body log directory (`sessions/<cwd>/session-<id>/`);
  - deletes the projection cache file and its index entry;
  - removes residual references in `workspace.json` (sessionIds / archived / pinned);
  - emits `api-session/removed` so connected clients refresh without a restart.
- Bilingual UI (English / Chinese), MIT licensed.

### Design notes

Harness exposes no delete API (`sessionPersistence` is append-only) and the
sidebar list is a live view over the Host registry, so the plugin combines the
supported archive path with direct, atomic file cleanup. See README for the exact
files touched and the caveats.

### Known limitations

- Deleting the session you are currently viewing may require switching sessions
  (or a restart) for the row to disappear; the data is still fully deleted.
- Independent memory systems (e.g. AnimaSeed `soul-data/memory.sqlite`) are not
  touched by this plugin.
