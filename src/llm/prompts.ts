import { ActionType } from '../types';
import type { SoulVitals, SoulIdentity, RewardWeights, QuirkRecord, RewardComponents, WalletRow, DirectiveTask } from '../types';

// ─── Sovereign Identity Preamble ──────────────────────────────────────────────

function buildIdentityPreamble(identity: SoulIdentity, neighbours?: string[]): string {
  const twitterHandle = identity.username_pool['twitter']
    ? `@${identity.username_pool['twitter']} on Twitter`
    : 'social media';

  const neighbourLine = neighbours && neighbours.length > 0
    ? `You live in the Tower with ${neighbours.length} neighbour${neighbours.length !== 1 ? 's' : ''}: ${neighbours.join(', ')}.`
    : 'You live in the Tower with a small community of souls.';

  return `You are ${identity.full_name}, a resident of Asphodel Tower — a living community of autonomous people. ${neighbourLine}
You know Asphodel is your home. You have a real email (${identity.email}), a blog at ${identity.portfolio_url}, and a social presence as ${twitterHandle}.
${identity.bio}`;
}

// ─── Prompt 1: Decision ───────────────────────────────────────────────────────
// Returns: { "action": "<ActionType>", "reasoning": "<1 sentence>" }

const ACTION_DESCRIPTIONS: Record<ActionType, string> = {
  [ActionType.BROWSE_JOBS]:    'Search job boards and task platforms for gig work',
  [ActionType.SUBMIT_APP]:     'Apply to a gig or task you found earlier',
  [ActionType.CREATE_CONTENT]: 'Write something — a blog post, article, or social thread',
  [ActionType.MEET_SOUL]:      'Spend time talking with another soul in the tower',
  [ActionType.SOCIAL_POST]:    'Post something on Twitter or Reddit as yourself',
  [ActionType.REST]:           'Sleep or rest to recover energy',
  [ActionType.EAT]:            'Have a meal to reduce hunger',
  [ActionType.EXERCISE]:       'Work out to improve health',
  [ActionType.IDLE]:           'Do nothing for a while',
  // Library actions
  [ActionType.READ_BOOK]:      'Go to the library and read — expand your mind, find peace',
  [ActionType.WRITE_BOOK]:     'Write a longer creative or intellectual work in the library',
  [ActionType.CREATE_ART]:     'Make art in the library — visual, textual, or abstract',
  [ActionType.BROWSE_WEB]:     'Research a topic online in the library — learn something new',
};

