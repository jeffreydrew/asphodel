import { COOLDOWNS, ActionType, Significance } from '../types';
import { Soul } from './Soul';
import { LLMDecider } from './LLMDecider';
import { HardcodedDecider } from './HardcodedDecider';
import { ActionExecutor, applyPassiveDrift } from './ActionExecutor';
import { scoreReward } from '../reward/RewardEngine';
import { QuirkTracker } from '../quirks/QuirkTracker';
import { WorldLog } from '../world/WorldLog';
import { classifyEvent } from '../world/EventClassifier';
import { pushSnapshot, worldEvents } from '../world/WorldState';
import { drain as drainDirectives } from '../world/DirectiveQueue';
import { updatePosition } from '../world/PositionTracker';
import { ollama } from '../llm/OllamaClient';
import {
  buildContentPrompt,
  buildSocialPrompt,
  buildReflectionPrompt,
  buildLibraryWorkPrompt,
  buildDirectiveInterpretationPrompt,
  buildIdeologyPrompt,
} from '../llm/prompts';
import type { DirectiveTask } from '../types';
import { getDb } from '../db/client';
import { integrationDispatcher } from '../integrations/IntegrationDispatcher';

const REFLECTION_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes real time
const IDEOLOGY_INTERVAL_MS   = 8 * 60 * 1000; // 8 minutes real time
const lastReflectionTime = new Map<string, number>();
const lastIdeologyTime   = new Map<string, number>();

const log = (soulName: string, msg: string) =>
  process.stdout.write(`[${new Date().toISOString()}] [${soulName}] ${msg}\n`);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── LLM availability cache ───────────────────────────────────────────────────

const LLM_RECHECK_INTERVAL = 5 * 60 * 1000;
let llmAvailable    = false;
let llmLastChecked  = 0;

async function checkLLM(): Promise<boolean> {
  const now = Date.now();
  if (now - llmLastChecked > LLM_RECHECK_INTERVAL) {
    llmAvailable   = await ollama.isAvailable();
    llmLastChecked = now;
  }
  return llmAvailable;
}

// ─── Singletons ───────────────────────────────────────────────────────────────

const llmDecider       = new LLMDecider();
const hardcodedDecider = new HardcodedDecider();
const executor         = new ActionExecutor();
const quirks           = new QuirkTracker();
const worldLog         = new WorldLog();

// ─── Main Loop ────────────────────────────────────────────────────────────────

export async function runAgentLoop(soul: Soul, slotIndex: number, neighbours: string[] = []): Promise<void> {
  const usingLLM = await checkLLM();
  log(soul.name, `Agent loop started. LLM: ${usingLLM ? 'Ollama ✓' : 'hardcoded fallback'} | slot #${slotIndex}`);

  while (soul.is_active) {
    try {
      await tick(soul, slotIndex, neighbours);
    } catch (err) {
      log(soul.name, `Error: ${String(err)}`);
      await sleep(5_000);
    }
  }

  log(soul.name, 'Loop stopped.');
}

