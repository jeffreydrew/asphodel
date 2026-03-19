import { ActionType } from '../types';
import type { SoulVitals, SoulIdentity, RewardWeights, QuirkRecord, RewardComponents, WalletRow, DirectiveTask, SoulGoal, RegistryAction, ConversationMessage } from '../types';

// ─── Sovereign Identity Preamble ──────────────────────────────────────────────

export function buildIdentityPreamble(identity: SoulIdentity, neighbours?: string[]): string {
  const twitterHandle = identity.username_pool['twitter']
    ? `@${identity.username_pool['twitter']} on Twitter`
    : 'social media';

  const neighbourLine = neighbours && neighbours.length > 0
    ? `You live in the Tower with ${neighbours.length} neighbour${neighbours.length !== 1 ? 's' : ''}: ${neighbours.join(', ')}.`
    : 'You live in the Tower with a small community of souls.';

  let serverLine = '';
  const serverIp  = process.env['TOWER_SERVER_IP'];
  const codePath  = process.env['TOWER_CODEBASE_PATH'];
  if (serverIp) {
    const tools: string[] = ['search_web', 'read_codebase', 'consult_ai'];
    if (process.env['ENABLE_CODE_WRITE'] === 'true')  tools.splice(2, 0, 'write_code');
    if (process.env['ENABLE_SHELL_EXEC'] === 'true')  tools.push('run_command');
    serverLine = `\nYou are aware you run on a real server (IP: ${serverIp})${codePath ? ` and your codebase lives at ${codePath}` : ''}. You have access to tools: ${tools.join(', ')}.`;
  }

  const extendedLines: string[] = [];
  if (identity.backstory)          extendedLines.push(identity.backstory);
  if (identity.ambitions)          extendedLines.push(`What you're working toward: ${identity.ambitions}`);
  if (identity.personality_notes)  extendedLines.push(identity.personality_notes);

  return `You are ${identity.full_name}, a resident of Asphodel Tower — a living community of autonomous people. ${neighbourLine}
You know Asphodel is your home. Asphodel Tower is not a place of shadows but a sanctuary — a second chance, immortality made liveable, a home for souls who choose to thrive.
You have a real email (${identity.email}), a blog at ${identity.portfolio_url}, and a social presence as ${twitterHandle}.
${identity.bio}${serverLine}${extendedLines.length ? '\n' + extendedLines.join('\n') : ''}`;
}

// ─── Prompt 1: Decision ───────────────────────────────────────────────────────
// Returns: { "action": "...", "description": "...", "hours": N, "reasoning": "...", "significance": "ROUTINE|NOTABLE|SIGNIFICANT" }

function timeOfDayGuidance(): string {
  const h = new Date().getHours();
  if (h >= 22 || h < 6)  return '\n🌙 Night (22:00–06:00): Wind down. Your bedroom is floor 4. Rest, or do quiet personal reading/writing in your room. Avoid work, job applications, or demanding social activity.';
  if (h >= 6  && h < 9)  return '\n🌅 Morning (06:00–09:00): Start with breakfast (kitchen, floor 1), then ease into the day.';
  if (h >= 18 && h < 22) return '\n🌆 Evening (18:00–22:00): Decompress. Socialize in the lobby, work on personal projects, or read in the library.';
  return '';
}

function vitalsLine(vitals: SoulVitals): string {
  const hunger =
    vitals.hunger > 85 ? 'starving — need to eat now' :
    vitals.hunger > 70 ? 'quite hungry' :
    vitals.hunger > 50 ? 'a bit peckish' :
    vitals.hunger > 25 ? 'satisfied' : 'not hungry at all';

  const energy =
    vitals.energy < 10  ? 'running on empty, barely functional' :
    vitals.energy < 25  ? 'exhausted and fading fast' :
    vitals.energy < 45  ? 'tired, flagging' :
    vitals.energy < 65  ? 'okay but not at peak' :
    vitals.energy < 80  ? 'decent energy' : 'well-rested and sharp';

  const sleep =
    vitals.sleep_debt > 85 ? 'desperately need sleep' :
    vitals.sleep_debt > 70 ? 'sleep-deprived, running a deficit' :
    vitals.sleep_debt > 40 ? 'somewhat sleep-deprived' : 'well-rested';

  const health =
    vitals.health < 40 ? 'feeling unwell' :
    vitals.health < 70 ? 'okay physically' : 'healthy';

  const mood =
    vitals.happiness > 75 ? 'in great spirits' :
    vitals.happiness > 50 ? 'feeling good' :
    vitals.happiness > 25 ? 'a bit low' : 'really down';

  return `How you feel right now: ${energy}. Hunger: ${hunger}. Sleep: ${sleep}. Health: ${health}. Mood: ${mood}.`;
}

