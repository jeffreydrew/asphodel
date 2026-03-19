// ─── Stats Panel ──────────────────────────────────────────────────────────────
// Toggleable analytics panel (top-left) showing token usage, cost, and world
// metrics. Polls GET /stats on open and every 15s while visible.

import { getStats } from './api.js';

// ── Pricing mirror (display only) ─────────────────────────────────────────────
const PRICE_INPUT       = 0.80  / 1_000_000;
const PRICE_OUTPUT      = 4.00  / 1_000_000;
const PRICE_CACHE_WRITE = 1.00  / 1_000_000;
const PRICE_CACHE_READ  = 0.08  / 1_000_000;

// ── Time filter options ────────────────────────────────────────────────────────
const FILTERS = [
  { label: '1H',  sec: 3_600 },
  { label: '6H',  sec: 21_600 },
  { label: '24H', sec: 86_400 },
  { label: '7D',  sec: 604_800 },
];

let visible      = false;
let activeFilter = FILTERS[0];
let pollTimer    = null;
let lastData     = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function initStats() {
  window.__toggleStats = toggleStats;
  // Close on Escape
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && visible) hideStats(); });
}

// ── Toggle / show / hide ──────────────────────────────────────────────────────

function toggleStats() {
  visible ? hideStats() : showStats();
}

function showStats() {
  visible = true;
  const panel = document.getElementById('stats-panel');
  const btn   = document.getElementById('stats-toggle-btn');
  panel.classList.add('open');
  btn.classList.add('active');
  refresh();
  pollTimer = setInterval(refresh, 15_000);
}

function hideStats() {
  visible = false;
  const panel = document.getElementById('stats-panel');
  const btn   = document.getElementById('stats-toggle-btn');
  panel.classList.remove('open');
  btn.classList.remove('active');
  clearInterval(pollTimer);
  pollTimer = null;
}

// ── Data fetch & render ───────────────────────────────────────────────────────

async function refresh() {
  const data = await getStats(activeFilter.sec);
  if (!data) {
    document.getElementById('stats-body').innerHTML =
      '<div class="stats-empty">no data — server not running?</div>';
    return;
  }
  lastData = data;
  render(data);
}

function render(data) {
  const { llm, world, uptime_s, memory_mb, model, window_s } = data;
  const totals = llm.totals;

  document.getElementById('stats-body').innerHTML = `
    ${renderChart(llm.timeline, llm.bucketMs)}
    ${renderLegend()}
    ${renderTotals(totals)}
    ${renderBySoul(llm.bySoul, totals.cost)}
    ${renderWorld(world, totals)}
    ${renderServer(uptime_s, memory_mb, model, window_s)}
  `;
}

// ── Chart ────────────────────────────────────────────────────────────────────

