/**
 * Session Delete — Host half.
 *
 * Why this exists: DeepSeek Harness ships only "archive", not "delete". The
 * session store (`sessionPersistence`) is append-only and exposes no delete API,
 * and the sidebar list is served from the live Host registry — so deleting the
 * files on disk alone does NOT remove a session from the list.
 *
 * Correct flow, all performed here:
 *   A) Call `workspaceController.archiveSession()` to drop it from the Host
 *      registry / sidebar (archive is the only supported removal path);
 *   B) Delete the on-disk body log and projection cache;
 *   C) Clean residual references in `workspace.json` (sessionIds / archived /
 *      pinned);
 *   D) Emit `api-session/removed` so connected clients refresh immediately.
 *
 * Files touched (under $DSH_HOME):
 *   1) sessions/<cwd-key>/session-<id>/            (contains session.v4.jsonl.zstd)
 *   2) storages/session_projcache/sessions/session-<id>.json
 *   3) storages/session_projcache.json             (tables.sessions[<id>])
 *   4) storages/workspace.json                     (session references)
 *
 * HTTP route (no typert codegen required):
 *   POST /api/session-delete/delete  { sessionId }
 *     -> { ok:true, sessionId, removed:{...} } | { ok:false, error }
 *
 * Note: the Host half loads at process start; after installing, restart dsh once.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  renameSync,
  statSync,
} from 'node:fs';

export const name = 'dsh-ocd-savior';
export const inject = ['webServer'];

const ROUTE = '/api/session-delete/delete';
// Session ids look like `session-<uuid>`. Accept only this shape to prevent path traversal.
const SESSION_ID_RE = /^session-[0-9a-fA-F-]{8,}$/;

function resolveDshHome() {
  const explicit = (process.env.DSH_HOME || '').trim();
  return explicit || join(homedir(), '.dsh');
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

// Atomic write: write a temp file then rename, so a partial write cannot corrupt indexes.
function writeJsonAtomic(file, value) {
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  renameSync(tmp, file);
}

function safeRm(target, removed, key) {
  try {
    if (!existsSync(target)) {
      removed[key] = 'not-found';
      return;
    }
    const st = statSync(target);
    if (st.isDirectory()) rmSync(target, { recursive: true, force: true });
    else rmSync(target, { force: true });
    removed[key] = 'removed';
  } catch (e) {
    removed[key] = 'error: ' + (e && e.message ? e.message : String(e));
  }
}

// Delete the body-log directory: sessions/<any-cwd-key>/session-<id>/
function removeSessionBody(dshHome, sessionId, removed) {
  const sessionsRoot = join(dshHome, 'sessions');
  let dirs = [];
  try {
    dirs = readdirSync(sessionsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    removed.body = 'no-sessions-dir';
    return;
  }
  let hit = 0;
  for (const cwdKey of dirs) {
    const dir = join(sessionsRoot, cwdKey, sessionId);
    if (existsSync(dir)) {
      safeRm(dir, removed, 'bodyDir:' + cwdKey);
      hit += 1;
      // Remove a cwd directory that became empty.
      try {
        const left = readdirSync(join(sessionsRoot, cwdKey));
        if (left.length === 0) rmSync(join(sessionsRoot, cwdKey), { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
  if (hit === 0) removed.body = 'not-found';
}

function removeProjcache(dshHome, sessionId, removed) {
  // Per-session cache file.
  safeRm(join(dshHome, 'storages', 'session_projcache', 'sessions', sessionId + '.json'), removed, 'projcacheFile');
  // Index entry.
  const idx = join(dshHome, 'storages', 'session_projcache.json');
  try {
    if (!existsSync(idx)) {
      removed.projcacheIndex = 'no-index';
      return;
    }
    const data = readJson(idx);
    const sessions = data?.tables?.sessions;
    if (sessions && Object.prototype.hasOwnProperty.call(sessions, sessionId)) {
      delete sessions[sessionId];
      writeJsonAtomic(idx, data);
      removed.projcacheIndex = 'removed';
    } else {
      removed.projcacheIndex = 'not-found';
    }
  } catch (e) {
    removed.projcacheIndex = 'error: ' + (e && e.message ? e.message : String(e));
  }
}

function removeWorkspaceRefs(dshHome, sessionId, removed) {
  const file = join(dshHome, 'storages', 'workspace.json');
  try {
    if (!existsSync(file)) {
      removed.workspace = 'no-file';
      return;
    }
    const data = readJson(file);
    let changed = false;

    const ws = data?.tables?.workspaces;
    if (ws && typeof ws === 'object') {
      for (const key of Object.keys(ws)) {
        const ids = ws[key]?.sessionIds;
        if (Array.isArray(ids)) {
          const next = ids.filter((x) => x !== sessionId);
          if (next.length !== ids.length) {
            ws[key].sessionIds = next;
            changed = true;
          }
        }
      }
    }

    const g = data?.global;
    if (g) {
      // The session is gone for good: remove it from archived/pinned too, so no
      // hollow reference is left behind. Safe here because archive + disk delete +
      // `api-session/removed` already removed it from the Host registry.
      for (const field of ['archivedSessionIds', 'pinnedSessionIds']) {
        const arr = g[field];
        if (Array.isArray(arr)) {
          const next = arr.filter((x) => x !== sessionId);
          if (next.length !== arr.length) {
            g[field] = next;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      writeJsonAtomic(file, data);
      removed.workspace = 'removed';
    } else {
      removed.workspace = 'no-reference';
    }
  } catch (e) {
    removed.workspace = 'error: ' + (e && e.message ? e.message : String(e));
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 16 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

/**
 * Permanently delete one session: archive (registry drop) + remove body log,
 * projection cache, and workspace references. Returns a per-step `removed` map.
 * Does not broadcast — callers decide.
 */