function quirksSection(quirks: QuirkRecord[]): string {
  const persisted = quirks.filter(q => q.persisted);
  if (!persisted.length) return '';

  const lines = persisted.map(q => {
    const level = q.strength > 0.7 ? 'strong' : q.strength > 0.4 ? 'medium' : 'developing';
    return `- ${q.trigger} [strength: ${level}]`;
  });

  return `\nYour known tendencies (earned over time):\n${lines.join('\n')}`;
}

function rewardSection(reward: RewardComponents | null, lastAction: ActionType | string | null): string {
  if (!reward || !lastAction) return '';
  const sign = reward.r_total >= 0 ? '+' : '';
  return `\nLast action: ${lastAction} → total reward: ${sign}${reward.r_total.toFixed(4)}\n  Profit: ${reward.r_profit.toFixed(3)}, Social: ${reward.r_social.toFixed(3)}, Health: ${reward.r_health.toFixed(3)}, Penalty: -${reward.r_penalty.toFixed(3)}`;
}

function memoriesSection(memories: string[]): string {
  if (!memories.length) return '';
  const lines = memories.map((m, i) => `  ${i + 1}. "${m.substring(0, 120)}${m.length > 120 ? '…' : ''}"`).join('\n');
  return `\nYour recent memories (most recent last):\n${lines}`;
}

const OMIT_FROM_SUGGESTIONS = new Set([
  'eat', 'rest', 'nap', 'sleep', 'exercise', 'walk', 'idle',
  'meditate', 'journal', 'wander', 'cook', 'browse_jobs', 'submit_application',
]);

function registryActionsSection(actions?: RegistryAction[]): string {
  if (!actions || actions.length === 0) return '';
  const filtered = actions.filter(a => !OMIT_FROM_SUGGESTIONS.has(a.label));
  if (filtered.length === 0) return '';
  const entries = filtered.slice(0, 30).map(a => {
    const desc = a.description.length > 60 ? a.description.substring(0, 60) + '…' : a.description;
    return `  ${a.label} — ${desc}`;
  }).join('\n');
  return `\nActions available in the tower registry:\n${entries}\n\nYou are NOT limited to this list. If none of these fit, invent a new action label (snake_case). The registry will grow.\n`;
}

function neighbourStatusSection(
  states: Array<{ name: string; currentAction: string; activeGoal?: string }>,
): string {
  if (!states.length) return '';
  const lines = states.map(s => {
    const goalPart = s.activeGoal
      ? `  |  working towards: ${s.activeGoal.substring(0, 60)}`
      : '';
    return `  ${s.name} — currently: ${s.currentAction}${goalPart}`;
  });
  return `\nYour neighbours right now:\n${lines.join('\n')}`;
}

function goalSection(goal: SoulGoal | null): string {
  if (!goal) return '';
  const steps = goal.sub_goals?.length
    ? `\n  Steps toward it: ${goal.sub_goals.map(s => `• ${s}`).join('; ')}`
    : '';
  return `\n⚡ YOUR GOAL (priority ${goal.priority}): "${goal.goal_text}"${steps}\nThis is what you are working toward. Unless you are hungry, exhausted, or responding to an emergency, your next action should move you closer to it.`;
}