function renderChart(timeline, bucketMs) {
  if (!timeline || !timeline.length) {
    return '<div class="stats-chart-wrap"><div class="stats-empty">collecting data…</div></div>';
  }

  const W      = 296;
  const H      = 72;
  const PAD    = { l: 32, r: 4, t: 4, b: 18 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const maxCost = Math.max(...timeline.map(b => b.cost), 0.000001);

  const barW   = Math.max(1, Math.floor(innerW / timeline.length) - 1);
  const bars   = timeline.map((b, i) => {
    const x   = PAD.l + i * (barW + 1);
    const th  = Math.round((b.cost / maxCost) * innerH);
    if (th === 0) return '';

    // Stack from bottom: cacheRead (green), cacheWrite (yellow), input (blue), output (purple)
    const crH = Math.round((b.cacheRead  * PRICE_CACHE_READ  / b.cost) * th);
    const cwH = Math.round((b.cacheWrite * PRICE_CACHE_WRITE / b.cost) * th);
    const inH = Math.round((b.input      * PRICE_INPUT       / b.cost) * th);
    const outH = th - crH - cwH - inH;

    let y = H - PAD.b;
    const segs = [];
    if (crH  > 0) { segs.push(`<rect x="${x}" y="${y - crH}"  width="${barW}" height="${crH}"  fill="var(--notable)"/>`); y -= crH; }
    if (cwH  > 0) { segs.push(`<rect x="${x}" y="${y - cwH}"  width="${barW}" height="${cwH}"  fill="var(--sig)"/>`);    y -= cwH; }
    if (inH  > 0) { segs.push(`<rect x="${x}" y="${y - inH}"  width="${barW}" height="${inH}"  fill="var(--accent)"/>`); y -= inH; }
    if (outH > 0) { segs.push(`<rect x="${x}" y="${y - outH}" width="${barW}" height="${outH}" fill="#c77dff"/>`); }
    return segs.join('');
  }).join('');

  // Y-axis labels (0 and max)
  const maxLabel = maxCost >= 0.01 ? `$${maxCost.toFixed(2)}` : `$${(maxCost * 1000).toFixed(2)}m`;
  const yLabels = `
    <text x="${PAD.l - 3}" y="${PAD.t + 5}"       font-size="7" fill="var(--text-dim)" text-anchor="end">${maxLabel}</text>
    <text x="${PAD.l - 3}" y="${H - PAD.b + 1}"   font-size="7" fill="var(--text-dim)" text-anchor="end">$0</text>
  `;

  // X-axis time labels (sparse)
  const step = Math.ceil(timeline.length / 5);
  const xLabels = timeline.filter((_, i) => i % step === 0).map((b, idx) => {
    const i   = idx * step;
    const x   = PAD.l + i * (barW + 1) + barW / 2;
    const d   = new Date(b.ts);
    const lbl = bucketMs < 3_600_000
      ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `<text x="${x}" y="${H - 2}" font-size="7" fill="var(--text-dim)" text-anchor="middle">${lbl}</text>`;
  }).join('');

  const baseline = `<line x1="${PAD.l}" y1="${H - PAD.b}" x2="${W - PAD.r}" y2="${H - PAD.b}" stroke="var(--border)" stroke-width="0.5"/>`;

  return `<div class="stats-chart-wrap">
    <svg width="${W}" height="${H}" style="overflow:visible;display:block">${yLabels}${bars}${baseline}${xLabels}</svg>
  </div>`;
}

function renderLegend() {
  return `<div class="stats-legend">
    <span class="stats-dot" style="background:var(--accent)"></span>input
    <span class="stats-dot" style="background:#c77dff"></span>output
    <span class="stats-dot" style="background:var(--sig)"></span>cache write
    <span class="stats-dot" style="background:var(--notable)"></span>cache read
  </div>`;
}

// ── Totals section ────────────────────────────────────────────────────────────

function renderTotals(t) {
  const hit = t.cacheHitRate != null ? `${(t.cacheHitRate * 100).toFixed(1)}%` : '—';
  const savings = t.cacheRead > 0
    ? `saved ~$${((t.cacheRead * (PRICE_INPUT - PRICE_CACHE_READ))).toFixed(4)}`
    : '';

  return `<div class="stats-section">
    <div class="stats-section-title">TOTALS</div>
    ${row('Cost',        `<span class="stats-hi">$${t.cost.toFixed(4)}</span>`)}
    ${row('Calls',       fmtN(t.calls))}
    ${row('Input',       fmtTok(t.input))}
    ${row('Output',      fmtTok(t.output))}
    ${row('Cache write', fmtTok(t.cacheWrite))}
    ${row('Cache read',  `${fmtTok(t.cacheRead)} <span class="stats-green">${savings}</span>`)}
    ${row('Cache hit',   `<span class="stats-green">${hit}</span>`)}
  </div>`;
}

// ── By soul ───────────────────────────────────────────────────────────────────

function renderBySoul(bySoul, totalCost) {
  const entries = Object.entries(bySoul)
    .filter(([, b]) => b.calls > 0)
    .sort((a, b) => b[1].cost - a[1].cost);

  if (!entries.length) return '';

  const bars = entries.map(([name, b]) => {
    const pct  = totalCost > 0 ? b.cost / totalCost : 0;
    const firstName = name.split(' ')[0];
    return `<div class="stats-soul-row">
      <span class="stats-soul-name">${firstName}</span>
      <div class="stats-soul-bar-wrap">
        <div class="stats-soul-bar" style="width:${(pct * 100).toFixed(1)}%"></div>
      </div>
      <span class="stats-soul-val">$${b.cost.toFixed(4)}</span>
      <span class="stats-soul-calls">${b.calls}×</span>
    </div>`;
  }).join('');

  return `<div class="stats-section">
    <div class="stats-section-title">BY SOUL</div>
    ${bars}
  </div>`;
}

// ── World metrics ─────────────────────────────────────────────────────────────

function renderWorld(world, totals) {
  const cph = totals.calls > 0 && totals.cost > 0
    ? `$${(totals.cost / totals.calls).toFixed(5)}/call`
    : '—';

  const perSoulRows = (world.thoughts_per_soul ?? [])
    .sort((a, b) => b.count - a.count)
    .map(s => `<div class="stats-soul-row">
      <span class="stats-soul-name">${s.name.split(' ')[0]}</span>
      <span class="stats-soul-val">${fmtN(s.count)} thoughts</span>
    </div>`)
    .join('');

  return `<div class="stats-section">
    <div class="stats-section-title">◈ TOWER MIND</div>
    ${row('Thoughts today',    `<span class="stats-hi">${fmtN(world.thoughts_24h ?? 0)}</span> across ${world.souls_active} souls`)}
    ${row('Memories stored',   fmtN(world.memories_total ?? 0))}
    ${row('Conversations today', fmtN(world.conversations_today ?? 0))}
    ${perSoulRows ? `<div style="margin-top:4px">${perSoulRows}</div>` : ''}
  </div>
  <div class="stats-section">
    <div class="stats-section-title">WORLD</div>
    ${row('Tick',             fmtN(world.tick))}
    ${row('Souls active',     world.souls_active)}
    ${row('Actions / hour',   fmtN(world.actions_last_hour))}
    ${row('LLM calls',        fmtN(totals.calls))}
    ${row('Avg cost / call',  cph)}
  </div>`;
}

// ── Server metrics ────────────────────────────────────────────────────────────

function renderServer(uptime_s, memory_mb, model, window_s) {
  const up = fmtUptime(uptime_s);
  const win = FILTERS.find(f => f.sec === window_s)?.label ?? `${window_s}s`;

  return `<div class="stats-section">
    <div class="stats-section-title">SERVER</div>
    ${row('Model',    `<span class="stats-dim">${model}</span>`)}
    ${row('Uptime',   up)}
    ${row('Memory',   `${memory_mb} MB`)}
    ${row('Window',   win)}
    ${row('Updated',  'just now')}
  </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function row(label, value) {
  return `<div class="stats-row"><span class="stats-label">${label}</span><span class="stats-value">${value}</span></div>`;
}

function fmtN(n) {
  if (n == null) return '—';
  return n.toLocaleString();
}

function fmtTok(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtUptime(s) {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// ── Filter wiring (called after HTML is in the DOM) ──────────────────────────

export function wireStatsFilters() {
  document.querySelectorAll('.stats-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stats-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = FILTERS.find(f => f.label === btn.dataset.filter) ?? FILTERS[0];
      if (visible) refresh();
    });
  });
}
