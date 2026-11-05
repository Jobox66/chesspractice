// Live sync with the backend room of the signed-in user's repertoire,
// same protocol as frontend/src/hooks/useWebsocket.ts. Mutations
// (training_updated, chapter_renamed, chapter_deleted, ...) go over the
// socket; while it's down they wait in an in-memory queue and are sent
// on reconnect.
import { AppState } from 'react-native';
import { api } from './api';
import { WS_URL } from './config';

const PING_MS = 10_000; // server kicks after 30s of silence
const PONG_TIMEOUT_MS = 45_000;
const MAX_BACKOFF_MS = 30_000;

type Listener = (msg: any) => void;
type StatusListener = (s: { connected: boolean; pending: number }) => void;

class SyncSocket {
  private ws: WebSocket | null = null;
  private room: string | null = null;
  private queue: string[] = [];
  private backoff = 1000;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPong = 0;
  private gen = 0; // bumps on every (re)start/stop so stale callbacks bail
  onMessage: Listener = () => {};
  onStatus: StatusListener = () => {};

  constructor() {
    AppState.addEventListener('change', (s) => {
      // Android suspends us in the background and the server drops the
      // idle socket; reconnect straight away on return.
      if (s === 'active' && this.room && !this.isOpen()) {
        this.backoff = 1000;
        this.clearRetry();
        void this.connect(this.gen);
      }
    });
  }

  isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  start(room: string) {
    if (this.room === room && this.ws) return;
    this.stop();
    this.room = room;
    void this.connect(++this.gen);
  }

  stop() {
    this.gen++;
    this.room = null;
    this.queue = [];
    this.clearRetry();
    this.teardown();
    this.emitStatus();
  }

  send(msg: object) {
    const raw = JSON.stringify(msg);
    if (this.isOpen()) this.ws!.send(raw);
    else this.queue.push(raw);
    this.emitStatus();
  }

  private emitStatus() {
    this.onStatus({ connected: this.isOpen(), pending: this.queue.length });
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private teardown() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.ws) {
      this.ws.onopen = this.ws.onmessage = this.ws.onclose = this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleRetry(gen: number) {
    if (gen !== this.gen || !this.room) return;
    this.clearRetry();
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    this.retryTimer = setTimeout(() => void this.connect(gen), delay);
  }

  private async connect(gen: number) {
    if (gen !== this.gen || !this.room) return;
    this.teardown();
    let ticket: string | null = null;
    try {
      ticket = (await api<{ ticket: string }>('/ws-ticket', { method: 'POST' }))?.ticket ?? null;
    } catch {
      ticket = null;
    }
    if (gen !== this.gen || !this.room) return;
    if (!ticket) return this.scheduleRetry(gen);

    const ws = new WebSocket(
      `${WS_URL}/subscribe/${encodeURIComponent(this.room)}?ticket=${encodeURIComponent(ticket)}`,
    );
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 1000;
      this.lastPong = Date.now();
      const queued = this.queue;
      this.queue = [];
      for (const raw of queued) ws.send(raw);
      this.pingTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - this.lastPong > PONG_TIMEOUT_MS) {
          ws.close(); // dead link: onclose reconnects
          return;
        }
        ws.send('{"type":"ping"}');
      }, PING_MS);
      this.emitStatus();
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'pong') {
        this.lastPong = Date.now();
        return;
      }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.ws = null;
      this.emitStatus();
      this.scheduleRetry(gen);
    };
  }
}

export const syncSocket = new SyncSocket();