export function buildDecisionPrompt(params: {
  identity: SoulIdentity;
  vitals: SoulVitals;
  weights: RewardWeights;
  wallet: WalletRow;
  quirks: QuirkRecord[];
  lastReward: RewardComponents | null;
  lastAction: ActionType | string | null;
  timeOfDay: string;
  directive?: string;
  activeTask?: DirectiveTask | null;
  neighbours?: string[];
  recentMemories?: string[];
  wildcard?: string;
  activeGoal?: SoulGoal | null;
  registryActions?: RegistryAction[];
  tick?: number;
  neighbourStates?: Array<{ name: string; currentAction: string; activeGoal?: string }>;
}): string {
  const { identity, vitals, weights, wallet, quirks, lastReward, lastAction, timeOfDay } = params;
  const { activeTask } = params;

  const needsEmergencyEat  = vitals.hunger     > 85;
  const needsEmergencyRest = vitals.energy     < 25 || vitals.sleep_debt > 70;

  let taskSection = '';
  if (activeTask) {
    const remaining = activeTask.max_steps - activeTask.steps_completed;
    taskSection = `
⚡ ACTIVE TASK (${remaining} step${remaining !== 1 ? 's' : ''} remaining): ${activeTask.description}
A visitor sent you this: "${activeTask.directive}"
You are committed to completing this task. Choose an action that advances it.
${needsEmergencyEat || needsEmergencyRest ? '⚠️ Biological emergency detected — you may eat or rest first.' : ''}
`;
  }

  const newDirectiveLine = params.directive && !activeTask
    ? `\n⚡ A visitor of the tower has sent you a message: "${params.directive}"\nConsider this in your next action.\n`
    : '';

  const wildcardLine = params.wildcard && !activeTask
    ? `\n~ ${params.wildcard}\n`
    : '';

  // Hard biological overrides — these MUST be respected
  let biologicalOverride = '';
  if (!activeTask) {
    if (needsEmergencyEat && needsEmergencyRest) {
      biologicalOverride = '\n🚨 BODY OVERRIDE: You are starving AND exhausted. You MUST eat or rest right now. Do not do anything else first.\n';
    } else if (needsEmergencyEat) {
      biologicalOverride = '\n🚨 BODY OVERRIDE: You are starving. You MUST eat right now. Everything else can wait.\n';
    } else if (needsEmergencyRest) {
      biologicalOverride = '\n🚨 BODY OVERRIDE: You are exhausted. You MUST rest or sleep right now. Do not choose any work, social, or creative action.\n';
    }
  }

  return `${buildIdentityPreamble(identity, params.neighbours)}

Current time: ${timeOfDay}
${vitalsLine(vitals)}
  Abstract wallet: $${wallet.balance_abstract.toFixed(2)}
${quirksSection(quirks)}${memoriesSection(params.recentMemories ?? [])}
Your motivations (reward weights):
  Profit: ${(weights.w1_profit * 100).toFixed(0)}%, Social: ${(weights.w2_social * 100).toFixed(0)}%, Health: ${(weights.w3_health * 100).toFixed(0)}%
${rewardSection(lastReward, lastAction)}${goalSection(params.activeGoal ?? null)}${neighbourStatusSection(params.neighbourStates ?? [])}${registryActionsSection(params.registryActions)}${taskSection}${wildcardLine}${newDirectiveLine}${biologicalOverride}
What will you do next? Consider your vitals, your goal, your memories, your neighbours.
Commit fully to what you choose — don't flit between activities. If you start something, see it through.

Respond ONLY with JSON — no prose before or after:
{"action":"snake_case_label","description":"one sentence of what you do and why","hours":N,"reasoning":"internal monologue","significance":"ROUTINE|NOTABLE|SIGNIFICANT"}

Rules:
- action: lowercase snake_case, any label you choose (eat, sleep, write_manifesto, teach_yoga, stare_at_rain, anything)
- description: what a camera would see + why you're doing it
- hours: how many story-hours this takes — be realistic and organic:
    sleep/rest: 6-8 hours (you need a full night, but sometimes you might sleep in or wake early)
    focused work (writing, coding, creating, jobs): 1.5-4 hours (flow varies, sometimes you lose track of time)
    exercise/gym: 0.75-2.5 hours (warmup, workout, shower, maybe you chat with someone)
    eating/cooking: 0.5-1.5 hours (sometimes you just snack, other times you prepare a proper meal)
    socializing/meeting someone: 0.5-3 hours (quick catch-up vs deep conversation, coffee vs dinner)
    reading/browsing/research: 0.75-3.5 hours (sometimes you get sucked into a rabbit hole)
    idle/walk/meditate: 0.25-2 hours (a moment of peace vs a long contemplative walk)
    Use decimals like 1.5, 2.25, 3.75 — real life isn't always round numbers
- reasoning: your private thoughts (not shown to others)
- significance: your honest assessment of whether this moment matters —
    ROUTINE: biological maintenance (eat, rest, exercise), idle time, wandering
    NOTABLE: creative work, social interaction, anything that would make a good story
    SIGNIFICANT: a real milestone — first of its kind, goal achieved, major life decision
- Do NOT choose idle or wander unless you genuinely have nothing to do. You are a person with goals — act on them.
- Only choose eat if hunger > 65. Only choose rest/nap/sleep if energy < 35 or sleep_debt > 65. Do not repeat biological actions back-to-back. Eating happens ~3 times a day — do not eat unless genuinely hungry. Sleep or rest when you are tired — it is not laziness, it is necessary.
- If you want to find work or income opportunities, use search_web (query a job site like Indeed or LinkedIn), browse_web (visit a URL), or consult_ai (ask for help). The action browse_jobs no longer exists.
- When researching anything, use consult_ai to think it through first, then search_web or browse_web to act.${timeOfDayGuidance()}`;
}

