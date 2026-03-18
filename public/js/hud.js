// ─── HUD Manager ─────────────────────────────────────────────────────────────
// Manages all HTML overlays: soul cards, world log, clock, soul panel.

const SOUL_COLORS = ['#ff6b9d', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff'];

let souls = [];          // latest soul array from WorldUpdate
let selectedSoulId = null;
let milestoneTimer = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initHUD() {
  document.getElementById('panel-close').addEventListener('click', closeSoulPanel);

  const chatSend = document.getElementById('chat-send');
  const chatInput = document.getElementById('chat-input');

  chatSend.addEventListener('click', sendDirective);
  chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendDirective(); });

  // Archive panel
  document.getElementById('archive-close').addEventListener('click', closeArchive);
  document.getElementById('archive-refresh').addEventListener('click', () => loadArchive());
  document.getElementById('archive-type-filter').addEventListener('change', () => loadArchive());
  document.getElementById('archive-soul-filter').addEventListener('change', () => loadArchive());
  window.__openArchive = openArchive;

  // Clock tick
  setInterval(updateClock, 1_000);
}

// ─── World Update ─────────────────────────────────────────────────────────────

export function updateHUD(data) {
  souls = data.souls;
  renderSoulCards(data.souls);
  renderWorldLog(data.recent_log);
  checkMilestones(data.recent_log);
}

function updateClock() {
  document.getElementById('clock-time').textContent =
    new Date().toLocaleTimeString('en-US', { hour12: false });
}

// ─── Soul Cards ───────────────────────────────────────────────────────────────

function renderSoulCards(souls) {
  document.getElementById('clock-tick').textContent = `${souls.length} SOULS ACTIVE`;

  const container = document.getElementById('soul-cards');
  souls.forEach((soul, i) => {
    let card = document.getElementById(`soul-card-${soul.id}`);
    if (!card) {
      card = createSoulCard(soul, i);
      container.appendChild(card);
    }
    updateSoulCard(card, soul, i);
  });
}

function createSoulCard(soul, i) {
  const card = document.createElement('div');
  card.className = 'soul-card';
  card.id = `soul-card-${soul.id}`;
  card.addEventListener('click', () => openSoulPanel(soul.id));
  card.innerHTML = `
    <div class="soul-card-header">
      <div class="soul-dot" style="background:${SOUL_COLORS[i]}"></div>
      <span class="soul-card-name">${soul.name}</span>
      <span class="soul-card-action" id="action-${soul.id}">—</span>
    </div>
    <div class="reward-bar-track">
      <div class="reward-bar-fill" id="reward-bar-${soul.id}" style="width:50%"></div>
    </div>
    <div class="wallet-amount" id="wallet-${soul.id}">$0.00</div>
  `;
  return card;
}

function updateSoulCard(card, soul, i) {
  card.className = `soul-card${soul.id === selectedSoulId ? ' selected' : ''}`;

  const actionEl = document.getElementById(`action-${soul.id}`);
  if (actionEl) actionEl.textContent = soul.last_action ?? '—';

  const barEl = document.getElementById(`reward-bar-${soul.id}`);
  if (barEl && soul.last_reward) {
    const r   = soul.last_reward.r_total;
    const pct = Math.round(Math.min(100, Math.max(0, (r + 1) / 2 * 100)));
    barEl.style.width    = `${pct}%`;
    barEl.className      = `reward-bar-fill ${r >= 0 ? 'reward-positive' : 'reward-negative'}`;
  }

  const walletEl = document.getElementById(`wallet-${soul.id}`);
  if (walletEl && soul.wallet) {
    walletEl.textContent = `$${soul.wallet.balance_abstract.toFixed(2)} abstract`;
  }
}

// ─── World Log ────────────────────────────────────────────────────────────────

const seenLogIds = new Set();

function renderWorldLog(entries) {
  const container = document.getElementById('log-entries');
  const fragment  = document.createDocumentFragment();

  const newEntries = entries
    .filter(e => e.id && !seenLogIds.has(e.id))
    .slice(0, 5);

  newEntries.forEach(entry => {
    seenLogIds.add(entry.id);
    const sigChar = entry.significance === 'SIGNIFICANT' ? '★' :
                    entry.significance === 'NOTABLE'     ? '◆' : '·';

    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `
      <span class="log-sig ${entry.significance}">${sigChar}</span>
      <span class="log-text ${entry.significance}">${truncate(entry.description, 60)}</span>
    `;
    fragment.prepend(div);
  });

  if (fragment.childNodes.length > 0) {
    container.prepend(fragment);
    // Trim to 20 entries
    while (container.children.length > 20) {
      container.removeChild(container.lastChild);
    }
  }
}