async function deleteSessionCore(ctx, sessionId) {
  const dshHome = resolveDshHome();
  const removed = {};

  const wsCtl = ctx.get ? ctx.get('workspaceController') : undefined;
  if (wsCtl && typeof wsCtl.archiveSession === 'function') {
    try {
      await wsCtl.archiveSession({ sessionId, stopActivity: true });
      removed.archive = 'ok';
    } catch (e) {
      removed.archive = 'error: ' + (e && e.message ? e.message : String(e));
    }
  } else {
    removed.archive = 'no-workspaceController';
  }

  removeSessionBody(dshHome, sessionId, removed);
  removeProjcache(dshHome, sessionId, removed);
  removeWorkspaceRefs(dshHome, sessionId, removed);
  return removed;
}

function anyRemoved(removed) {
  return removed.archive === 'ok' || Object.values(removed).some((v) => v === 'removed');
}

function broadcast(ctx, logger, sessionId) {
  try {
    if (typeof ctx.emit === 'function') {
      ctx.emit('api-session/removed', sessionId);
      ctx.emit('api-session/activity', sessionId, Date.now());
    }
  } catch (e) {
    logger.warn('broadcast failed: ' + (e && e.message ? e.message : e));
  }
}

function readWorkspaceData(dshHome) {
  const file = join(dshHome, 'storages', 'workspace.json');
  if (!existsSync(file)) return undefined;
  return readJson(file);
}

// Find { workspaceId, title, path, sessionIds } for the workspace owning sessionId.
function findWorkspaceOfSession(data, sessionId) {
  const ws = data?.tables?.workspaces;
  if (!ws) return undefined;
  for (const id of Object.keys(ws)) {
    const w = ws[id];
    if (Array.isArray(w?.sessionIds) && w.sessionIds.includes(sessionId)) {
      return { workspaceId: id, title: w.title, path: w.path, sessionIds: w.sessionIds.slice() };
    }
  }
  return undefined;
}