async function tick(soul: Soul, slotIndex: number, neighbours: string[]): Promise<void> {
  // 1. Observe
  const { vitals: vitalsBefore, wallet, quirks: quirkList } = soul.observe();

  // Passive drift
  const driftedVitals = applyPassiveDrift(vitalsBefore);
  soul.updateVitals(driftedVitals);

  // 2. Drain visitor directives
  const directives  = drainDirectives(soul.id);
  const directive   = directives.at(-1)?.message; // most recent
  if (directive) {
    log(soul.name, `⚡ Visitor directive: "${directive}"`);
  }

  // 3. Interpret new directive into a task (overrides any existing task)
  const llmOnline = await checkLLM();
  if (directive && llmOnline) {
    const task = await interpretDirective(soul, driftedVitals, directive, neighbours);
    if (task) {
      soul.setActiveTask(task);
      log(soul.name, `⚡ Task set: ${task.description} [actions: ${task.relevant_actions.join(', ')}, steps: ${task.max_steps}]`);
    }
  }

  // 4. Decide
  const timeOfDay = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const action    = llmOnline
    ? await llmDecider.decide(
        soul.identity, driftedVitals, soul.reward_weights,
        wallet, quirkList, soul.last_reward, soul.last_action,
        timeOfDay, directive, neighbours, soul.active_task,
      )
    : { ...hardcodedDecider.decide(driftedVitals, soul.reward_weights, quirkList, soul.last_reward) };

  const taskNote      = soul.active_task ? ` [task: ${soul.active_task.description}]` : '';
  const reasoningNote = action.reasoning ? ` ("${action.reasoning}")` : '';
  log(soul.name, `Tick #${soul.tick + 1} — ${action.type}${reasoningNote}${taskNote}`);

  // 4. Generate LLM text for creative/social actions
  let generatedText: string | undefined;
  if (llmOnline) {
    if (action.type === ActionType.CREATE_CONTENT) {
      generatedText = await generateContent(soul, quirkList, neighbours);
    } else if (action.type === ActionType.SOCIAL_POST || action.type === ActionType.MEET_SOUL) {
      generatedText = await generateSocialText(soul, quirkList, action.type, neighbours);
    } else if (
      action.type === ActionType.WRITE_BOOK ||
      action.type === ActionType.CREATE_ART ||
      action.type === ActionType.BROWSE_WEB
    ) {
      generatedText = await generateLibraryWork(soul, quirkList, action.type, neighbours);
    }
  }

  // 5. Execute (browser → simulation fallback)
  const result = await executor.run(action, driftedVitals, soul.identity, soul.id);

  if (generatedText) {
    result.description = generatedText.substring(0, 200);
    result.metadata['generated_text'] = generatedText;
  }

  // 5b. Advance or complete active task
  if (soul.active_task) {
    const taskDone = soul.advanceTask(action.type);
    if (taskDone) {
      const completedTask = soul.active_task;
      soul.setActiveTask(null);
      log(soul.name, `✅ Task completed: "${completedTask.description}"`);
      worldLog.append({
        soul_id:     soul.id,
        significance: Significance.NOTABLE,
        action:      action.type,
        description: `${soul.name} completed directive task: "${completedTask.description}"`,
        metadata:    { directive: completedTask.directive },
        ts:          Date.now(),
      });
    } else if (soul.active_task.relevant_actions.includes(action.type)) {
      const remaining = soul.active_task.max_steps - soul.active_task.steps_completed;
      log(soul.name, `  Task progress: ${soul.active_task.steps_completed}/${soul.active_task.max_steps} steps (${remaining} remaining)`);
    }
  }

  // 6. Score reward
  const reward = scoreReward(soul.reward_weights, driftedVitals, result.vitals_after, result);

  // 7. Update vitals + wallet
  soul.updateVitals(result.vitals_after);
  if (result.profit_delta > 0) {
    soul.creditWallet(result.profit_delta, `${action.type}_abstract`);
  }

  // 8. Quirk tracking + reward record
  const quirkDelta = quirks.reinforce(soul.id, action.type, reward.r_total);
  soul.recordReward(reward, action.type, quirkDelta);

  // 9. Store generated content in soul_memory + library_works for library actions
  if (generatedText) {
    const isLibraryAction = (
      action.type === ActionType.WRITE_BOOK ||
      action.type === ActionType.CREATE_ART ||
      action.type === ActionType.BROWSE_WEB
    );
    const memType = action.type === ActionType.CREATE_CONTENT
      ? 'content'
      : isLibraryAction
      ? 'library_work'
      : 'social';
    saveSoulMemory(soul.id, memType, generatedText, { action: action.type });

    if (isLibraryAction) {
      const workType = action.type === ActionType.WRITE_BOOK
        ? 'writing'
        : action.type === ActionType.CREATE_ART
        ? 'art'
        : 'research';
      saveLibraryWork(soul.id, workType, generatedText, { action: action.type });
    }
  }

  // 10. Classify + log event
  const walletAfter  = soul.observe().wallet;
  const significance = classifyEvent({
    action:       action.type,
    result,
    wallet:       walletAfter,
    walletBefore: { balance_abstract: wallet.balance_abstract },
    rewardTotal:  reward.r_total,
  });

  worldLog.append({
    soul_id:     soul.id,
    significance,
    action:      action.type,
    description: `${soul.name}: ${result.description}`,
    metadata:    {
      reward:    reward.r_total,
      vitals:    result.vitals_after,
      reasoning: action.reasoning,
      ...result.metadata,
    },
    ts: Date.now(),
  });

  if (significance === Significance.SIGNIFICANT) {
    log(soul.name, `*** SIGNIFICANT: ${result.description}`);
  } else if (significance === Significance.NOTABLE) {
    log(soul.name, `  NOTABLE: ${result.description}`);
  }

  // 11. Fire integrations (Ghost, Twitter, Reddit, @asphodel_tower)
  await integrationDispatcher.dispatch(soul, action.type, significance, generatedText, result);

  // 12. Update 3D position
  updatePosition(soul.id, action.type, slotIndex);

  // 13. Periodic reflection + ideology development
  const nowMs   = Date.now();
  const lastRef = lastReflectionTime.get(soul.id) ?? 0;
  if (llmOnline && nowMs - lastRef >= REFLECTION_INTERVAL_MS) {
    lastReflectionTime.set(soul.id, nowMs);
    await runReflection(soul, quirkList, neighbours);
  }

  const lastIde = lastIdeologyTime.get(soul.id) ?? 0;
  if (llmOnline && nowMs - lastIde >= IDEOLOGY_INTERVAL_MS) {
    lastIdeologyTime.set(soul.id, nowMs);
    await runIdeology(soul, quirkList, neighbours);
  }

  // 14. Broadcast
  pushSnapshot(soul.snapshot());
  worldEvents.emit('update');

  // 15. Cooldown
  const cooldown = COOLDOWNS[action.type];
  log(soul.name, `sleeping ${cooldown / 1000}s…`);
  await sleep(cooldown);
}