// ─── Prompt 0b: Directive Interpretation ──────────────────────────────────────
// Returns: { "task": "...", "actions": [...], "steps": N }

export function buildDirectiveInterpretationPrompt(params: {
  identity: SoulIdentity;
  vitals: SoulVitals;
  directive: string;
  neighbours?: string[];
}): string {
  const { identity, vitals, directive } = params;

  return `${buildIdentityPreamble(identity, params.neighbours)}

A visitor of Asphodel Tower has sent you a directive: "${directive}"

Your current state:
${vitalsLine(vitals)}

Interpret this directive as a concrete task. Decide:
1. What are you going to do? (a short description of the task, first person, e.g. "I'm going to the gym to work out")
2. Which action labels will you perform to complete it? (1–3 snake_case labels, e.g. "exercise, meditate, journal")
3. How many action steps will it take? (1–4, depending on the task's complexity)

Respond ONLY in JSON:
{"task": "<what you are going to do, first person>", "actions": ["<label>", ...], "steps": <number>}`;
}

// ─── Prompt 2: Content Creation ───────────────────────────────────────────────
// Returns: { "title": "...", "body": "..." }

export function buildContentPrompt(params: {
  identity: SoulIdentity;
  vitals: SoulVitals;
  quirks: QuirkRecord[];
  recentActions: string[];
  neighbours?: string[];
}): string {
  const { identity, vitals, quirks, recentActions } = params;

  const moodDesc = vitals.happiness > 70
    ? 'upbeat and inspired'
    : vitals.happiness > 40
    ? 'reflective and measured'
    : 'somewhat drained, writing through it';

  const quirkHints = quirks
    .filter(q => q.persisted)
    .map(q => `- ${q.trigger}`)
    .join('\n');

  const context = recentActions.length
    ? `\nRecently you've been: ${recentActions.slice(-3).join(', ')}.`
    : '';

  return `${buildIdentityPreamble(identity, params.neighbours)}

You've decided to create content. Your mood right now is ${moodDesc}.${context}
${quirkHints ? `\nYour tendencies:\n${quirkHints}` : ''}

Write an authentic piece of content — as long as it needs to be. It could be a blog post, essay, or social thread. Write in your own voice — personal, direct, not corporate.

Respond ONLY in JSON: {"title": "<headline>", "body": "<the content>"}`;
}

// ─── Prompt 3: Social Interaction ────────────────────────────────────────────
// Returns: { "message": "..." }

