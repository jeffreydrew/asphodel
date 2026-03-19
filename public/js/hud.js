// ─── HUD Manager ─────────────────────────────────────────────────────────────
// Manages all HTML overlays: soul cards, world log, clock, soul panel.

const SOUL_COLORS = ['#ff6b9d', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff'];

let souls = [];          // latest soul array from WorldUpdate
let selectedSoulId = null;
let milestoneTimer = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initHUD() {
  document.getElementById('panel-close').addEventListener('click', closeSoulPanel);

  // Wire conversation feed to speech bubble events
  import('./api.js').then(({ onSpeechBubble }) => {
    onSpeechBubble(event => appendConversation(event));
  });

  const chatSend = document.getElementById('chat-send');
  const chatInput = document.getElementById('chat-input');

  chatSend.addEventListener('click', sendDirective);
  chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendDirective(); });

  const chatSoulSelect = document.getElementById('chat-soul-select');
  chatSoulSelect.addEventListener('change', () => {
    const soulId = chatSoulSelect.value;
    const soul   = souls.find(s => s.id === soulId);
    updateSendButton(soul?.name ?? null);
  });

  // Archive panel
  document.getElementById('archive-close').addEventListener('click', closeArchive);
  document.getElementById('archive-refresh').addEventListener('click', () => loadArchive());
  document.getElementById('archive-type-filter').addEventListener('change', () => loadArchive());
  document.getElementById('archive-soul-filter').addEventListener('change', () => loadArchive());
  window.__openArchive = openArchive;

  // Log panel
  document.getElementById('log-panel-close').addEventListener('click', closeLogPanel);
  document.getElementById('log-panel-refresh').addEventListener('click', () => loadLogPanel());
  document.getElementById('log-sig-filter').addEventListener('change', () => loadLogPanel());
  document.getElementById('log-soul-filter').addEventListener('change', () => loadLogPanel());
  document.getElementById('log-time-filter').addEventListener('change', () => loadLogPanel());
  window.__openLogPanel = openLogPanel;

  // Clock tick
  setInterval(updateClock, 1_000);

  // HUD toggle
  window.__toggleHUD = toggleHUD;
  document.addEventListener('keydown', e => {
    if (e.key === 'h' || e.key === 'H') {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      toggleHUD();
    }
  });
}

function toggleHUD() {
  const isHidden = document.body.classList.toggle('hud-hidden');
  const btn = document.getElementById('hud-toggle-btn');
  if (btn) btn.textContent = isHidden ? '◈ SHOW UI' : '◈ HIDE UI';
}

// ─── World Update ─────────────────────────────────────────────────────────────

export function updateHUD(data) {
  souls = data.souls;
  renderSoulCards(data.souls);
  renderSimStatus(data.souls);
  renderWorldLog(data.recent_log);
  renderThoughtStream(data.recent_log);
  checkMilestones(data.recent_log);
}

function updateClock() {
  document.getElementById('clock-time').textContent =
    new Date().toLocaleTimeString('en-US', { hour12: false });
}

// ─── Soul Cards ───────────────────────────────────────────────────────────────

