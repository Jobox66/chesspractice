import { useEffect } from 'react';
import { useTrainerStore } from '../store/state';

const API_URL: string = import.meta.env.VITE_API_URL;
// VITE_WS_URL points the socket straight at the backend host. Needed on
// Vercel, where VITE_API_URL is the same-origin "/api" rewrite and
// rewrites can't carry WebSockets. Falls back to VITE_API_URL locally.
const WS_URL = (import.meta.env.VITE_WS_URL || API_URL).replace(/^http/, 'ws');

// Trades the session cookie (sent to the same-origin API) for a
// short-lived single-use ticket the cross-site socket can present.
async function fetchWsTicket(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/ws-ticket`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return null;
    const { ticket } = await res.json();
    return typeof ticket === 'string' ? ticket : null;
  } catch {
    return null;
  }
}

// Liveness:
// - PING_INTERVAL_MS: how often the client sends {"type":"ping"}.
// - PONG_TIMEOUT_MS:  if no {"type":"pong"} has arrived in this window
//   we assume the link is dead (TCP often hasn't noticed yet) and force
//   the socket closed so onclose triggers a reconnect. Comfortably
//   longer than PING_INTERVAL to ride out one missed round-trip.
// - Reconnect uses exponential backoff capped at MAX_BACKOFF_MS, reset
//   to INITIAL_BACKOFF_MS on every successful open.
//
// The server independently kicks subscribers idle for longer than its
// own threshold (server.go: idleTimeout = 60s), so the two timeouts are
// chosen to play together: the client should detect death first.
const PING_INTERVAL_MS = 5_000;
const PONG_TIMEOUT_MS = 45_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

// Owns the WebSocket lifecycle for the currently-viewed repertoire.
// Connects on mount / repertoireAuthor change, sends periodic pings,
// reconnects with exponential backoff on disconnect.
export function useWebsocket() {
  const repertoireAuthor = useTrainerStore().repertoireAuthor;

  const {
    setWebSocket,
    setConnectedUsers,
    addConnectedUser,
    removeConnectedUser,
    addMove,
    deleteNodeRemote,
    updateTrainingRemote,
    setCommentRemote,
    resyncAndRestore,
  } = useTrainerStore();

  useEffect(() => {
    if (!repertoireAuthor) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = INITIAL_BACKOFF_MS;
    let lastPongAt = 0;

    const clearTimers = () => {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = backoff;
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      reconnectTimer = setTimeout(connect, delay);
    };

    async function connect() {
      if (cancelled) return;
      const ticket = await fetchWsTicket();
      if (cancelled) return;
      if (!ticket) {
        // No session (or backend waking up from sleep): retry with backoff.
        scheduleReconnect();
        return;
      }
      ws = new WebSocket(
        `${WS_URL}/subscribe/${encodeURIComponent(repertoireAuthor)}?ticket=${encodeURIComponent(ticket)}`,
      );
      setWebSocket(ws);

      ws.onopen = () => {
        // Healthy connect: reset backoff and start the heartbeat.
        backoff = INITIAL_BACKOFF_MS;
        lastPongAt = Date.now();
        console.log('ws live');
        pingTimer = setInterval(() => {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          // Watchdog: no pong in PONG_TIMEOUT_MS => dead link. Closing
          // here trips onclose, which schedules the reconnect.
          if (Date.now() - lastPongAt > PONG_TIMEOUT_MS) {
            console.warn('ws: pong timeout, forcing reconnect');
            ws.close();
            return;
          }
          ws.send(JSON.stringify({ type: 'ping' }));
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === 'pong') {
          lastPongAt = Date.now();
          return;
        }
        switch (payload.type) {
          case 'crowd':
            setConnectedUsers(payload.users);
            break;
          case 'user_joined':
            addConnectedUser(payload.user);
            break;
          case 'user_left':
            removeConnectedUser(payload.user.username);
            break;
          case 'move_created':
            addMove(payload.chapterId, payload.path, { data: payload.move, children: [] });
            break;
          case 'reload':
            void resyncAndRestore();
            break;
          case 'node_deleted':
            deleteNodeRemote(payload.chapterId, payload.path);
            break;
          case 'set_comment':
            setCommentRemote(payload.chapterId, payload.path, payload.comment);
            break;
          case 'training_updated':
            updateTrainingRemote(payload.chapterId, payload.path, payload.username, payload.card);
            break;
          // No 'chapter_created'/'chapter_deleted' cases: chapter-level
          // structural changes are persisted (HTTP POST /chapter for
          // create; ws for delete) and the server then broadcasts
          // 'reload', so every peer resyncs via fetchRepertoire above.
        }
      };

      ws.onerror = () => {
        // The browser will follow onerror with onclose; let that path
        // own the reconnect scheduling so we never double-schedule.
      };

      ws.onclose = () => {
        clearTimers();
        setConnectedUsers([]);
        if (cancelled) return;
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimers();
      if (ws) {
        // Drop the handlers so a late onclose during teardown can't
        // schedule a reconnect after the effect has cleaned up.
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        ws = null;
      }
      setConnectedUsers([]);
    };
  }, [repertoireAuthor]);
}