export function apply(ctx) {
  const logger = ctx.logger ? ctx.logger('session-delete') : { warn: () => {}, info: () => {} };

  // ---- Route: delete a single session ----
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: ROUTE,
      async handler(req, res) {
        try {
          if (req.method !== 'POST') {
            return sendJson(res, 405, { ok: false, error: 'method not allowed' });
          }
          let input;
          try {
            input = JSON.parse((await readBody(req)) || '{}');
          } catch {
            return sendJson(res, 400, { ok: false, error: 'invalid json' });
          }
          const sessionId = typeof input?.sessionId === 'string' ? input.sessionId.trim() : '';
          if (!SESSION_ID_RE.test(sessionId)) {
            return sendJson(res, 400, { ok: false, error: 'invalid sessionId' });
          }

          const removed = await deleteSessionCore(ctx, sessionId);
          if (!anyRemoved(removed)) {
            logger.warn('delete matched nothing: ' + sessionId + ' ' + JSON.stringify(removed));
            return sendJson(res, 404, { ok: false, error: 'session records not found (already deleted?)', detail: removed });
          }
          broadcast(ctx, logger, sessionId);
          logger.info('deleted session: ' + sessionId);
          return sendJson(res, 200, { ok: true, sessionId, removed });
        } catch (e) {
          logger.warn('delete failed: ' + (e && e.message ? e.message : e));
          return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) });
        }
      },
    }),
  );

  // ---- Route: delete the whole workspace that owns a session (all its sessions too) ----
  // Body: { sessionId }. Deletes every session in that workspace, then removes the
  // workspace registration. Does NOT touch the project directory on disk.
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: ROUTE + '-workspace',
      async handler(req, res) {
        try {
          if (req.method !== 'POST') {
            return sendJson(res, 405, { ok: false, error: 'method not allowed' });
          }
          let input;
          try {
            input = JSON.parse((await readBody(req)) || '{}');
          } catch {
            return sendJson(res, 400, { ok: false, error: 'invalid json' });
          }
          const sessionId = typeof input?.sessionId === 'string' ? input.sessionId.trim() : '';
          if (!SESSION_ID_RE.test(sessionId)) {
            return sendJson(res, 400, { ok: false, error: 'invalid sessionId' });
          }

          const dshHome = resolveDshHome();
          const data = readWorkspaceData(dshHome);
          const wsInfo = findWorkspaceOfSession(data, sessionId);
          if (!wsInfo) {
            return sendJson(res, 404, { ok: false, error: 'workspace for this session not found' });
          }

          // 1) Permanently delete every session in the workspace.
          const results = [];
          for (const sid of wsInfo.sessionIds) {
            try {
              const removed = await deleteSessionCore(ctx, sid);
              results.push({ sessionId: sid, removed });
              broadcast(ctx, logger, sid);
            } catch (e) {
              results.push({ sessionId: sid, error: String((e && e.message) || e) });
            }
          }

          // 2) Remove the workspace registration via the official controller
          //    (updates both memory and durable registry; keeps the directory).
          const wsCtl = ctx.get ? ctx.get('workspaceController') : undefined;
          let workspaceDeleted = false;
          if (wsCtl && typeof wsCtl.delete === 'function') {
            try {
              await wsCtl.delete({ workspaceId: wsInfo.workspaceId });
              workspaceDeleted = true;
            } catch (e) {
              logger.warn('workspace delete failed: ' + (e && e.message ? e.message : e));
            }
          } else {
            // Fallback: edit workspace.json directly.
            try {
              const d = readWorkspaceData(dshHome);
              if (d?.tables?.workspaces?.[wsInfo.workspaceId]) {
                delete d.tables.workspaces[wsInfo.workspaceId];
                if (Array.isArray(d.global?.workspaceIds)) {
                  d.global.workspaceIds = d.global.workspaceIds.filter((x) => x !== wsInfo.workspaceId);
                }
                writeJsonAtomic(join(dshHome, 'storages', 'workspace.json'), d);
                workspaceDeleted = true;
              }
            } catch (e) {
              logger.warn('workspace delete fallback failed: ' + (e && e.message ? e.message : e));
            }
          }

          logger.info('deleted workspace ' + wsInfo.workspaceId + ' (' + wsInfo.title + ') with ' + wsInfo.sessionIds.length + ' session(s)');
          return sendJson(res, 200, {
            ok: true,
            workspaceId: wsInfo.workspaceId,
            title: wsInfo.title,
            path: wsInfo.path,
            sessionCount: wsInfo.sessionIds.length,
            workspaceDeleted,
            sessions: results,
          });
        } catch (e) {
          logger.warn('delete-workspace failed: ' + (e && e.message ? e.message : e));
          return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) });
        }
      },
    }),
  );
}