function renderSoulCards(souls) {
  document.getElementById('clock-tick').textContent = `${souls.length} SIMS ACTIVE`;

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

const seenLogIds  = new Set();
let _logBuffer    = [];   // rolling buffer of last 40 received entries
let _showRoutine  = false;

function renderWorldLog(entries) {
  const container = document.getElementById('log-entries');

  // Buffer all new entries (even ROUTINE, so the toggle can show them later)
  const newEntries = entries.filter(e => e.id && !seenLogIds.has(e.id));
  newEntries.forEach(e => {
    seenLogIds.add(e.id);
    _logBuffer.push(e);
  });
  if (_logBuffer.length > 40) _logBuffer = _logBuffer.slice(-40);

  // Only append non-ROUTINE entries to the HUD stream by default
  const toRender = newEntries
    .filter(e => _showRoutine || e.significance !== 'ROUTINE')
    .slice(0, 5);

  if (toRender.length === 0) return;

  const fragment = document.createDocumentFragment();

  toRender.forEach(entry => {
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

  container.prepend(fragment);
  while (container.children.length > 20) {
    container.removeChild(container.lastChild);
  }
}

// Called by the "show/hide routine" toggle link in the HUD
window.__toggleRoutine = function () {
  _showRoutine = !_showRoutine;
  const toggleEl = document.getElementById('log-routine-toggle');
  if (toggleEl) toggleEl.textContent = _showRoutine ? 'hide routine' : 'show routine';

  // Full re-render of the HUD stream from the buffer
  const container = document.getElementById('log-entries');
  container.innerHTML = '';

  const toShow = _logBuffer
    .filter(e => _showRoutine || e.significance !== 'ROUTINE')
    .slice(-20);

  // Iterate oldest-first and prepend each so newest ends at top
  toShow.forEach(entry => {
    const sigChar = entry.significance === 'SIGNIFICANT' ? '★' :
                    entry.significance === 'NOTABLE'     ? '◆' : '·';
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `
      <span class="log-sig ${entry.significance}">${sigChar}</span>
      <span class="log-text ${entry.significance}">${truncate(entry.description, 60)}</span>
    `;
    container.prepend(div);
  });
};

// ─── Thought Stream ───────────────────────────────────────────────────────────

const seenThoughtIds = new Set();

function renderThoughtStream(entries) {
  const container = document.getElementById('thought-stream');
  if (!container) return;

  const withReasoning = entries.filter(e =>
    e.id &&
    !seenThoughtIds.has(e.id) &&
    e.metadata?.reasoning &&
    e.significance !== 'ROUTINE',
  );

  withReasoning.forEach(entry => {
    seenThoughtIds.add(entry.id);
    const firstName = (entry.soul_name ?? '?').split(' ')[0];
    const div = document.createElement('div');
    div.className = 'thought-entry';
    div.innerHTML = `<span class="thought-name">${escapeHtml(firstName)}</span> ${escapeHtml(truncate(entry.metadata.reasoning, 80))}`;
    container.prepend(div);
  });

  while (container.children.length > 8) container.removeChild(container.lastChild);
}

// ─── Conversation Feed ────────────────────────────────────────────────────────

function appendConversation(event) {
  const container = document.getElementById('conversation-feed');
  if (!container) return;

  const firstName = (event.soul_name ?? '?').split(' ')[0];
  const isConvo   = !!event.conversation_id;
  const div       = document.createElement('div');
  div.className   = `convo-line ${isConvo ? 'convo-dialogue' : 'convo-narration'}`;
  div.innerHTML   = `<span class="convo-name">${escapeHtml(firstName)}</span> ${escapeHtml(truncate(event.text, 80))}`;
  container.prepend(div);

  while (container.children.length > 20) container.removeChild(container.lastChild);
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

  // Fetch extended data (identity, personality weights, goals)
  fetch(`/souls/${soulId}`)
    .then(r => r.json())
    .then(data => {
      const identity = typeof data.soul.identity === 'string'
        ? JSON.parse(data.soul.identity) : data.soul.identity;
      const weights = typeof data.soul.reward_weights === 'string'
        ? JSON.parse(data.soul.reward_weights) : data.soul.reward_weights;
      renderIdentity(identity);
      renderPersonalityWeights(weights);
    })
    .catch(() => {});

  fetch(`/souls/${soulId}/goals`)
    .then(r => r.json())
    .then(goals => renderGoals(goals))
    .catch(() => {});

  // Pre-select soul in chat dropdown
  const select = document.getElementById('chat-soul-select');
  if (select) select.value = soulId;

  // Update send button text
  updateSendButton(soul.name);

  // Update card selection
  document.querySelectorAll('.soul-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`soul-card-${soulId}`)?.classList.add('selected');
}

function closeSoulPanel() {
  document.getElementById('soul-panel').classList.remove('open');
  selectedSoulId = null;
  document.querySelectorAll('.soul-card').forEach(c => c.classList.remove('selected'));
  updateSendButton(null);
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

function renderIdentity(identity) {
  const bio    = document.getElementById('panel-bio');
  const skills = document.getElementById('panel-skills');
  if (!identity) { bio.textContent = ''; skills.innerHTML = ''; return; }
  bio.textContent = identity.bio ?? '';
  const tags = Array.isArray(identity.skills_public) ? identity.skills_public : [];
  skills.innerHTML = tags.map(s => `<span class="skill-tag">${s}</span>`).join('');

  // Backstory
  const backstorySection = document.getElementById('panel-backstory-section');
  const backstoryEl      = document.getElementById('panel-backstory');
  if (identity.backstory) {
    backstoryEl.textContent = identity.backstory;
    backstorySection.style.display = '';
  } else {
    backstorySection.style.display = 'none';
  }

  // Ambitions
  const ambitionsSection = document.getElementById('panel-ambitions-section');
  const ambitionsEl      = document.getElementById('panel-ambitions');
  if (identity.ambitions) {
    ambitionsEl.textContent = identity.ambitions;
    ambitionsSection.style.display = '';
  } else {
    ambitionsSection.style.display = 'none';
  }

  // Personality notes
  const pnSection = document.getElementById('panel-personality-notes-section');
  const pnEl      = document.getElementById('panel-personality-notes');
  if (identity.personality_notes) {
    pnEl.textContent = identity.personality_notes;
    pnSection.style.display = '';
  } else {
    pnSection.style.display = 'none';
  }
}

function renderPersonalityWeights(weights) {
  const container = document.getElementById('panel-personality');
  if (!weights) { container.innerHTML = ''; return; }
  const rows = [
    { label: 'Profit drive',  key: 'w1_profit', def: 0.40 },
    { label: 'Social drive',  key: 'w2_social', def: 0.35 },
    { label: 'Health drive',  key: 'w3_health', def: 0.25 },
  ];
  container.innerHTML = rows.map(r => {
    const val = weights[r.key] ?? r.def;
    const pct = Math.round(val * 100);
    return `
      <div class="personality-row">
        <span class="personality-label">${r.label}</span>
        <span style="color:var(--text);font-size:10px">${pct}%</span>
        <div class="personality-bar-track">
          <div class="personality-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

function renderGoals(goals) {
  const container = document.getElementById('panel-goals');
  if (!Array.isArray(goals) || goals.length === 0) {
    container.innerHTML = '<span style="color:var(--text-dim);font-size:10px">No active goals yet.</span>';
    return;
  }
  const sorted = [...goals].sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9));
  container.innerHTML = sorted.map(g => {
    const priCls   = `goal-priority-${Math.min(g.priority ?? 3, 3)}`;
    let notes = '';
    try {
      const arr = typeof g.progress_notes === 'string' ? JSON.parse(g.progress_notes) : g.progress_notes;
      if (Array.isArray(arr) && arr.length > 0) notes = arr[arr.length - 1];
    } catch {}
    return `
      <div class="goal-item ${priCls}">
        <div class="goal-text">${g.goal_text ?? ''}</div>
        ${notes ? `<div class="goal-notes">${notes}</div>` : ''}
      </div>`;
  }).join('');
}

// ─── Chat / Directive ─────────────────────────────────────────────────────────

function updateSendButton(soulName) {
  const btn = document.getElementById('chat-send');
  if (!btn) return;
  btn.textContent = soulName ? `Send to ${soulName.split(' ')[0]}` : 'Send';
}

export function populateSoulSelect(soulList) {
  const select = document.getElementById('chat-soul-select');
  select.innerHTML = soulList.map(s =>
    `<option value="${s.id}">${s.name.split(' ')[0]}</option>`
  ).join('');

  // Also populate archive soul filter
  const archiveFilter = document.getElementById('archive-soul-filter');
  const archiveCurrent = archiveFilter.value;
  archiveFilter.innerHTML = '<option value="">All souls</option>' +
    soulList.map(s => `<option value="${s.id}">${s.name.split(' ')[0]}</option>`).join('');
  archiveFilter.value = archiveCurrent;

  // Also populate log soul filter
  const logFilter = document.getElementById('log-soul-filter');
  const logCurrent = logFilter.value;
  logFilter.innerHTML = '<option value="">All souls</option>' +
    soulList.map(s => `<option value="${s.id}">${s.name.split(' ')[0]}</option>`).join('');
  logFilter.value = logCurrent;
}

async function sendDirective() {
  const select  = document.getElementById('chat-soul-select');
  const input   = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  const soulId  = selectedSoulId ?? select.value;
  if (!soulId) return;

  const soul = souls.find(s => s.id === soulId);

  // Zoom to the sim on their current floor
  window.__zoomToSoul?.(soulId);

  const { sendDirective: apiSend } = await import('./api.js');
  const ok = await apiSend(soulId, message);

  const feedback = document.getElementById('chat-feedback');
  feedback.textContent = ok ? `✓ Directive sent to ${soul?.name?.split(' ')[0] ?? 'soul'}` : '✗ Failed';
  feedback.classList.add('show');
  setTimeout(() => feedback.classList.remove('show'), 2_500);

  input.value = '';

  if (ok) {
    const soulName = soul?.name?.split(' ')[0] ?? 'soul';
    appendConversation({
      soul_name: '⚡ DIRECTIVE',
      text: `Sent to ${soulName}: "${message.substring(0, 60)}"`,
      conversation_id: null,
    });
  }

  if (ok && soul) {
    processDirectiveResponse(soul, message);
  }
}

const DIRECTIVE_FLOOR_KEYWORDS = [
  { pattern: /\bgym\b|\bexercise\b|\bwork\s*out\b|\byoga\b/i, action: 'exercise',    floorLabel: 'GYM' },
  { pattern: /\beat\b|\bkitchen\b|\bcook\b|\bfood\b|\blunch\b|\bdinner\b|\bbreakfast\b/i, action: 'eat', floorLabel: 'KITCHEN' },
  { pattern: /\bsleep\b|\brest\b|\bnap\b|\bbed\b|\bbedroom\b/i, action: 'rest',       floorLabel: 'BEDROOM' },
  { pattern: /\bwork\b|\boffice\b|\bjob\b|\bapply\b|\bapplication\b/i, action: 'browse_jobs', floorLabel: 'OFFICE' },
  { pattern: /\bread\b|\blibrary\b|\bwrite\b|\bbook\b|\bart\b|\bresearch\b/i, action: 'read_book', floorLabel: 'LIBRARY' },
  { pattern: /\blobby\b|\bsocial\b|\bmeet\b|\btalk\b/i, action: 'meet_soul',  floorLabel: 'LOBBY' },
];

async function processDirectiveResponse(soul, directive) {
  const soulName = soul.name.split(' ')[0];

  // Determine if directive implies a floor/action change
  let matchedAction = null;
  let matchedFloor  = null;
  for (const kw of DIRECTIVE_FLOOR_KEYWORDS) {
    if (kw.pattern.test(directive)) {
      matchedAction = kw.action;
      matchedFloor  = kw.floorLabel;
      break;
    }
  }

  // Build a short LLM prompt for the soul's response
  const identity = soul.identity
    ? (typeof soul.identity === 'string' ? (() => { try { return JSON.parse(soul.identity); } catch { return {}; } })() : soul.identity)
    : {};
  const bio = identity.bio ?? '';

  const prompt = [
    `You are ${soul.name}, a resident of Asphodel Tower.`,
    bio ? `About you: ${bio}` : '',
    `Current vitals — energy: ${soul.vitals?.energy ?? '?'}, happiness: ${soul.vitals?.happiness ?? '?'}, hunger: ${soul.vitals?.hunger ?? '?'}.`,
    `You just received this directive: "${directive}"`,
    matchedFloor ? `This means you should go to the ${matchedFloor}.` : '',
    `Respond in one short sentence (max 15 words) describing what you do next, in first person.`,
  ].filter(Boolean).join(' ');

  let responseText = null;
  try {
    const HTTP_BASE = location.protocol === 'https:'
      ? location.origin
      : `http://${location.hostname}:${window.ASPHODEL_HTTP_PORT ?? 3000}`;

    const res = await fetch(`${HTTP_BASE}/llm/directive-response`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ soul_id: soul.id, prompt }),
    });
    if (res.ok) {
      const data = await res.json();
      responseText = data.response ?? null;
    }
  } catch { /* fall through to fallback */ }

  // Fallback: generic acknowledgement
  if (!responseText) {
    if (matchedFloor) {
      responseText = `Heading to the ${matchedFloor} now.`;
    } else {
      responseText = `Understood. I'll take care of that.`;
    }
  }

  // Inject into world log UI immediately
  injectDirectiveLogEntry(soul, responseText);

  // Tell world.js to move the avatar to the target action/floor
  if (matchedAction) {
    const avatars = window.__getAvatars?.() ?? [];
    const avatar  = avatars.find(a => a?.id === soul.id);
    if (avatar) {
      avatar.setFloor(matchedAction);
      // Re-zoom after floor switch
      setTimeout(() => window.__zoomToSoul?.(soul.id), 400);
    }
  }
}

function injectDirectiveLogEntry(soul, text) {
  const container = document.getElementById('log-entries');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `
    <span class="log-sig NOTABLE">◆</span>
    <span class="log-text NOTABLE">${escapeHtml(soul.name.split(' ')[0])}: ${escapeHtml(text)}</span>
  `;
  container.prepend(div);

  while (container.children.length > 20) {
    container.removeChild(container.lastChild);
  }
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
    `${work.soul_name} · ${work.type} · ${new Date(work.ts).toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`;
  document.getElementById('archive-reader-content').textContent = work.content;

  // Highlight active item
  event.currentTarget.classList.add('active');
}

function formatTs(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Log Panel ────────────────────────────────────────────────────────────────

function openLogPanel() {
  document.getElementById('log-panel').classList.add('open');
  populateSoulSelect(souls);
  loadLogPanel();
}

function closeLogPanel() {
  document.getElementById('log-panel').classList.remove('open');
}

async function loadLogPanel() {
  const sig    = document.getElementById('log-sig-filter').value;
  const soulId = document.getElementById('log-soul-filter').value;
  const secs   = Number(document.getElementById('log-time-filter').value) || 0;
  const since  = secs ? Math.floor(Date.now() / 1000) - secs : undefined;

  const { getLog } = await import('./api.js');
  const entries = await getLog({
    significance: sig    || undefined,
    soulId:       soulId || undefined,
    since,
    limit: 200,
  });

  renderLogList(entries);

  // Clear reader
  showLogReaderPlaceholder();
}

function renderLogList(entries) {
  const list = document.getElementById('log-panel-list');
  list.innerHTML = '';

  if (!entries.length) {
    list.innerHTML = '<div class="log-panel-empty">No log entries match the current filters.</div>';
    return;
  }

  entries.forEach(entry => {
    const sigChar = entry.significance === 'SIGNIFICANT' ? '★' :
                    entry.significance === 'NOTABLE'     ? '◆' : '·';

    const div = document.createElement('div');
    div.className = 'log-panel-entry';
    div.innerHTML = `
      <span class="log-panel-entry-sig ${entry.significance}">${sigChar}</span>
      <div class="log-panel-entry-body">
        <div class="log-panel-entry-desc">${escapeHtml(truncate(entry.description, 120))}</div>
        <div class="log-panel-entry-meta">${escapeHtml(entry.soul_name ?? '?')} · ${entry.action} · ${formatTs(entry.ts)}</div>
      </div>
    `;
    div.addEventListener('click', () => {
      document.querySelectorAll('.log-panel-entry').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      openLogEntry(entry);
    });
    list.appendChild(div);
  });
}

function showLogReaderPlaceholder() {
  document.getElementById('log-reader-placeholder').style.display = '';
  document.getElementById('log-reader-sig').textContent        = '';
  document.getElementById('log-reader-action').textContent     = '';
  document.getElementById('log-reader-meta').textContent       = '';
  document.getElementById('log-reader-description').textContent= '';
  document.getElementById('log-reader-reasoning').textContent  = '';
  document.getElementById('log-reader-generated').textContent  = '';
}

function openLogEntry(entry) {
  document.getElementById('log-reader-placeholder').style.display = 'none';

  const sigLabels = { SIGNIFICANT: '★ SIGNIFICANT', NOTABLE: '◆ NOTABLE', ROUTINE: '· ROUTINE' };
  const sigColors = { SIGNIFICANT: 'var(--sig)', NOTABLE: 'var(--notable)', ROUTINE: 'var(--text-dim)' };

  const sigEl = document.getElementById('log-reader-sig');
  sigEl.textContent  = sigLabels[entry.significance] ?? entry.significance;
  sigEl.style.color  = sigColors[entry.significance] ?? 'var(--text-dim)';

  document.getElementById('log-reader-action').textContent =
    `${entry.action} — ${entry.soul_name ?? '?'}`;

  const ts = new Date(entry.ts * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  const reward = entry.metadata?.reward_total != null
    ? `  ·  reward: ${Number(entry.metadata.reward_total) >= 0 ? '+' : ''}${Number(entry.metadata.reward_total).toFixed(4)}`
    : '';
  document.getElementById('log-reader-meta').textContent = `${ts}${reward}`;

  document.getElementById('log-reader-description').textContent = entry.description ?? '';

  const reasoning = entry.metadata?.reasoning;
  const reasoningEl = document.getElementById('log-reader-reasoning');
  if (reasoning) {
    reasoningEl.textContent = `💭 ${reasoning}`;
  } else {
    reasoningEl.textContent = '';
  }

  const generated = entry.metadata?.generated_text;
  const generatedEl = document.getElementById('log-reader-generated');
  if (generated) {
    generatedEl.textContent = generated;
  } else {
    generatedEl.textContent = '';
  }
}

// ─── Sim Status Widget ────────────────────────────────────────────────────────

const ACTION_FLOOR_LABEL = {
  read_book:    'LIBRARY',
  write:        'LIBRARY',
  research:     'LIBRARY',
  rest:         'BEDROOM',
  sleep:        'BEDROOM',
  exercise:     'GYM',
  yoga:         'GYM',
  eat:          'KITCHEN',
  cook:         'KITCHEN',
  browse_jobs:  'OFFICE',
  work:         'OFFICE',
  meet_soul:    'LOBBY',
  socialize:    'LOBBY',
  idle:         'LOBBY',
};

const FLOOR_ORDER = ['LOBBY','KITCHEN','OFFICE','GYM','BEDROOM','LIBRARY'];

function getSimStatusLabel(soul) {
  const action = soul.last_action ?? 'idle';

  // Prefer live avatar state if world.js has initialised
  const avatarStatus = window.__getAvatarStatus?.(soul.id);
  const floorLabel   = avatarStatus?.floorLabel ?? ACTION_FLOOR_LABEL[action] ?? 'LOBBY';
  const floorIndex   = avatarStatus?.floorIndex  ?? FLOOR_ORDER.indexOf(floorLabel);
  const avatarState  = avatarStatus?.state;

  let taskText;
  if (!avatarStatus) {
    taskText = action.replace(/_/g, ' ');
  } else if (avatarState === 'DOING_TASK') {
    taskText = action.replace(/_/g, ' ');
  } else if (avatarState === 'WALKING_TO_TASK') {
    taskText = `→ ${action.replace(/_/g, ' ')}`;
  } else {
    // WANDER — show floor name as activity
    taskText = floorLabel.toLowerCase();
  }

  return { floorLabel, floorIndex, taskText };
}

function renderSimStatus(simSouls) {
  const container = document.getElementById('sim-status-list');
  if (!container) return;

  simSouls.forEach((soul, i) => {
    let row = document.getElementById(`sim-status-${soul.id}`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'sim-status-row';
      row.id = `sim-status-${soul.id}`;
      container.appendChild(row);
    }

    const color     = SOUL_COLORS[i] ?? '#aaa';
    const firstName = soul.name.split(' ')[0];
    const { floorLabel, floorIndex, taskText } = getSimStatusLabel(soul);

    row.innerHTML = `
      <div class="sim-status-dot" style="background:${color}"></div>
      <span class="sim-status-name">${escapeHtml(firstName)}</span>
      <span class="sim-status-action">${escapeHtml(taskText)}</span>
      <span class="sim-status-floor" data-floor="${floorIndex}" data-soul-id="${soul.id}">${floorLabel}</span>
    `;

    row.querySelector('.sim-status-floor').addEventListener('click', e => {
      e.stopPropagation();
      const fi = parseInt(e.currentTarget.dataset.floor, 10);
      window.__isolateFloorAndZoom?.(fi, soul.id);
    });

    row.addEventListener('click', () => {
      window.__zoomToSoul?.(soul.id);
      openSoulPanel(soul.id);
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str, n) {
  return str.length <= n ? str : str.substring(0, n - 1) + '…';
}