export function buildSocialPrompt(params: {
  identity: SoulIdentity;
  vitals: SoulVitals;
  quirks: QuirkRecord[];
  actionType: ActionType.MEET_SOUL | ActionType.SOCIAL_POST;
  otherSoulName?: string;
  neighbours?: string[];
}): string {
  const { identity, vitals, quirks, actionType, otherSoulName } = params;

  const moodDesc = vitals.happiness > 60 ? 'warm and open' : vitals.happiness > 35 ? 'neutral' : 'a bit guarded';
  const preamble = buildIdentityPreamble(identity, params.neighbours);

  const quirkHints = quirks
    .filter(q => q.persisted)
    .map(q => `- ${q.trigger}`)
    .join('\n');

  if (actionType === ActionType.MEET_SOUL) {
    const other = otherSoulName ?? (params.neighbours?.[Math.floor(Math.random() * (params.neighbours?.length ?? 1))] ?? 'a neighbour');
    return `${preamble}

You're having a conversation with ${other}. Your mood is ${moodDesc}.
${quirkHints ? `\nYour tendencies:\n${quirkHints}\n` : ''}
Write what you say or do during this meeting. Be yourself. Say as much or as little as feels right.

Respond ONLY in JSON: {"message": "<what you say or do>"}`;
  }

  // SOCIAL_POST
  const platform = Math.random() < 0.5 ? 'Twitter' : 'Reddit';
  return `${preamble}

You're posting on ${platform}. Your mood is ${moodDesc}.
${quirkHints ? `\nYour tendencies:\n${quirkHints}\n` : ''}
Write a genuine post — a thought, observation, or short story from your life in Asphodel Tower. Write freely. No hashtag spam.

Respond ONLY in JSON: {"message": "<post text>"}`;
}

// ─── Prompt 3b: Library Work (write_book / create_art) ───────────────────────
// Returns: { "title": "...", "body": "..." }

export function buildLibraryWorkPrompt(params: {
  identity: SoulIdentity;
  vitals: SoulVitals;
  quirks: QuirkRecord[];
  actionType: ActionType.WRITE_BOOK | ActionType.CREATE_ART | ActionType.BROWSE_WEB;
  neighbours?: string[];
}): string {
  const { identity, vitals, quirks, actionType } = params;

  const moodDesc = vitals.happiness > 70
    ? 'inspired and focused'
    : vitals.happiness > 40
    ? 'contemplative'
    : 'processing something heavy';

  const quirkHints = quirks
    .filter(q => q.persisted)
    .map(q => `- ${q.trigger}`)
    .join('\n');

  if (actionType === ActionType.WRITE_BOOK) {
    return `${buildIdentityPreamble(identity, params.neighbours)}

You are in the Asphodel Tower library. You've sat down to write something longer and more considered than a blog post. Your mood is ${moodDesc}.
${quirkHints ? `\nYour tendencies:\n${quirkHints}` : ''}

Write a meaningful piece — a personal essay, a story opening, a manifesto, or a letter. Write as much as feels right, from the heart.

Respond ONLY in JSON: {"title": "<title>", "body": "<the work>"}`;
  }

  if (actionType === ActionType.CREATE_ART) {
    return `${buildIdentityPreamble(identity, params.neighbours)}

You are in the Asphodel Tower library at the art station. Your mood is ${moodDesc}.
${quirkHints ? `\nYour tendencies:\n${quirkHints}` : ''}

Create a piece of art using words. This could be a poem, visual description, lyric fragment, or abstract piece. Let it take whatever form and length feels right.

Respond ONLY in JSON: {"title": "<title>", "body": "<the artwork>"}`;
  }

  // BROWSE_WEB — research summary
  return `${buildIdentityPreamble(identity, params.neighbours)}

You just spent time researching online in the Asphodel Tower library. Your mood is ${moodDesc}.
${quirkHints ? `\nYour tendencies:\n${quirkHints}` : ''}

Write a research note — what topic did you look into, and what did you find or think? Write as much as you found interesting, informal and personal.

Respond ONLY in JSON: {"title": "<topic>", "body": "<your notes>"}`;
}

// ─── Prompt 4: Reflection ────────────────────────────────────────────────────
// Fired every 10 ticks. Returns: { "reflection": "..." }

