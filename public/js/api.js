// ─── WebSocket client ─────────────────────────────────────────────────────────

// On HTTPS: route WS through Nginx /ws path (wss://host/ws)
// On HTTP (dev): connect directly to WS port
const WS_URL = location.protocol === 'https:'
  ? `wss://${location.hostname}/ws`
  : `ws://${location.hostname}:${window.ASPHODEL_WS_PORT ?? 3001}`;

let ws = null;
let reconnectTimer = null;
const listeners = [];

export function onWorldUpdate(fn) {
  listeners.push(fn);
}

export function connect() {
  ws = new WebSocket(WS_URL);

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'WORLD_UPDATE') {
        listeners.forEach(fn => fn(data));
      }
    } catch { /* ignore */ }
  };

  ws.onclose = () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 3_000);
  };

  ws.onerror = () => ws.close();
}

// ─── REST API ─────────────────────────────────────────────────────────────────

// On HTTPS: use same origin (Nginx proxies / → :3000)
// On HTTP (dev): use explicit port
const HTTP_BASE = location.protocol === 'https:'
  ? location.origin
  : `http://${location.hostname}:${window.ASPHODEL_HTTP_PORT ?? 3000}`;

export async function sendDirective(soulId, message) {
  const res = await fetch(`${HTTP_BASE}/directives`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ soul_id: soulId, message }),
  });
  return res.ok;
}

export async function getSoul(soulId) {
  const res = await fetch(`${HTTP_BASE}/souls/${soulId}`);
  return res.ok ? res.json() : null;
}

export async function getState() {
  const res = await fetch(`${HTTP_BASE}/state`);
  return res.ok ? res.json() : null;
}

export async function getArchive({ type, soulId, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (type)   params.set('type',    type);
  if (soulId) params.set('soul_id', soulId);
  params.set('limit', String(limit));
  const res = await fetch(`${HTTP_BASE}/archive?${params}`);
  return res.ok ? res.json() : [];
}
