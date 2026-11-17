/**
 * Live connection for the viewer (API.md "GET /api/share/:id" + "/live" WebSocket).
 * GET first, then the socket. When the socket drops: reconnect with backoff 1, 2, 5, 10, 30 s and
 * poll GET every 15 s meanwhile (M4 AC 20). 404/410 or an `ended`/`expired` message are terminal.
 */
import { backoffMs, terminalFromHttp, type ShareWire, type Terminal } from './state';

export interface LiveHandlers {
  state(s: ShareWire): void;
  terminal(t: Exclude<Terminal, null>): void;
  /** Viewer's own network: true = socket down and GET failed. */
  offline(down: boolean): void;
  /** QA-43 (AC 25): true = the socket was refused because the share already has 50 viewers. */
  full?(on: boolean): void;
}

export const POLL_MS = 15_000;

export function connectLive(base: string, id: string, h: LiveHandlers): { close(): void; kick(): void } {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let done = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let retryAfterMs: number | null = null;
  const httpUrl = `${base}/api/share/${encodeURIComponent(id)}`;
  const wsUrl = (() => {
    const u = new URL(httpUrl + '/live', location.href);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.toString();
  })();

  const finish = (t: Exclude<Terminal, null>) => {
    if (done) return;
    done = true;
    stopTimers();
    try { ws?.close(1000); } catch { /* ignore */ }
    h.offline(false);
    h.terminal(t);
  };
  const stopTimers = () => {
    clearTimeout(reconnectTimer);
    clearInterval(pollTimer);
    clearInterval(pingTimer);
    pollTimer = undefined;
  };

  /** One GET. Returns true if the share is live and the socket should be (re)opened. */
  async function get(): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch(httpUrl, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch {
      if (!done) h.offline(true);
      return false;
    }
    if (done) return false;
    h.offline(false);
    if (res.ok) {
      try {
        const s = (await res.json()) as ShareWire;
        if (s.status === 'ended') {
          h.state(s);
          finish('ended');
          return false;
        }
        h.state(s);
        return true;
      } catch {
        return false;
      }
    }
    if (res.status === 429) {
      // Several family members behind one home IP share the 1-per-5-s GET limit: retry when allowed.
      const ra = Number(res.headers.get('Retry-After'));
      retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 + 100 : null;
    }
    let code: string | undefined;
    try { code = ((await res.json()) as { error?: { code?: string }; code?: string }).error?.code; } catch { /* ignore */ }
    const t = terminalFromHttp(res.status, code);
    if (t) finish(t);
    return false; // 429 and 5xx: keep trying
  }

  function open() {
    if (done) return;
    let s: WebSocket;
    try {
      s = new WebSocket(wsUrl);
    } catch {
      return scheduleReconnect();
    }
    ws = s;
    let gotData = false;
    s.onmessage = (ev) => {
      if (typeof ev.data !== 'string' || ev.data === 'pong') return;
      let msg: { type?: string; state?: ShareWire };
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!gotData) {
        gotData = true;
        attempt = 0;
        clearInterval(pollTimer);
        pollTimer = undefined;
        h.offline(false);
        h.full?.(false);
      }
      if (msg.type === 'expired') return finish('expired');
      if (msg.type === 'state' && msg.state) {
        h.state(msg.state);
        if (msg.state.status === 'ended') finish('ended');
      }
    };
    s.onopen = () => {
      clearInterval(pingTimer);
      pingTimer = setInterval(() => { try { s.send('ping'); } catch { /* ignore */ } }, 30_000);
    };
    s.onclose = () => {
      clearInterval(pingTimer);
      if (ws === s) ws = null;
      if (!gotData && !done) void probeFull();
      if (!done) scheduleReconnect();
    };
    s.onerror = () => { /* onclose follows */ };
  }

  /**
   * A refused upgrade hides its HTTP status from the WebSocket API. A plain GET on `/live` answers
   * 429 `too_many_viewers` when the share is full (else 426), so the page can say so (AC 25).
   */
  async function probeFull() {
    try {
      const r = await fetch(httpUrl + '/live', { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      let code: string | undefined;
      try { code = ((await r.json()) as { error?: { code?: string } }).error?.code; } catch { /* ignore */ }
      if (!done) h.full?.(r.status === 429 && code === 'too_many_viewers');
    } catch {
      /* offline: the GET path reports it */
    }
  }

  function scheduleReconnect() {
    if (done) return;
    const delay = retryAfterMs ?? backoffMs(attempt++);
    retryAfterMs = null;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(async () => {
      if (await get()) open();
      else scheduleReconnect();
    }, delay);
    pollTimer ??= setInterval(() => void get(), POLL_MS);
  }

  void get().then((ok) => {
    if (ok) open();
    else if (!done) scheduleReconnect();
  });

  return {
    close() {
      done = true;
      stopTimers();
      try { ws?.close(1000); } catch { /* ignore */ }
    },
    /** Network came back (`online` event): try now instead of waiting for the backoff. */
    kick() {
      if (done || ws) return;
      attempt = 0;
      clearTimeout(reconnectTimer);
      void get().then((ok) => (ok ? open() : scheduleReconnect()));
    },
  };
}