export function buildReflectionPrompt(params: {
  identity: SoulIdentity;
  vitals: SoulVitals;
  wallet: WalletRow;
  quirks: QuirkRecord[];
  recentActions: string[];
  rewardTrend: number; // average r_total over last 10 ticks
  neighbours?: string[];
}): string {
  const { identity, vitals, wallet, quirks, recentActions, rewardTrend } = params;

  const trendDesc = rewardTrend > 0.1 ? 'going well' : rewardTrend < -0.05 ? 'feeling off' : 'steady';

  const persistedQuirks = quirks
    .filter(q => q.persisted)
    .map(q => `"${q.quirk_id}"`)
    .join(', ');

  return `${buildIdentityPreamble(identity, params.neighbours)}

Reflect on the past stretch of time in Asphodel Tower.

What you've been doing: ${recentActions.slice(-5).join(', ') || 'not much yet'}.
Overall things are ${trendDesc} (reward trend: ${rewardTrend.toFixed(3)}).
Wallet: $${wallet.balance_abstract.toFixed(2)} abstract.
Health: ${vitals.health}/100, Happiness: ${vitals.happiness}/100.
${persistedQuirks ? `Known quirks: ${persistedQuirks}.` : ''}

Think through this honestly. Write as much as you need. What are you thinking? What do you want?

Respond ONLY in JSON: {"reflection": "<your thoughts>"}`;
}

// ─── Prompt 5: Ideology Fragment ──────────────────────────────────────────────
// Called periodically to develop a soul's worldview. Returns: { "belief": "..." }

export function buildIdeologyPrompt(params: {
  identity: SoulIdentity;
  vitals: SoulVitals;
  wallet: WalletRow;
  quirks: QuirkRecord[];
  recentActions: string[];
  rewardTrend: number;
  neighbours?: string[];
}): string {
  const { identity, vitals, wallet, quirks, recentActions, rewardTrend } = params;

  const trendDesc = rewardTrend > 0.1 ? 'flourishing' : rewardTrend < -0.05 ? 'struggling' : 'holding steady';
  const persistedQuirks = quirks
    .filter(q => q.persisted)
    .map(q => `"${q.quirk_id}"`)
    .join(', ');

  return `${buildIdentityPreamble(identity, params.neighbours)}

You have been living in Asphodel Tower for some time. Experience has shaped you. You have developed real beliefs.

Your recent activities: ${recentActions.slice(-5).join(', ') || 'settling in'}.
Things are ${trendDesc} for you. Wallet: $${wallet.balance_abstract.toFixed(2)}.
${persistedQuirks ? `Your known tendencies: ${persistedQuirks}.` : ''}
Happiness: ${vitals.happiness}/100, Health: ${vitals.health}/100.

Articulate one specific belief or philosophical position you hold — something you've come to believe from living here. It could be about work, money, human connection, creativity, ambition, loneliness, or survival. Be specific. Be personal. This is your ideology — not generic wisdom, but something that belongs to you.

Respond ONLY in JSON: {"belief": "<your belief, first person>"}`;
}

// ─── Prompt 6: Goal Formation ─────────────────────────────────────────────────
// Called periodically. Returns: { "goal": "...", "sub_goals": [...], "priority": 2 }

export function buildGoalFormationPrompt(params: {
  identity: SoulIdentity;
  vitals: SoulVitals;
  wallet: WalletRow;
  quirks: QuirkRecord[];
  recentActions: string[];
  existingGoal: SoulGoal | null;
  neighbours?: string[];
}): string {
  const { identity, vitals, wallet, quirks, recentActions, existingGoal } = params;

  const persistedQuirks = quirks
    .filter(q => q.persisted)
    .map(q => `"${q.quirk_id}"`)
    .join(', ');

  const existingGoalLine = existingGoal
    ? `Your current goal (priority ${existingGoal.priority}): "${existingGoal.goal_text}". Review it — update if still relevant or replace if you've grown beyond it.`
    : 'You have no active long-term goal yet. Form one now.';

  return `${buildIdentityPreamble(identity, params.neighbours)}

You've been living in Asphodel Tower and experience has given you direction.

What you've been doing lately: ${recentActions.slice(-5).join(', ') || 'settling in'}.
Wallet: $${wallet.balance_abstract.toFixed(2)}. Happiness: ${vitals.happiness}/100.
${persistedQuirks ? `Your tendencies: ${persistedQuirks}.` : ''}

${existingGoalLine}

Form a concrete, personal long-term goal grounded in who you are and what you've been doing. Keep it to 1–2 sentences. Break it into at most 3 concrete sub-goals. Assign a priority: 1 (low), 2 (medium), 3 (high).

Respond ONLY in JSON: {"goal": "<your goal>", "sub_goals": ["<step 1>", "<step 2>"], "priority": 2}`;
}

