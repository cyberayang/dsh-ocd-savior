# OCD Savior · 强迫症拯救者

[![CI](https://github.com/cyberayang/dsh-ocd-savior/actions/workflows/ci.yml/badge.svg)](https://github.com/cyberayang/dsh-ocd-savior/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> *For everyone who can't stand leftover sessions.*

A [DeepSeek Harness](https://github.com/deepseek-ai) (dsh) plugin that adds a **permanent "Delete session"** action to every session's `…` menu.

DeepSeek Harness only offers **archive**, not delete — the session store is append-only and the sidebar list is served from the live Host registry, so archiving keeps the data on disk. This plugin actually removes a session's records and drops it from the list.

> ⚠️ **Destructive & irreversible.** Deleting a session permanently removes its conversation log and caches from disk. There is no recycle bin. Use at your own risk. **Back up `$DSH_HOME` if the data matters to you.**

---

## What it does

For the session you delete, it removes all of the following (under `$DSH_HOME`, default `~/.dsh`):

| # | Item | Path |
|---|------|------|
| 1 | Body log directory | `sessions/<cwd-key>/session-<id>/` (contains `session.v4.jsonl.zstd`) |
| 2 | Projection cache file | `storages/session_projcache/sessions/session-<id>.json` |
| 3 | Projection cache index entry | `storages/session_projcache.json` → `tables.sessions[<id>]` |
| 4 | Workspace references | `storages/workspace.json` (sessionIds / archived / pinned) |

It also triggers the Host's archive path and emits `api-session/removed` so connected clients refresh the sidebar **without a restart** (for sessions that are not the one currently open).

## How it works

Deleting the files alone is not enough: the sidebar is a live view. So the Host half:

1. Calls `workspaceController.archiveSession()` to drop the session from the Host registry.
2. Deletes the body log and projection cache from disk.
3. Removes leftover references in `workspace.json`.
4. Emits `api-session/removed` so the UI updates immediately.

The UI action is a row in the session menu; the Host half exposes one HTTP route `POST /api/session-delete/delete`.

## Requirements

- A DeepSeek Harness build that provides `webServer` and `workspaceController` services and the `sidebar.workspaces.session.menu.item` slot.
- Verified on the version bundled with the dsh Desktop app as of 2026-11. It relies on the on-disk layout described above; **if Harness changes that layout, verify before use.**

## Install

### Option A — one-click from GitHub (recommended)

In the dsh app, open **Plugins → Add plugin**, and enter this repository:

```
cyberayang/dsh-ocd-savior
```

(or the explicit form `github:cyberayang/dsh-ocd-savior`, or the full
`https://github.com/cyberayang/dsh-ocd-savior`). dsh resolves it via pnpm and
installs it automatically. Then **restart dsh once** so the Host half (HTTP
route) loads.

> Requires the plugin to live in a GitHub repo whose `package.json` names it
> `@cyberayang/dsh-ocd-savior` — which this repo does.

### Option B — from the release package

1. Download the latest `cyberayang-dsh-ocd-savior-<version>.tgz` from the
   [Releases](https://github.com/cyberayang/dsh-ocd-savior/releases) page.
2. Install it as a bundle in your dsh profile, pointing at the downloaded file:

   ```
   plugin_manager  action: install_bundle  target: <absolute path to the .tgz>
   ```

   (dsh installs bundles via pnpm, which accepts a local `file:...tgz` spec.)
3. **Restart dsh once** so the Host half (HTTP route) loads.

### Option C — from source (for development)

1. Clone this repo somewhere on disk.
2. Install the package directory as a bundle:

   ```
   plugin_manager  action: install_bundle  target: <absolute path to this folder>
   ```

3. **Restart dsh once** so the Host half loads.

### Option D — from npm (after publishing)

If this package is published to npm, `install_bundle` with just the package name
works and pnpm fetches it automatically:

```
plugin_manager  action: install_bundle  target: @cyberayang/dsh-ocd-savior
```

## Usage

Open the `…` menu of any session → **OCD Savior · Delete session** → confirm **Delete permanently**.

- Deleting a session that is **not currently open** removes it from the list immediately.
- Deleting the session you are **currently viewing** may need you to switch to another session (or restart) for the row to disappear — the data is still fully deleted.

## What is NOT deleted

- **Companion / memory systems** (e.g. AnimaSeed / 灵芽 `soul-data/memory.sqlite`) keep any memories they distilled from conversations. This plugin only removes Harness session records. Clean those separately if you want them gone.

## Development

No dependencies. Run the local checks (same as CI) with:

```bash
npm test          # or: node scripts/check.mjs
```

CI (`.github/workflows/ci.yml`) runs the same syntax/JSON checks on Node 20 and 22 for every push and pull request.

## Customizing

- Package name / plugin id is `@cyberayang/dsh-ocd-savior`. If you fork it under another scope, rename it consistently in `package.json`, `cordis.patch.yml`, and the `id` in `client.js`.
- Set `author`, `repository`, `homepage`, `bugs` in `package.json` and the holder in `LICENSE` (already set to `cyberayang`).

## Disclaimer

This software is provided "AS IS", without warranty of any kind. It performs permanent, irreversible deletion of files. The authors are not liable for any data loss or damage. Read the code before running it.

## License

[MIT](./LICENSE)

---

## 中文说明

**强迫症拯救者（OCD Savior）**——给看不惯残留会话的你。给 DeepSeek Harness 的会话 `…` 菜单增加**「删除会话」（永久）**。

Harness 官方只有「归档」、没有「删除」——会话存储是只追加的，侧边栏列表来自后端内存注册表，所以归档不会删磁盘数据。本插件真正删除会话记录并让它从列表消失。

**⚠️ 破坏性、不可恢复。** 删除会永久移除该会话的正文日志与缓存，没有回收站。介意的话请先备份 `$DSH_HOME`（默认 `~/.dsh`）。

**删除范围**：正文日志目录、投影缓存文件、缓存索引条目、`workspace.json` 里的引用（会话/归档/置顶）。删除后会触发归档并广播 `api-session/removed`，让界面即时刷新。

**安装（最简单）**：打开 dsh 的「插件 → 添加插件」，输入 `cyberayang/dsh-ocd-savior`，点安装，然后**重启 dsh 一次**让 Host 路由生效。（也可用 Release 里的 `.tgz` 包或指向本目录安装，见上方 Options。）

**注意**：删「当前正在浏览」的会话时，可能需切到别的会话（或重启）列表才刷新，但数据一样是彻底删除的。灵芽（AnimaSeed）等独立记忆库里从对话提炼的记忆**不会**被删，需另行处理。

**许可**：MIT。