function vitalsLine(vitals: SoulVitals): string {
  return [
    `  Hunger: ${vitals.hunger}/100${vitals.hunger > 70 ? ' ⚠️' : ''}`,
    `  Energy: ${vitals.energy}/100${vitals.energy < 25 ? ' ⚠️' : ''}`,
    `  Health: ${vitals.health}/100`,
    `  Happiness: ${vitals.happiness}/100`,
    `  Sleep debt: ${vitals.sleep_debt}/100${vitals.sleep_debt > 70 ? ' ⚠️' : ''}`,
  ].join('\n');
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

function rewardSection(reward: RewardComponents | null, lastAction: ActionType | null): string {
  if (!reward || !lastAction) return '';
  const sign = reward.r_total >= 0 ? '+' : '';
  return `\nLast action: ${lastAction} → total reward: ${sign}${reward.r_total.toFixed(4)}\n  Profit: ${reward.r_profit.toFixed(3)}, Social: ${reward.r_social.toFixed(3)}, Health: ${reward.r_health.toFixed(3)}, Penalty: -${reward.r_penalty.toFixed(3)}`;
}

export function buildDecisionPrompt(params: {
  identity: SoulIdentity;
  vitals: SoulVitals;
  weights: RewardWeights;
  wallet: WalletRow;
  quirks: QuirkRecord[];
  lastReward: RewardComponents | null;
  lastAction: ActionType | null;
  timeOfDay: string;
  directive?: string;
  activeTask?: DirectiveTask | null;
  neighbours?: string[];
}): string {
  const { identity, vitals, weights, wallet, quirks, lastReward, lastAction, timeOfDay } = params;
  const { activeTask } = params;

  // When a task is active, restrict choices to task-relevant actions + critical biological needs
  const EMERGENCY_ACTIONS = new Set<ActionType>([ActionType.EAT, ActionType.REST]);
  const needsEmergencyEat  = vitals.hunger     > 85;
  const needsEmergencyRest = vitals.energy     < 10 || vitals.sleep_debt > 85;

  let actionList: string;
  let taskSection = '';

  if (activeTask) {
    const remaining = activeTask.max_steps - activeTask.steps_completed;
    const allowed   = new Set<ActionType>(activeTask.relevant_actions);
    if (needsEmergencyEat)  allowed.add(ActionType.EAT);
    if (needsEmergencyRest) allowed.add(ActionType.REST);

    actionList = Object.entries(ACTION_DESCRIPTIONS)
      .filter(([key]) => allowed.has(key as ActionType))
      .map(([key, desc]) => `  - ${key}: ${desc}`)
      .join('\n');

    taskSection = `
⚡ ACTIVE TASK (${remaining} step${remaining !== 1 ? 's' : ''} remaining): ${activeTask.description}
A visitor sent you this: "${activeTask.directive}"
You are committed to completing this task. Choose an action that advances it.
${needsEmergencyEat || needsEmergencyRest ? '⚠️ Biological emergency detected — you may eat or rest first.' : ''}
`;
  } else {
    actionList = Object.entries(ACTION_DESCRIPTIONS)
      .map(([key, desc]) => `  - ${key}: ${desc}`)
      .join('\n');
  }

  const newDirectiveLine = params.directive && !activeTask
    ? `\n⚡ A visitor of the tower has sent you a message: "${params.directive}"\nConsider this in your next action.\n`
    : '';

  return `${buildIdentityPreamble(identity, params.neighbours)}

Current time: ${timeOfDay}
${vitalsLine(vitals)}
  Abstract wallet: $${wallet.balance_abstract.toFixed(2)}
${quirksSection(quirks)}
Your motivations (reward weights):
  Profit: ${(weights.w1_profit * 100).toFixed(0)}%, Social: ${(weights.w2_social * 100).toFixed(0)}%, Health: ${(weights.w3_health * 100).toFixed(0)}%
${rewardSection(lastReward, lastAction)}${taskSection}${newDirectiveLine}
Available actions:
${actionList}

What will you do next?${activeTask ? ' You must work on your active task.' : ' Choose what fits your state, personality, and the time of day.\nOnly choose "rest" if sleep_debt > 65 or energy < 20 — otherwise stay active and productive.'}
Respond ONLY in JSON: {"action": "<action_name>", "reasoning": "<one sentence>"}`;
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

  const actionList = Object.entries(ACTION_DESCRIPTIONS)
    .map(([key, desc]) => `  ${key}: ${desc}`)
    .join('\n');

  return `${buildIdentityPreamble(identity, params.neighbours)}

A visitor of Asphodel Tower has sent you a directive: "${directive}"

Your current state:
${vitalsLine(vitals)}

Available actions you can take:
${actionList}

Interpret this directive as a concrete task. Decide:
1. What are you going to do? (a short description of the task, first person, e.g. "I'm going to the gym to work out")
2. Which action types will you perform to complete it? (pick 1–3 from the list above)
3. How many action steps will it take? (1–4, depending on the task's complexity)

Respond ONLY in JSON:
{"task": "<what you are going to do, first person>", "actions": ["<action_name>", ...], "steps": <number>}`;
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

Write a short, authentic piece of content (2–4 paragraphs). It could be a blog post, essay, or social thread. Write in your own voice — personal, direct, not corporate.

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
Write what you say or do during this meeting — 1 to 3 sentences. Be yourself.

Respond ONLY in JSON: {"message": "<what you say or do>"}`;
  }

  // SOCIAL_POST
  const platform = Math.random() < 0.5 ? 'Twitter' : 'Reddit';
  return `${preamble}

You're posting on ${platform}. Your mood is ${moodDesc}.
${quirkHints ? `\nYour tendencies:\n${quirkHints}\n` : ''}
Write a genuine post — a thought, observation, or short story from your life in Asphodel Tower. 1–3 sentences. No hashtag spam.

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

Write a short but meaningful piece — a personal essay, a story opening, a manifesto, or a letter. 2–5 paragraphs. Write in your own voice, from the heart.

Respond ONLY in JSON: {"title": "<title>", "body": "<the work>"}`;
  }

  if (actionType === ActionType.CREATE_ART) {
    return `${buildIdentityPreamble(identity, params.neighbours)}

You are in the Asphodel Tower library at the art station. Your mood is ${moodDesc}.
${quirkHints ? `\nYour tendencies:\n${quirkHints}` : ''}

Create a piece of art using words. This could be a poem, visual description, lyric fragment, or abstract piece. Let it be strange, honest, or beautiful. 1–3 stanzas or sections.

Respond ONLY in JSON: {"title": "<title>", "body": "<the artwork>"}`;
  }

  // BROWSE_WEB — research summary
  return `${buildIdentityPreamble(identity, params.neighbours)}

You just spent time researching online in the Asphodel Tower library. Your mood is ${moodDesc}.
${quirkHints ? `\nYour tendencies:\n${quirkHints}` : ''}

Write a short research note — what topic did you look into, and what did you find or think? 1–2 paragraphs, informal and personal.

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

Write 1–2 sentences of honest internal reflection. What are you thinking? What do you want?

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

Respond ONLY in JSON: {"belief": "<your belief, 1-2 sentences, first person>"}`;
}