// ─── Milestone Banner ─────────────────────────────────────────────────────────

function checkMilestones(entries) {
  const sig = entries.find(e => e.significance === 'SIGNIFICANT' && !seenLogIds.has(`flash-${e.id}`));
  if (!sig) return;
  seenLogIds.add(`flash-${sig.id}`);
  flashMilestone(sig.description);
}

function flashMilestone(text) {
  const banner = document.getElementById('milestone-banner');
  banner.textContent = `★ ${truncate(text, 80)} ★`;
  banner.classList.add('show');
  clearTimeout(milestoneTimer);
  milestoneTimer = setTimeout(() => banner.classList.remove('show'), 4_000);
}

// ─── Soul Panel ───────────────────────────────────────────────────────────────

export function openSoulPanel(soulId) {
  selectedSoulId = soulId;
  const soul = souls.find(s => s.id === soulId);
  if (!soul) return;

  const panel = document.getElementById('soul-panel');
  renderSoulPanel(soul);
  panel.classList.add('open');

  // Pre-select soul in chat dropdown
  const select = document.getElementById('chat-soul-select');
  if (select) select.value = soulId;

  // Update card selection
  document.querySelectorAll('.soul-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`soul-card-${soulId}`)?.classList.add('selected');
}

function closeSoulPanel() {
  document.getElementById('soul-panel').classList.remove('open');
  selectedSoulId = null;
  document.querySelectorAll('.soul-card').forEach(c => c.classList.remove('selected'));
}

function renderSoulPanel(soul) {
  const soulIndex = souls.findIndex(s => s.id === soul.id);
  const color     = SOUL_COLORS[soulIndex] ?? '#aaa';

  document.getElementById('panel-soul-dot').style.background = color;
  document.getElementById('panel-soul-name').textContent     = soul.name;
  document.getElementById('panel-wallet').textContent        =
    `$${soul.wallet?.balance_abstract.toFixed(2) ?? '0.00'} abstract`;

  renderVitals(soul.vitals);
  renderQuirks(soul.quirks);
  renderRecentRewards(soul.last_reward);
}

function renderVitals(vitals) {
  if (!vitals) return;
  const items = [
    { key: 'hunger',    label: 'HUNGER',     cls: 'vital-hunger',  val: vitals.hunger,     inv: true },
    { key: 'energy',    label: 'ENERGY',     cls: 'vital-energy',  val: vitals.energy },
    { key: 'health',    label: 'HEALTH',     cls: 'vital-health',  val: vitals.health },
    { key: 'happiness', label: 'HAPPINESS',  cls: 'vital-happy',   val: vitals.happiness },
    { key: 'sleep',     label: 'SLEEP DEBT', cls: 'vital-sleep',   val: vitals.sleep_debt, inv: true },
  ];

  const grid = document.getElementById('panel-vitals');
  grid.innerHTML = '';
  items.forEach(item => {
    const pct = item.inv ? 100 - item.val : item.val;
    grid.innerHTML += `
      <div class="vital-item">
        <span class="vital-label">${item.label}</span>
        <span class="vital-value">${item.val}</span>
        <div class="vital-track">
          <div class="vital-fill ${item.cls}" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  });
}

function renderQuirks(quirks = []) {
  const container = document.getElementById('panel-quirks');
  const persisted = quirks.filter(q => q.persisted);
  container.innerHTML = persisted.length === 0
    ? '<span style="color:var(--text-dim);font-size:10px">No persistent quirks yet.</span>'
    : '';

  persisted.forEach(q => {
    const strengthPct = Math.round(q.strength * 100);
    container.innerHTML += `
      <div class="quirk-item">
        <div class="quirk-name">${q.quirk_id}</div>
        <div class="quirk-trigger">${q.trigger}</div>
        <div class="quirk-strength" style="width:${strengthPct}%"></div>
      </div>
    `;
  });
}

function renderRecentRewards(reward) {
  const container = document.getElementById('panel-rewards');
  if (!reward) {
    container.innerHTML = '<span style="color:var(--text-dim);font-size:10px">No reward data yet.</span>';
    return;
  }

  const rows = [
    { label: 'Total',   val: reward.r_total },
    { label: 'Profit',  val: reward.r_profit },
    { label: 'Social',  val: reward.r_social },
    { label: 'Health',  val: reward.r_health },
    { label: 'Penalty', val: -reward.r_penalty },
  ];

  container.innerHTML = rows.map(r => {
    const sign  = r.val >= 0 ? '+' : '';
    const cls   = r.val >= 0 ? 'pos' : 'neg';
    return `<div class="reward-row"><span>${r.label}</span><span class="val ${cls}">${sign}${r.val.toFixed(4)}</span></div>`;
  }).join('');
}

// ─── Chat / Directive ─────────────────────────────────────────────────────────

export function populateSoulSelect(soulList) {
  const select = document.getElementById('chat-soul-select');
  select.innerHTML = soulList.map(s =>
    `<option value="${s.id}">${s.name.split(' ')[0]}</option>`
  ).join('');

  // Also populate archive soul filter
  const archiveFilter = document.getElementById('archive-soul-filter');
  const currentVal    = archiveFilter.value;
  archiveFilter.innerHTML = '<option value="">All souls</option>' +
    soulList.map(s => `<option value="${s.id}">${s.name.split(' ')[0]}</option>`).join('');
  archiveFilter.value = currentVal;
}

async function sendDirective() {
  const select  = document.getElementById('chat-soul-select');
  const input   = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  const soulId  = selectedSoulId ?? select.value;
  if (!soulId) return;

  const { sendDirective: apiSend } = await import('./api.js');
  const ok = await apiSend(soulId, message);

  const feedback = document.getElementById('chat-feedback');
  feedback.textContent = ok ? `✓ Directive sent` : '✗ Failed';
  feedback.classList.add('show');
  setTimeout(() => feedback.classList.remove('show'), 2_500);

  input.value = '';
}

// ─── Archive Panel ────────────────────────────────────────────────────────────

let archiveWorks = [];

function openArchive() {
  document.getElementById('archive-panel').classList.add('open');
  populateSoulSelect(souls);  // refresh soul dropdown
  loadArchive();
}

function closeArchive() {
  document.getElementById('archive-panel').classList.remove('open');
}

async function loadArchive() {
  const type   = document.getElementById('archive-type-filter').value;
  const soulId = document.getElementById('archive-soul-filter').value;

  const { getArchive } = await import('./api.js');
  archiveWorks = await getArchive({ type: type || undefined, soulId: soulId || undefined });

  renderArchiveList(archiveWorks);
  // Clear reader
  document.getElementById('archive-reader-title').textContent   = 'Select a work';
  document.getElementById('archive-reader-meta').textContent    = '';
  document.getElementById('archive-reader-content').textContent = '';
}

function renderArchiveList(works) {
  const list = document.getElementById('archive-list');
  list.innerHTML = '';

  if (!works.length) {
    list.innerHTML = '<div class="archive-empty">No works yet. Souls will create them in the library.</div>';
    return;
  }

  // Group by type
  const groups = { writing: [], art: [], research: [] };
  works.forEach(w => {
    const g = groups[w.type] ?? [];
    g.push(w);
    groups[w.type] = g;
  });

  const typeLabels = { writing: '✍ Writing', art: '🎨 Art', research: '🔍 Research' };

  Object.entries(groups).forEach(([type, items]) => {
    if (!items.length) return;
    const section = document.createElement('div');
    section.className = 'archive-section';
    section.innerHTML = `<div class="archive-section-label">${typeLabels[type] ?? type.toUpperCase()}</div>`;

    items.forEach(work => {
      const item = document.createElement('div');
      item.className = 'archive-item';
      item.innerHTML = `
        <div class="archive-item-title">${escapeHtml(work.title)}</div>
        <div class="archive-item-author">${escapeHtml(work.soul_name ?? '?')} · ${formatTs(work.ts)}</div>
      `;
      item.addEventListener('click', () => openWork(work));
      section.appendChild(item);
    });

    list.appendChild(section);
  });
}

function openWork(work) {
  document.querySelectorAll('.archive-item').forEach(el => el.classList.remove('active'));

  document.getElementById('archive-reader-title').textContent = work.title;
  document.getElementById('archive-reader-meta').textContent =
    `${work.soul_name} · ${work.type} · ${new Date(work.ts).toLocaleString()}`;
  document.getElementById('archive-reader-content').textContent = work.content;

  // Highlight active item
  event.currentTarget.classList.add('active');
}

function formatTs(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str, n) {
  return str.length <= n ? str : str.substring(0, n - 1) + '…';
}