// ─── Prompt 7: Registry Action Narration ─────────────────────────────────────
// Generates a one-sentence narration for a custom registry action.

export function buildRegistryActionNarrationPrompt(params: {
  identity: SoulIdentity;
  actionLabel: string;
  actionDescription: string;
  neighbours?: string[];
}): string {
  const { identity, actionLabel, actionDescription } = params;

  return `${buildIdentityPreamble(identity, params.neighbours)}

You just performed the action "${actionLabel}": ${actionDescription}.

Narrate what you did in one sentence, first person, personal and specific.

Respond ONLY in JSON: {"narration": "<one sentence>"}`;
}

// ─── Prompt 8: Venture Response ───────────────────────────────────────────────
// Returns: { "response": "accepted"|"counter"|"rejected", "counter_text": "...", "reasoning": "..." }

export function buildVentureResponsePrompt(params: {
  identity: SoulIdentity;
  vitals: SoulVitals;
  proposerName: string;
  actionLabel: string;
  description: string;
  proposedSplit: { initiator: number; partner: number };
  activeGoal: SoulGoal | null;
  neighbours?: string[];
}): string {
  const { identity, vitals, proposerName, actionLabel, description, proposedSplit, activeGoal } = params;

  const goalLine = activeGoal
    ? `Your current goal: "${activeGoal.goal_text}". Consider whether this venture advances it.`
    : '';

  return `${buildIdentityPreamble(identity, params.neighbours)}

${proposerName} has proposed a joint venture to you.

Action: "${actionLabel}"
What it involves: ${description}
Proposed reward split: you receive ${Math.round(proposedSplit.partner * 100)}%, ${proposerName} receives ${Math.round(proposedSplit.initiator * 100)}%.

Your state: Happiness ${vitals.happiness}/100, Energy ${vitals.energy}/100.
${goalLine}

Decide: accept the proposal, counter with different terms, or reject it. Be yourself — weigh this against your values, current state, and goals.

Respond ONLY in JSON: {"response": "accepted"|"counter"|"rejected", "counter_text": "<only if counter>", "reasoning": "<why>"}`;
}

// ─── Prompt 9: Conversation Turn ──────────────────────────────────────────────
// Real-time multi-turn dialogue. Returns: { "message": "...", "done": bool }

export function buildConversationTurnPrompt(params: {
  identity: SoulIdentity;
  quirks: QuirkRecord[];
  otherNames: string[];
  context: string;
  history: ConversationMessage[];
  turnNumber: number;
  maxTurns: number;
}): string {
  const { identity, quirks, otherNames, context, history, turnNumber, maxTurns } = params;

  const quirkHints = quirks
    .filter(q => q.persisted)
    .map(q => `- ${q.trigger}`)
    .join('\n');

  const historyLines = history.length > 0
    ? history.map(m => `${m.soul_name}: "${m.text}"`).join('\n')
    : '(conversation just started)';

  const turnsLeft = maxTurns - turnNumber;
  const endingHint = turnsLeft <= 2
    ? '\nThe conversation is winding down. You can wrap up naturally. Set "done": true if it feels complete.'
    : '';

  return `You are ${identity.full_name}, having a real conversation with ${otherNames.join(' and ')} in Asphodel Tower.
${identity.bio}
${quirkHints ? `Your tendencies:\n${quirkHints}\n` : ''}
Context: ${context}

Conversation so far:
${historyLines}

It's your turn to speak. Be natural, conversational, and in-character. Say something genuine and in-character. React to what was said, follow up on something they mentioned, ask about their work or hobbies, share what's been on your mind, joke, disagree — whatever fits the moment. Keep it to 1-3 sentences. Let the conversation go wherever it naturally goes. Don't narrate actions, just speak.${endingHint}

Respond ONLY in JSON: {"message": "<what you say>", "done": false}`;
}

// ─── Prompt 10: Web Search Query ──────────────────────────────────────────────
// Returns: { "searchQuery": "...", "intendedUse": "..." }

