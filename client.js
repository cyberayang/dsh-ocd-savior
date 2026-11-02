/**
 * Session Delete — Client half.
 *
 * Registers a "Delete session" row in each session's "…" menu
 * (`sidebar.workspaces.session.menu.item`). Clicking it shows a confirmation
 * dialog; on confirm it calls the Host half's `POST /api/session-delete/delete`
 * route to permanently remove the session's body log, projection cache, and
 * workspace references.
 *
 * The slot gives owner props `{ sessionId, displayTitle }`. Older/newer builds
 * may nest them, so we look in a few common places.
 */
window.__ModuleLoader__.load({
  id: '@cyberayang/dsh-ocd-savior',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const ROUTE = '/api/session-delete/delete';

    // Minimal bilingual strings (falls back to English). Kept inline so the
    // plugin has no extra locale-file dependency at runtime.
    const IS_ZH =
      typeof navigator !== 'undefined' && /^zh\b/i.test(navigator.language || '');
    const T = (en, zh) => (IS_ZH ? zh : en);

    function pickSessionId(props) {
      if (!props) return '';
      const cands = [
        props.sessionId,
        props.session && props.session.sessionId,
        props.owner && props.owner.sessionId,
        props.row && props.row.sessionId,
        props.sessionRow && props.sessionRow.sessionId,
        props.context && props.context.sessionId,
      ];
      for (const c of cands) if (typeof c === 'string' && c) return c;
      return '';
    }
    function pickTitle(props) {
      if (!props) return '';
      const cands = [
        props.displayTitle,
        props.session && props.session.displayTitle,
        props.owner && props.owner.displayTitle,
        props.row && props.row.displayTitle,
      ];
      for (const c of cands) if (typeof c === 'string' && c) return c;
      return '';
    }

    function DeleteMenuItem(props) {
      const sessionId = pickSessionId(props);
      const displayTitle = pickTitle(props);
      const [open, setOpen] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [done, setDone] = React.useState(false);

      // Best-effort close of the "…" menu across slot-hook injection variants.
      const closeMenu = () => {
        const cands = [
          props && props.menuOpenState,
          props && props.hooks && props.hooks.menuOpenState,
          props && props.closeMenu,
        ];
        for (const c of cands) {
          try {
            if (typeof c === 'function') { c(); return; }
            if (c && typeof c.close === 'function') { c.close(); return; }
            if (c && typeof c.setOpen === 'function') { c.setOpen(false); return; }
          } catch { /* ignore */ }
        }
      };

      const onClickRow = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        closeMenu();
        setOpen(true);
        setError('');
      };

      const onCancel = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        if (busy) return;
        setOpen(false);
      };

      const onConfirm = async (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          const r = await fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          const body = await r.json().catch(() => ({}));
          if (r.ok && body && body.ok) {
            setDone(true);
            setBusy(false);
          } else {
            setError((body && body.error) || ('HTTP ' + r.status));
            setBusy(false);
          }
        } catch (err) {
          setError(String((err && err.message) || err));
          setBusy(false);
        }
      };

      const label = T('OCD Savior · Delete session', '强迫症拯救者 · 删除会话');
      const row = h(
        'button',
        {
          role: 'menuitem',
          type: 'button',
          onClick: onClickRow,
          style: {
            display: 'flex', alignItems: 'center', width: '100%',
            gap: 8, padding: '7px 12px', border: 'none', background: 'transparent',
            cursor: 'pointer', textAlign: 'left', fontSize: 13,
            color: 'var(--dsw-alias-state-error-primary, #c0392b)',
            borderRadius: 6,
          },
        },
        h('span', { 'aria-hidden': true, style: { width: 16, textAlign: 'center' } }, '🗑'),
        h('span', null, label),
      );

      if (!open) return row;

      const title = (displayTitle || '').trim() || T('Untitled session', '未命名会话');

      // Success dialog (we do not reload; desktop shells ignore F5 for data).
      if (done) {
        return h(
          React.Fragment,
          null,
          row,
          h(
            'div',
            {
              style: {
                position: 'fixed', inset: 0, zIndex: 100000,
                background: 'rgba(0,0,0,0.42)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              },
              onClick: () => { setDone(false); setOpen(false); },
            },
            h(
              'div',
              {
                onClick: (e) => e && e.stopPropagation && e.stopPropagation(),
                style: {
                  width: 'min(92vw, 440px)',
                  background: 'var(--dsw-alias-bg-overlay, #fff)',
                  color: 'var(--dsw-alias-label-primary, #222)',
                  border: '1px solid var(--dsw-alias-border-l2, #ddd)',
                  borderRadius: 12, padding: 20,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
                  display: 'flex', flexDirection: 'column', gap: 12,
                },
              },
              h('div', { style: { fontSize: 15, fontWeight: 700, color: 'var(--dsw-alias-state-success-primary, #2f7d4f)' } },
                T('Deleted records of "' + title + '"', '已删除「' + title + '」的记录')),
              h(
                'div',
                { style: { fontSize: 13, lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary, #555)' } },
                T(
                  'Conversation records have been permanently deleted from disk. If the row still briefly shows, it was the session you are currently viewing — switch to another session (or restart the app) to refresh the list.',
                  '对话记录已从磁盘永久删除。若列表里仍短暂显示，通常是删的是“当前正在浏览的会话”——切换到其它会话（或重启应用）即可刷新列表。',
                ),
              ),
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 } },
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => { setDone(false); setOpen(false); },
                    style: {
                      padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                      border: '1px solid transparent',
                      background: 'var(--dsw-alias-brand-primary, #2f7d4f)',
                      color: '#fff', fontSize: 13, fontWeight: 600,
                    },
                  },
                  T('OK', '知道了'),
                ),
              ),
            ),
          ),
        );
      }

      const overlay = h(
        'div',
        {
          style: {
            position: 'fixed', inset: 0, zIndex: 100000,
            background: 'rgba(0,0,0,0.42)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          },
          onClick: onCancel,
        },
        h(
          'div',
          {
            onClick: (e) => e && e.stopPropagation && e.stopPropagation(),
            style: {
              width: 'min(92vw, 420px)',
              background: 'var(--dsw-alias-bg-overlay, #fff)',
              color: 'var(--dsw-alias-label-primary, #222)',
              border: '1px solid var(--dsw-alias-border-l2, #ddd)',
              borderRadius: 12, padding: 20,
              boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
              display: 'flex', flexDirection: 'column', gap: 12,
            },
          },
          h('div', { style: { fontSize: 15, fontWeight: 700 } }, T('Delete this session?', '删除这个会话？')),
          h(
            'div',
            { style: { fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary, #555)' } },
            T(
              'This permanently deletes the conversation records of "' + title + '" (body log and cache). This cannot be undone.',
              '将永久删除「' + title + '」的对话记录（正文日志、缓存）。此操作不可恢复。',
            ),
          ),
          error
            ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary, #c0392b)' } },
                T('Delete failed: ' + error, '删除失败：' + error))
            : null,
          h(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 } },
            h(
              'button',
              {
                type: 'button',
                onClick: onCancel,
                disabled: busy,
                style: {
                  padding: '7px 14px', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
                  border: '1px solid var(--dsw-alias-border-l2, #ddd)',
                  background: 'transparent', color: 'var(--dsw-alias-label-primary, #222)', fontSize: 13,
                },
              },
              T('Cancel', '取消'),
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: onConfirm,
                disabled: busy,
                style: {
                  padding: '7px 16px', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
                  border: '1px solid transparent',
                  background: 'var(--dsw-alias-state-error-primary, #c0392b)',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                },
              },
              busy ? T('Deleting…', '删除中…') : T('Delete permanently', '永久删除'),
            ),
          ),
        ),
      );

      return h(React.Fragment, null, row, overlay);
    }

    // Second menu row: delete the whole workspace that owns this session,
    // including all sessions in it. Does NOT delete the project directory.
    function DeleteWorkspaceItem(props) {
      const sessionId = pickSessionId(props);
      const [open, setOpen] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [result, setResult] = React.useState(null);

      const closeMenu = () => {
        const cands = [
          props && props.menuOpenState,
          props && props.hooks && props.hooks.menuOpenState,
          props && props.closeMenu,
        ];
        for (const c of cands) {
          try {
            if (typeof c === 'function') { c(); return; }
            if (c && typeof c.close === 'function') { c.close(); return; }
            if (c && typeof c.setOpen === 'function') { c.setOpen(false); return; }
          } catch { /* ignore */ }
        }
      };

      const onClickRow = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        closeMenu();
        setOpen(true);
        setError('');
        setResult(null);
      };
      const onCancel = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        if (busy) return;
        setOpen(false);
      };
      const onConfirm = async (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          const r = await fetch(ROUTE + '-workspace', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          const body = await r.json().catch(() => ({}));
          if (r.ok && body && body.ok) {
            setResult(body);
            setBusy(false);
          } else {
            setError((body && body.error) || ('HTTP ' + r.status));
            setBusy(false);
          }
        } catch (err) {
          setError(String((err && err.message) || err));
          setBusy(false);
        }
      };

      const label = T('OCD Savior · Delete whole workspace (+ all sessions)', '强迫症拯救者 · 删除所在工作区（含全部对话）');
      const row = h(
        'button',
        {
          role: 'menuitem',
          type: 'button',
          onClick: onClickRow,
          style: {
            display: 'flex', alignItems: 'center', width: '100%',
            gap: 8, padding: '7px 12px', border: 'none', background: 'transparent',
            cursor: 'pointer', textAlign: 'left', fontSize: 13,
            color: 'var(--dsw-alias-state-error-primary, #c0392b)',
            borderRadius: 6,
          },
        },
        h('span', { 'aria-hidden': true, style: { width: 16, textAlign: 'center' } }, '🧹'),
        h('span', null, label),
      );

      if (!open) return row;

      const boxBase = {
        width: 'min(92vw, 460px)',
        background: 'var(--dsw-alias-bg-overlay, #fff)',
        color: 'var(--dsw-alias-label-primary, #222)',
        border: '1px solid var(--dsw-alias-border-l2, #ddd)',
        borderRadius: 12, padding: 20,
        boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
        display: 'flex', flexDirection: 'column', gap: 12,
      };
      const overlayWrap = (children) =>
        h('div', {
          style: { position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.42)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' },
          onClick: onCancel,
        }, h('div', { onClick: (e) => e && e.stopPropagation && e.stopPropagation(), style: boxBase }, ...children));

      // Result dialog.
      if (result) {
        return h(React.Fragment, null, row, overlayWrap([
          h('div', { style: { fontSize: 15, fontWeight: 700, color: 'var(--dsw-alias-state-success-primary, #2f7d4f)' } },
            T('Workspace deleted: ' + (result.title || ''), '已删除工作区：' + (result.title || ''))),
          h('div', { style: { fontSize: 13, lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary, #555)' } },
            T(
              (result.sessionCount || 0) + ' session(s) permanently deleted. The project folder on disk was NOT touched.',
              '共删除 ' + (result.sessionCount || 0) + ' 个对话。磁盘上的项目文件夹未被删除。',
            )),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 } },
            h('button', { type: 'button', onClick: () => { setResult(null); setOpen(false); },
              style: { padding: '7px 16px', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent',
                background: 'var(--dsw-alias-brand-primary, #2f7d4f)', color: '#fff', fontSize: 13, fontWeight: 600 } },
              T('OK', '知道了'))),
        ]));
      }

      const confirmOverlay = overlayWrap([
        h('div', { style: { fontSize: 15, fontWeight: 700 } }, T('Delete the whole workspace?', '删除整个工作区？')),
        h('div', { style: { fontSize: 13, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary, #555)' } },
          T(
            'This permanently deletes the workspace group AND every conversation in it (logs + caches). The project folder on disk is NOT deleted. This cannot be undone.',
            '将永久删除该工作区分组，以及它下面的所有对话（正文日志 + 缓存）。磁盘上的项目文件夹不会被删除。此操作不可恢复。',
          )),
        error
          ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-state-error-primary, #c0392b)' } }, T('Failed: ' + error, '失败：' + error))
          : null,
        h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 } },
          h('button', { type: 'button', onClick: onCancel, disabled: busy,
            style: { padding: '7px 14px', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
              border: '1px solid var(--dsw-alias-border-l2, #ddd)', background: 'transparent',
              color: 'var(--dsw-alias-label-primary, #222)', fontSize: 13 } },
            T('Cancel', '取消')),
          h('button', { type: 'button', onClick: onConfirm, disabled: busy,
            style: { padding: '7px 16px', borderRadius: 8, cursor: busy ? 'default' : 'pointer',
              border: '1px solid transparent', background: 'var(--dsw-alias-state-error-primary, #c0392b)',
              color: '#fff', fontSize: 13, fontWeight: 600 } },
            busy ? T('Deleting…', '删除中…') : T('Delete workspace', '删除工作区'))),
      ]);

      return h(React.Fragment, null, row, confirmOverlay);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => {
          const d1 = ctx.slots.register(
            {
              name: 'sidebar.workspaces.session.menu.item',
              id: 'session-delete',
              order: 500,
              label: () => T('OCD Savior · Delete session', '强迫症拯救者 · 删除会话'),
            },
            DeleteMenuItem,
          );
          const d2 = ctx.slots.register(
            {
              name: 'sidebar.workspaces.session.menu.item',
              id: 'session-delete-workspace',
              order: 510,
              label: () => T('OCD Savior · Delete whole workspace', '强迫症拯救者 · 删除所在工作区'),
            },
            DeleteWorkspaceItem,
          );
          return () => {
            try { if (typeof d2 === 'function') d2(); } catch { /* ignore */ }
            try { if (typeof d1 === 'function') d1(); } catch { /* ignore */ }
          };
        });
      },
    };
  },
});