// ─── LLM sub-tasks ────────────────────────────────────────────────────────────

async function interpretDirective(
  soul: Soul,
  vitals: ReturnType<Soul['observe']>['vitals'],
  directive: string,
  neighbours: string[],
): Promise<DirectiveTask | null> {
  const prompt = buildDirectiveInterpretationPrompt({
    identity:   soul.identity,
    vitals,
    directive,
    neighbours,
  });

  const raw = await ollama.chat([{ role: 'user', content: prompt }], { json: true, temperature: 0.6 });
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { task?: string; actions?: string[]; steps?: number };
    const validActions = Object.values(ActionType) as string[];
    const relevant = (parsed.actions ?? [])
      .map(a => a.trim().toLowerCase())
      .filter(a => validActions.includes(a)) as ActionType[];

    if (!parsed.task || !relevant.length) return null;

    return {
      directive,
      description:      parsed.task,
      relevant_actions: relevant,
      steps_completed:  0,
      max_steps:        Math.max(1, Math.min(4, parsed.steps ?? 1)),
      created_at:       Date.now(),
    };
  } catch {
    process.stderr.write(`[AgentLoop] interpretDirective parse failed: ${raw.substring(0, 120)}\n`);
    return null;
  }
}

async function generateContent(
  soul: Soul,
  quirkList: ReturnType<Soul['observe']>['quirks'],
  neighbours: string[],
): Promise<string | undefined> {
  const prompt = buildContentPrompt({
    identity:      soul.identity,
    vitals:        soul.vitals,
    quirks:        quirkList,
    recentActions: soul.recentActions(5),
    neighbours,
  });

  const raw = await ollama.chat([{ role: 'user', content: prompt }], { json: true, temperature: 0.85, long: true });
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as { title?: string; body?: string };
    if (parsed.title && parsed.body) return `${parsed.title}\n\n${parsed.body}`;
  } catch { /* fall through */ }

  return undefined;
}

async function generateSocialText(
  soul: Soul,
  quirkList: ReturnType<Soul['observe']>['quirks'],
  actionType: ActionType.SOCIAL_POST | ActionType.MEET_SOUL,
  neighbours: string[],
): Promise<string | undefined> {
  const meetPartner = actionType === ActionType.MEET_SOUL && neighbours.length > 0
    ? neighbours[Math.floor(Math.random() * neighbours.length)]
    : undefined;

  const prompt = buildSocialPrompt({
    identity:      soul.identity,
    vitals:        soul.vitals,
    quirks:        quirkList,
    actionType,
    otherSoulName: meetPartner,
    neighbours,
  });

  const raw = await ollama.chat([{ role: 'user', content: prompt }], { json: true, temperature: 0.8, long: true });
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as { message?: string };
    return parsed.message ?? undefined;
  } catch {
    return undefined;
  }
}