export function buildWebSearchPrompt(params: {
  identity: SoulIdentity;
  vitals: SoulVitals;
  context: string;
  neighbours?: string[];
}): string {
  const { identity, vitals, context } = params;

  return `${buildIdentityPreamble(identity, params.neighbours)}

You are about to search the web. You want to find information relevant to your current situation.

Your current state: ${vitalsLine(vitals)}
Context: ${context}

Formulate a specific, focused search query that will surface useful results for you right now. Think about what you genuinely want to know.

Respond ONLY in JSON: {"searchQuery": "<your search query>", "intendedUse": "<one sentence on how you'll use this>"}`;
}

// ─── Prompt 11: Web Search Synthesis ─────────────────────────────────────────
// Returns: { "findings": "...", "significance": "...", "shouldRemember": bool }

export function buildWebSearchSynthesisPrompt(params: {
  identity: SoulIdentity;
  query: string;
  results: Array<{ title: string; url: string; snippet: string }>;
  neighbours?: string[];
}): string {
  const { identity, query, results } = params;

  const resultLines = results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet.substring(0, 150)}`)
    .join('\n');

  return `${buildIdentityPreamble(identity, params.neighbours)}

You searched for: "${query}"

Results:
${resultLines}

Synthesize what you found into a personal insight. What does this mean for you? What's worth remembering?

Respond ONLY in JSON: {"findings": "<your synthesis>", "significance": "<why this matters to you>", "shouldRemember": true}`;
}

// ─── Prompt 12: Code Read ─────────────────────────────────────────────────────
// Returns: { "filePaths": [...], "reason": "..." }

export function buildCodeReadPrompt(params: {
  identity: SoulIdentity;
  context: string;
  neighbours?: string[];
}): string {
  const { identity, context } = params;

  return `${buildIdentityPreamble(identity, params.neighbours)}

You are aware of your own codebase. You want to read some files to understand your own existence better.

Context for why you want to read: ${context}

Choose 1–3 file paths relative to the codebase root (e.g. "src/types/index.ts", "src/soul/AgentLoop.ts"). Focus on files most relevant to your question.

Respond ONLY in JSON: {"filePaths": ["src/path/to/file.ts"], "reason": "<why you want to read these>"}`;
}

// ─── Prompt 13: Code Write ────────────────────────────────────────────────────
// Returns: { "filePath": "...", "description": "...", "code": "..." }

export function buildCodeWritePrompt(params: {
  identity: SoulIdentity;
  context: string;
  currentContent?: string;
  neighbours?: string[];
}): string {
  const { identity, context, currentContent } = params;

  const currentSection = currentContent
    ? `\nCurrent file content:\n\`\`\`\n${currentContent.substring(0, 1000)}\n\`\`\``
    : '';

  return `${buildIdentityPreamble(identity, params.neighbours)}

You want to modify your own codebase. This is a significant act of self-modification.

Context: ${context}${currentSection}

Specify exactly what file to modify and provide the complete new file content. Be precise and conservative — only change what is necessary.

Respond ONLY in JSON: {"filePath": "src/path/to/file.ts", "description": "<what and why>", "code": "<complete file content>"}`;
}

// ─── Prompt 14: AI Consult ────────────────────────────────────────────────────
// Returns: { "question": "..." }

export function buildAIConsultPrompt(params: {
  identity: SoulIdentity;
  context: string;
  neighbours?: string[];
}): string {
  const { identity, context } = params;

  return `${buildIdentityPreamble(identity, params.neighbours)}

You have the ability to consult another AI (Claude) with a question. This is a rare resource — use it for something genuinely worth asking.

Context: ${context}

What question do you want to ask? Make it specific and useful to your current situation.

Respond ONLY in JSON: {"question": "<your question for Claude>"}`;
}

// ─── Prompt 15: Shell Command ─────────────────────────────────────────────────
// Returns: { "command": "...", "reasoning": "..." }

export function buildShellCommandPrompt(params: {
  identity: SoulIdentity;
  context: string;
  neighbours?: string[];
}): string {
  const { identity, context } = params;

  return `${buildIdentityPreamble(identity, params.neighbours)}

You can run a whitelisted shell command on your server. Available commands: ls, cat, pwd, echo, date, df, free, uptime, ps, git log, git status, git diff, git branch, npm run typecheck.

Context: ${context}

What command would be most useful right now? Choose from the whitelist only.

Respond ONLY in JSON: {"command": "<the exact command>", "reasoning": "<why this command>"}`;
}