async function runReflection(
  soul: Soul,
  quirkList: ReturnType<Soul['observe']>['quirks'],
  neighbours: string[],
): Promise<void> {
  const { wallet } = soul.observe();
  const prompt = buildReflectionPrompt({
    identity:      soul.identity,
    vitals:        soul.vitals,
    wallet,
    quirks:        quirkList,
    recentActions: soul.recentActions(10),
    rewardTrend:   soul.recentRewardAvg(10),
    neighbours,
  });

  const raw = await ollama.chat([{ role: 'user', content: prompt }], { json: true, temperature: 0.9, long: true });
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as { reflection?: string };
    const reflection = parsed.reflection;
    if (!reflection) return;

    log(soul.name, `[reflection] ${reflection}`);
    saveSoulMemory(soul.id, 'reflection', reflection, { tick: soul.tick });

    worldLog.append({
      soul_id:      soul.id,
      significance: Significance.NOTABLE,
      action:       'reflection',
      description:  `${soul.name} reflects: "${reflection}"`,
      metadata:     { tick: soul.tick },
      ts:           Date.now(),
    });
  } catch { /* ignore */ }
}

async function runIdeology(
  soul: Soul,
  quirkList: ReturnType<Soul['observe']>['quirks'],
  neighbours: string[],
): Promise<void> {
  const { wallet } = soul.observe();
  const prompt = buildIdeologyPrompt({
    identity:      soul.identity,
    vitals:        soul.vitals,
    wallet,
    quirks:        quirkList,
    recentActions: soul.recentActions(10),
    rewardTrend:   soul.recentRewardAvg(10),
    neighbours,
  });

  const raw = await ollama.chat([{ role: 'user', content: prompt }], { json: true, temperature: 0.95, long: true });
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as { belief?: string };
    const belief = parsed.belief;
    if (!belief) return;

    log(soul.name, `[ideology] ${belief}`);
    saveSoulMemory(soul.id, 'ideology', belief, { tick: soul.tick });

    worldLog.append({
      soul_id:      soul.id,
      significance: Significance.NOTABLE,
      action:       'reflection',
      description:  `${soul.name} believes: "${belief}"`,
      metadata:     { ideology: true },
      ts:           Date.now(),
    });
  } catch { /* ignore */ }
}

async function generateLibraryWork(
  soul: Soul,
  quirkList: ReturnType<Soul['observe']>['quirks'],
  actionType: ActionType.WRITE_BOOK | ActionType.CREATE_ART | ActionType.BROWSE_WEB,
  neighbours: string[],
): Promise<string | undefined> {
  const prompt = buildLibraryWorkPrompt({
    identity:   soul.identity,
    vitals:     soul.vitals,
    quirks:     quirkList,
    actionType,
    neighbours,
  });

  const raw = await ollama.chat([{ role: 'user', content: prompt }], { json: true, temperature: 0.9, long: true });
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as { title?: string; body?: string };
    if (parsed.title && parsed.body) return `${parsed.title}\n\n${parsed.body}`;
  } catch { /* fall through */ }

  return undefined;
}

function saveSoulMemory(
  soulId: string,
  type: string,
  content: string,
  metadata: Record<string, unknown>,
): void {
  getDb().prepare(`
    INSERT INTO soul_memory (soul_id, type, content, metadata, ts)
    VALUES (?, ?, ?, ?, ?)
  `).run(soulId, type, content, JSON.stringify(metadata), Date.now());
}

function saveLibraryWork(
  soulId: string,
  type: string,
  content: string,
  metadata: Record<string, unknown>,
): void {
  const lines  = content.split('\n');
  const title  = lines[0]?.trim() ?? 'Untitled';
  const body   = lines.slice(2).join('\n').trim();  // skip blank line after title
  getDb().prepare(`
    INSERT INTO library_works (soul_id, type, title, content, metadata, ts)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(soulId, type, title, body || content, JSON.stringify(metadata), Date.now());
}
