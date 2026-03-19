import { STORY_HOUR_MS, ActionType, Significance } from '../types';
import type { DirectiveTask, SoulGoal, QuirkRecord, VentureProposal, SoulVitals, WalletRow, SoulIdentity, ConversationMessage } from '../types';
import { Soul } from './Soul';
import { LLMDecider } from './LLMDecider';
import { HardcodedDecider } from './HardcodedDecider';
import { ActionExecutor, applyPassiveDrift } from './ActionExecutor';
import { scoreReward } from '../reward/RewardEngine';
import { QuirkTracker } from '../quirks/QuirkTracker';
import { WorldLog } from '../world/WorldLog';
import { classifyEvent } from '../world/EventClassifier';
import { pushSnapshot, worldEvents, invalidateObjectsCache } from '../world/WorldState';
import { drain as drainDirectives } from '../world/DirectiveQueue';
import { updatePosition, getAllPositions } from '../world/PositionTracker';
import { ollama } from '../llm/OllamaClient';
import { anthropicClient } from '../llm/AnthropicClient';
import type { AnthropicContentBlock } from '../llm/AnthropicClient';
import { buildSystemBlocks } from '../llm/systemBlocks';
import { runComputerTask } from '../llm/ComputerUseAgent';
import {
  buildContentPrompt,
  buildSocialPrompt,
  buildReflectionPrompt,
  buildLibraryWorkPrompt,
  buildDirectiveInterpretationPrompt,
  buildIdeologyPrompt,
  buildGoalFormationPrompt,
  buildRegistryActionNarrationPrompt,
  buildVentureResponsePrompt,
  buildWebSearchPrompt,
  buildWebSearchSynthesisPrompt,
  buildCodeReadPrompt,
  buildCodeWritePrompt,
  buildAIConsultPrompt,
  buildShellCommandPrompt,
} from '../llm/prompts';
import { getPool } from '../db/client';
import { getRedis } from '../db/redisClient';
import { embedText } from '../db/embed';
import { integrationDispatcher } from '../integrations/IntegrationDispatcher';
import { getRegistryActions, seedRegistry } from '../world/ActionRegistry';
import { runConversation, isInConversation, emitNarrationBubble } from './ConversationLoop';
import type { ConversationParticipant } from './ConversationLoop';
import { randomUUID } from 'crypto';

const SILENT_ACTIONS = new Set([
  'eat', 'rest', 'nap', 'sleep', 'exercise', 'walk', 'idle',
  'meditate', 'journal', 'wander', 'cook', 'browse_jobs', 'submit_application',
]);

const REFLECTION_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes real time
const IDEOLOGY_INTERVAL_MS   = 8 * 60 * 1000; // 8 minutes real time
const GOAL_INTERVAL_MS       = 10 * 60 * 1000; // 10 minutes real time
const lastReflectionTime = new Map<string, number>();
const lastIdeologyTime   = new Map<string, number>();
const lastGoalTime       = new Map<string, number>();

// ─── Wildcard impulses ────────────────────────────────────────────────────────

const WILDCARDS = [
  'A sudden restlessness makes you want to do something different today.',
  'You find yourself thinking about one of your neighbours unexpectedly.',
  'A creative urge surfaces — something wants to be made.',
  'You wonder if there\'s a better way to spend your time in this tower.',
  'A memory surfaces and puts you in a strange mood.',
  'You feel an impulse to reach out to someone.',
  'Something about the quiet of the tower makes you want to break it.',
  'You\'re struck by an idea you\'ve never tried before.',
  'A vague sense of ambition stirs inside you.',
  'You notice how little you know about what the others are doing.',
  'The thought of building something permanent crosses your mind.',
  'You feel like today could be different from all the other days.',
];

function pickWildcard(): string {
  return WILDCARDS[Math.floor(Math.random() * WILDCARDS.length)]!;
}

const log = (soulName: string, msg: string) =>
  process.stdout.write(`[${new Date().toISOString()}] [${soulName}] ${msg}\n`);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── LLM availability cache ───────────────────────────────────────────────────

const LLM_RECHECK_INTERVAL = 5 * 60 * 1000;
let llmAvailable      = false;
let llmLastChecked    = 0;
let contentFailStreak = 0;

// ─── Cache stats (logged every 100 ticks) ─────────────────────────────────────
let _tickCount  = 0;
let _cacheStats = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function accumulateCacheStats(usage: { input: number; output: number; cacheRead: number; cacheWrite: number }): void {
  _cacheStats.input      += usage.input;
  _cacheStats.output     += usage.output;
  _cacheStats.cacheRead  += usage.cacheRead;
  _cacheStats.cacheWrite += usage.cacheWrite;
}

function maybePrintCacheStats(label: string): void {
  _tickCount++;
  if (_tickCount % 100 === 0) {
    const { input, output, cacheRead, cacheWrite } = _cacheStats;
    process.stdout.write(
      `[AgentLoop] [cacheStats] after ${_tickCount} ticks from ${label}: ` +
      `in=${input} out=${output} cache_read=${cacheRead} cache_write=${cacheWrite}\n`,
    );
  }
}

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

let registrySeeded = false;

export async function runAgentLoop(soul: Soul, slotIndex: number, neighbours: string[] = []): Promise<void> {
  if (!registrySeeded) {
    registrySeeded = true;
    await seedRegistry(soul.id);
  }

  // Stagger background tasks so souls don't all fire simultaneously
  const jitter = slotIndex * 40_000;
  if (!lastReflectionTime.has(soul.id)) lastReflectionTime.set(soul.id, Date.now() - REFLECTION_INTERVAL_MS + jitter);
  if (!lastIdeologyTime.has(soul.id))   lastIdeologyTime.set(soul.id, Date.now() - IDEOLOGY_INTERVAL_MS + jitter);
  if (!lastGoalTime.has(soul.id))       lastGoalTime.set(soul.id, Date.now() - GOAL_INTERVAL_MS + jitter);

  const usingLLM = await checkLLM();
  log(soul.name, `Agent loop started. LLM: ${usingLLM ? 'Anthropic ✓' : 'hardcoded fallback'} | slot #${slotIndex}`);

  while (soul.is_active) {
    try {
      // Skip decision-making if currently in a real-time conversation
      if (isInConversation(soul.id)) {
        await sleep(5_000);
        continue;
      }

      const now = Date.now();
      if (now >= soul.actionEndTime) {
        // Soul is free — make a new decision
        await tick(soul, slotIndex, neighbours);
      } else {
        // Soul is busy — run background tasks while waiting
        await backgroundPoll(soul, slotIndex, neighbours);

        // Poll every 5s for incoming directives — preempt current action if one arrives
        let polled = 0;
        while (polled < 30_000 && soul.actionEndTime > Date.now()) {
          await sleep(5_000);
          polled += 5_000;
          const redis = getRedis();
          const pending = await redis.llen(`directives:${soul.id}`);
          if (pending > 0) {
            soul.setActionEndTime(0); // preempt — next loop iteration runs tick() immediately
            log(soul.name, `⚡ Directive arrived — preempting current action`);
            break;
          }
        }
      }
    } catch (err) {
      log(soul.name, `Error: ${String(err)}`);
      await sleep(5_000);
    }
  }

  log(soul.name, 'Loop stopped.');
}

async function tick(soul: Soul, slotIndex: number, neighbours: string[]): Promise<void> {
  // 1. Observe
  const { vitals: vitalsBefore, wallet, quirks: quirkList } = await soul.observe();

  // Passive drift
  const driftedVitals = applyPassiveDrift(vitalsBefore);
  await soul.updateVitals(driftedVitals);

  // Build cached system blocks (identity + quirks) for Anthropic prompt caching
  const systemBlocks = buildSystemBlocks({ identity: soul.identity, neighbours, quirks: quirkList, goals: [] });

  // 2. Drain visitor directives (check for venture prefix before routing)
  const directives = await drainDirectives(soul.id);
  let directive: string | undefined;
  for (const d of directives) {
    if (d.message.startsWith('[VENTURE:')) {
      await handleVentureDirective(soul, d.message, quirkList, neighbours, systemBlocks);
    } else {
      directive = d.message; // most recent non-venture
    }
  }
  if (directive) {
    log(soul.name, `⚡ Visitor directive: "${directive}"`);
  }

  // 3. Interpret new directive into a task (overrides any existing task)
  const llmOnline = await checkLLM();
  if (directive && llmOnline) {
    const task = await interpretDirective(soul, driftedVitals, directive, neighbours, systemBlocks);
    if (task) {
      soul.setActiveTask(task);
      log(soul.name, `⚡ Task set: ${task.description} [actions: ${task.relevant_actions.join(', ')}, steps: ${task.max_steps}]`);
    }
  }

  // 3b. Stochastic noise wildcard
  const spontaneity = 0.05 + soul.reward_weights.w2_social * 0.2;
  const wildcard = Math.random() > (1 - spontaneity) && !soul.active_task
    ? pickWildcard()
    : undefined;
  if (wildcard) log(soul.name, `~ ${wildcard}`);

  // 3c. Load episodic memories (semantic recall)
  const contextText = `${soul.name}: vitals=${JSON.stringify(driftedVitals)}, ` +
    `recent=${(await soul.recentActions(5)).join(',')}, directive=${directive ?? 'none'}`;
  const recentMemories = await recallMemories(soul.id, contextText);

  // 3d. Load active goal
  const activeGoal = await loadActiveGoal(soul.id);

  // 3e. Load registry actions
  const registryActions = await getRegistryActions();

  // 3f. Fetch neighbour states (current action + active goal) for prompt context
  const neighbourStates = await fetchNeighbourStates(neighbours);

  // 4. Decide
  const timeOfDay = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const action = llmOnline
    ? await llmDecider.decide(
        soul.identity, driftedVitals, soul.reward_weights,
        wallet, quirkList, soul.last_reward, soul.last_action,
        timeOfDay, directive, neighbours, soul.active_task,
        recentMemories, wildcard, activeGoal, registryActions, soul.tick, soul.id,
        neighbourStates,
      )
    : { ...hardcodedDecider.decide(driftedVitals, soul.reward_weights, quirkList, soul.last_reward) };

  const taskNote      = soul.active_task ? ` [task: ${soul.active_task.description}]` : '';
  const reasoningNote = action.reasoning ? ` ("${action.reasoning}")` : '';
  const hoursNote     = action.story_hours ? ` [${action.story_hours}h]` : '';
  log(soul.name, `Tick #${soul.tick + 1} — ${action.type}${hoursNote}${reasoningNote}${taskNote}`);

  // 4b. Generate LLM text for creative/social actions
  let generatedText: string | undefined;
  const label = action.type as string;
  if (llmOnline) {
    if (/create_content/.test(label)) {
      generatedText = await generateContent(soul, quirkList, neighbours, systemBlocks);
    } else if (/social_post|tweet|post/.test(label)) {
      generatedText = await generateSocialText(soul, quirkList, ActionType.SOCIAL_POST, neighbours, systemBlocks);
    } else if (/meet_soul|meet_/.test(label)) {
      generatedText = await generateSocialText(soul, quirkList, ActionType.MEET_SOUL, neighbours, systemBlocks);
    } else if (/write_book/.test(label)) {
      generatedText = await generateLibraryWork(soul, quirkList, ActionType.WRITE_BOOK, neighbours, systemBlocks);
    } else if (/create_art/.test(label)) {
      generatedText = await generateLibraryWork(soul, quirkList, ActionType.CREATE_ART, neighbours, systemBlocks);
    } else if (/browse_web/.test(label)) {
      if (process.env['ENABLE_COMPUTER_USE'] === 'true') {
        // Route through ComputerUseAgent agentic loop
        const context = action.reasoning ?? action.description ?? 'browsing the web';
        generatedText = await runComputerTask({ task: context, systemBlocks, soulName: soul.name }) ?? undefined;
      } else {
        generatedText = await generateLibraryWork(soul, quirkList, ActionType.BROWSE_WEB, neighbours, systemBlocks);
      }
    } else if (/^search_web$/.test(label)) {
      generatedText = await generateToolAction(soul, 'search_web', neighbours, action, systemBlocks);
    } else if (/^read_codebase$/.test(label)) {
      generatedText = await generateToolAction(soul, 'read_codebase', neighbours, action, systemBlocks);
    } else if (/^write_code$/.test(label)) {
      generatedText = await generateToolAction(soul, 'write_code', neighbours, action, systemBlocks);
    } else if (/^consult_ai$/.test(label)) {
      generatedText = await generateToolAction(soul, 'consult_ai', neighbours, action, systemBlocks);
    } else if (/^run_command$/.test(label)) {
      generatedText = await generateToolAction(soul, 'run_command', neighbours, action, systemBlocks);
    } else if (!SILENT_ACTIONS.has(label)) {
      // All other non-silent actions: registry narration (includes novel auto-registered labels)
      const regAction = registryActions.find(r => r.label === label);
      const actionDesc = regAction?.description ?? action.description ?? label;
      generatedText = await generateRegistryActionText(soul, label, actionDesc, neighbours, systemBlocks);
    }
  }

  // Track consecutive content-generation failures to detect a broken "online" state
  // (silent actions returning undefined is expected, not a failure)
  if (llmOnline && generatedText === undefined && !SILENT_ACTIONS.has(label)) {
    contentFailStreak++;
    if (contentFailStreak >= 3) {
      process.stderr.write(`[AgentLoop] ${soul.name}: content fail streak ${contentFailStreak} — invalidating LLM check cache\n`);
      llmLastChecked = 0;
      contentFailStreak = 0;
    }
  } else {
    contentFailStreak = 0;
  }

  // 5. Execute (browser → simulation fallback)
  const result = await executor.run(action, driftedVitals, soul.identity, soul.id);

  // 5a. For search_web: synthesize real results into a findings document
  if (label === 'search_web' && result.description.includes('Searched') && llmOnline) {
    const query       = String(action.payload['searchQuery'] ?? '');
    const rawResults  = result.description;
    const synth = await generateSearchSynthesis(soul, query, rawResults, neighbours, systemBlocks);
    if (synth) {
      generatedText = synth;
      void saveLibraryWork(soul.id, 'research', synth, { action: label, query }).catch(() => {});
    }
  }

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
      void worldLog.append({
        soul_id:      soul.id,
        significance: Significance.NOTABLE,
        action:       action.type,
        description:  `${soul.name} completed directive task: "${completedTask.description}"`,
        metadata:     { directive: completedTask.directive },
        ts:           Date.now(),
      });
    } else if (soul.active_task.relevant_actions.includes(action.type as string)) {
      const remaining = soul.active_task.max_steps - soul.active_task.steps_completed;
      log(soul.name, `  Task progress: ${soul.active_task.steps_completed}/${soul.active_task.max_steps} steps (${remaining} remaining)`);
    }
  }

  // 6. Score reward
  const reward = scoreReward(soul.reward_weights, driftedVitals, result.vitals_after, result);

  // 7. Update vitals + wallet
  await soul.updateVitals(result.vitals_after);
  if (result.profit_delta > 0) {
    await soul.creditWallet(result.profit_delta, `${action.type}_abstract`);
  }

  // 8. Quirk tracking + reward record
  const quirkDelta = await quirks.reinforce(soul.id, action.type as string, reward.r_total);
  await soul.recordReward(reward, action.type, quirkDelta);

  // 9. Store generated content in soul_memory + library_works for library actions
  if (generatedText) {
    const isLibraryAction = /write_book|create_art|browse_web/.test(label);
    const isContentAction = /create_content/.test(label);
    const memType = isContentAction ? 'content' : isLibraryAction ? 'library_work' : 'social';
    void saveSoulMemory(soul.id, memType, generatedText, { action: label }).catch(() => {});

    if (isLibraryAction) {
      const workType = /write_book/.test(label) ? 'writing'
        : /create_art/.test(label) ? 'art'
        : 'research';
      void saveLibraryWork(soul.id, workType, generatedText, { action: label }).catch(() => {});
    }
  }

  // 10. Classify + log event
  // Inject LLM self-reported significance into result metadata so classifyEvent can use it
  if (action.llm_significance) {
    result.metadata['llm_significance'] = action.llm_significance;
  }

  const walletAfter = (await soul.observe()).wallet;
  const significance = classifyEvent({
    action:       action.type as string,
    result,
    wallet:       walletAfter,
    walletBefore: { balance_abstract: wallet.balance_abstract },
    rewardTotal:  reward.r_total,
    activeGoal,
    soulNames:    neighbours,
  });

  void worldLog.append({
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

  // Update goal progress_notes when this tick is meaningful
  if (
    activeGoal &&
    (significance === Significance.NOTABLE || significance === Significance.SIGNIFICANT)
  ) {
    const progressNote = `[${new Date().toISOString().substring(0, 10)}] ${action.type}: ${result.description.substring(0, 100)}`;
    const existing = Array.isArray(activeGoal.progress_notes) ? (activeGoal.progress_notes as string[]) : [];
    void getPool().query(
      `UPDATE soul_goals SET progress_notes = $1::jsonb WHERE id = $2`,
      [JSON.stringify([...existing, progressNote].slice(-20)), activeGoal.id],
    ).catch(() => {});
  }

  // 11. Fire integrations (Ghost, Twitter, Reddit, @asphodel_tower)
  await integrationDispatcher.dispatch(soul, action.type as string, significance, generatedText, result);

  // 11b. Emit speech bubble for narration / trigger real-time conversation
  if (generatedText && llmOnline) {
    const shortText = generatedText.substring(0, 120);
    if (/meet_soul|socialize|meet_/.test(label) && neighbours.length > 0) {
      // Trigger a real-time multi-turn conversation
      void triggerConversation(soul, neighbours, label, generatedText).catch(() => {});
    } else {
      // Emit a narration bubble (soul thinking/doing aloud)
      emitNarrationBubble(soul.id, soul.name.split(' ')[0] ?? soul.name, shortText);
    }
  }

  // 12. Update 3D position
  await updatePosition(soul.id, label, slotIndex);

  // Invalidate world objects cache if an object action was performed
  if (['place_object', 'modify_object', 'gift_object'].includes(label)) {
    invalidateObjectsCache();
  }

  // 13. Periodic reflection + ideology + goal development
  const nowMs   = Date.now();
  const lastRef = lastReflectionTime.get(soul.id) ?? 0;
  if (llmOnline && nowMs - lastRef >= REFLECTION_INTERVAL_MS) {
    lastReflectionTime.set(soul.id, nowMs);
    await runReflection(soul, quirkList, neighbours, systemBlocks);
  }

  const lastIde = lastIdeologyTime.get(soul.id) ?? 0;
  if (llmOnline && nowMs - lastIde >= IDEOLOGY_INTERVAL_MS) {
    lastIdeologyTime.set(soul.id, nowMs);
    await runIdeology(soul, quirkList, neighbours, systemBlocks);
  }

  const lastGoal = lastGoalTime.get(soul.id) ?? 0;
  if (llmOnline && nowMs - lastGoal >= GOAL_INTERVAL_MS) {
    lastGoalTime.set(soul.id, nowMs);
    await runGoalFormation(soul, quirkList, neighbours, systemBlocks);
  }

  maybePrintCacheStats(soul.name);

  // 13b. Possibly initiate a venture on collaborative registry actions
  if (llmOnline && neighbours.length > 0) {
    const regAction = registryActions.find(r => r.label === label && r.is_collaborative);
    if (regAction && Math.random() < 0.3) {
      await initiateVenture(soul, regAction.label, regAction.description, neighbours);
    }
  }

  // 14. Broadcast
  pushSnapshot(await soul.snapshot());
  worldEvents.emit('update');

  // 15. Set action end time (time-based scheduling — no sleep here)
  const hours = action.story_hours ?? 1;
  soul.setActionEndTime(Date.now() + hours * STORY_HOUR_MS);
  const realMs = hours * STORY_HOUR_MS;
  const realMin = Math.round(realMs / 60_000);
  const realLabel = realMin >= 60
    ? `~${(realMin / 60).toFixed(1)}h`
    : `~${realMin}m`;
  log(soul.name, `action committed for ${hours} story-hour${hours !== 1 ? 's' : ''} (${realLabel} real time)`);
}

// ─── Background poll (runs while soul is busy with an action) ─────────────────

async function backgroundPoll(soul: Soul, slotIndex: number, neighbours: string[]): Promise<void> {
  const llmOnline = await checkLLM();
  const nowMs = Date.now();
  const { quirks: quirkList } = await soul.observe();

  const systemBlocks = buildSystemBlocks({ identity: soul.identity, neighbours, quirks: quirkList, goals: [] });

  // Reflection every 2 min
  const lastRef = lastReflectionTime.get(soul.id) ?? 0;
  if (llmOnline && nowMs - lastRef >= REFLECTION_INTERVAL_MS) {
    lastReflectionTime.set(soul.id, nowMs);
    await runReflection(soul, quirkList, neighbours, systemBlocks);
  }

  // Ideology every 8 min
  const lastIde = lastIdeologyTime.get(soul.id) ?? 0;
  if (llmOnline && nowMs - lastIde >= IDEOLOGY_INTERVAL_MS) {
    lastIdeologyTime.set(soul.id, nowMs);
    await runIdeology(soul, quirkList, neighbours, systemBlocks);
  }

  // Goals every 10 min
  const lastGoal = lastGoalTime.get(soul.id) ?? 0;
  if (llmOnline && nowMs - lastGoal >= GOAL_INTERVAL_MS) {
    lastGoalTime.set(soul.id, nowMs);
    await runGoalFormation(soul, quirkList, neighbours, systemBlocks);
  }

  // Broadcast current state
  pushSnapshot(await soul.snapshot());

  const remaining = Math.max(0, soul.actionEndTime - nowMs);
  log(soul.name, `busy (${Math.round(remaining / 1000)}s remaining)`);

  // Proximity conversation — ~20% chance per poll cycle
  if (llmOnline && !isInConversation(soul.id) && Math.random() < 0.20) {
    const FLOOR_NAMES: Record<number, string> = {
      0: 'lobby', 1: 'kitchen', 2: 'office', 3: 'gym', 4: 'bedroom', 5: 'library',
    };
    try {
      const positions = await getAllPositions();
      const myPos = positions.find(p => p.soul_id === soul.id);
      if (myPos) {
        const floorIdx = myPos.y < 3 ? 0 : myPos.y < 7 ? 1 : myPos.y < 12 ? 2 : myPos.y < 16 ? 3 : myPos.y < 21 ? 4 : 5;
        const floorName = FLOOR_NAMES[floorIdx] ?? 'common area';
        const nearby = positions.filter(p => p.soul_id !== soul.id && Math.abs(p.y - myPos.y) < 0.5);
        if (nearby.length > 0 && nearby[0]) {
          void triggerProximityConversation(soul, nearby[0].soul_id, neighbours, floorName).catch(() => {});
        }
      }
    } catch { /* ignore */ }
  }

  void slotIndex; // used in tick, not here
}

// ─── LLM sub-tasks ────────────────────────────────────────────────────────────

async function interpretDirective(
  soul: Soul,
  vitals: SoulVitals,
  directive: string,
  neighbours: string[],
  systemBlocks: AnthropicContentBlock[],
): Promise<DirectiveTask | null> {
  const prompt = buildDirectiveInterpretationPrompt({
    identity:   soul.identity,
    vitals,
    directive,
    neighbours,
  });

  const resp = await anthropicClient.chat({ systemBlocks, messages: [{ role: 'user', content: prompt }], label: 'interpretDirective', soulName: soul.name });
  accumulateCacheStats(resp.usage);
  const raw = resp.text;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { task?: string; actions?: string[]; steps?: number };
    const relevant = (parsed.actions ?? [])
      .map(a => a.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))
      .filter(a => a.length > 0);

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
  quirkList: QuirkRecord[],
  neighbours: string[],
  systemBlocks: AnthropicContentBlock[],
): Promise<string | undefined> {
  const prompt = buildContentPrompt({
    identity:      soul.identity,
    vitals:        soul.vitals,
    quirks:        quirkList,
    recentActions: await soul.recentActions(5),
    neighbours,
  });

  const resp = await anthropicClient.chat({ systemBlocks, messages: [{ role: 'user', content: prompt }], long: true, label: 'generateContent', soulName: soul.name });
  accumulateCacheStats(resp.usage);
  const raw = resp.text;
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as { title?: string; body?: string };
    if (parsed.title && parsed.body) return `${parsed.title}\n\n${parsed.body}`;
  } catch { /* fall through */ }

  return undefined;
}

async function generateSocialText(
  soul: Soul,
  quirkList: QuirkRecord[],
  actionType: ActionType.SOCIAL_POST | ActionType.MEET_SOUL,
  neighbours: string[],
  systemBlocks: AnthropicContentBlock[],
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

  const resp = await anthropicClient.chat({ systemBlocks, messages: [{ role: 'user', content: prompt }], long: true, label: 'generateSocialText', soulName: soul.name });
  accumulateCacheStats(resp.usage);
  const raw = resp.text;
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
  quirkList: QuirkRecord[],
  neighbours: string[],
  systemBlocks: AnthropicContentBlock[],
): Promise<void> {
  const { wallet } = await soul.observe();
  const prompt = buildReflectionPrompt({
    identity:      soul.identity,
    vitals:        soul.vitals,
    wallet,
    quirks:        quirkList,
    recentActions: await soul.recentActions(10),
    rewardTrend:   await soul.recentRewardAvg(10),
    neighbours,
  });

  const resp = await anthropicClient.chat({ systemBlocks, messages: [{ role: 'user', content: prompt }], long: true, label: 'runReflection', soulName: soul.name });
  accumulateCacheStats(resp.usage);
  const raw = resp.text;
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as { reflection?: string };
    const reflection = parsed.reflection;
    if (!reflection) return;

    log(soul.name, `[reflection] ${reflection}`);
    void saveSoulMemory(soul.id, 'reflection', reflection, { tick: soul.tick }).catch(() => {});

    void worldLog.append({
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
  quirkList: QuirkRecord[],
  neighbours: string[],
  systemBlocks: AnthropicContentBlock[],
): Promise<void> {
  const { wallet } = await soul.observe();
  const prompt = buildIdeologyPrompt({
    identity:      soul.identity,
    vitals:        soul.vitals,
    wallet,
    quirks:        quirkList,
    recentActions: await soul.recentActions(10),
    rewardTrend:   await soul.recentRewardAvg(10),
    neighbours,
  });

  const resp = await anthropicClient.chat({ systemBlocks, messages: [{ role: 'user', content: prompt }], long: true, label: 'runIdeology', soulName: soul.name });
  accumulateCacheStats(resp.usage);
  const raw = resp.text;
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as { belief?: string };
    const belief = parsed.belief;
    if (!belief) return;

    log(soul.name, `[ideology] ${belief}`);
    void saveSoulMemory(soul.id, 'ideology', belief, { tick: soul.tick }).catch(() => {});

    void worldLog.append({
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
  quirkList: QuirkRecord[],
  actionType: ActionType.WRITE_BOOK | ActionType.CREATE_ART | ActionType.BROWSE_WEB,
  neighbours: string[],
  systemBlocks: AnthropicContentBlock[],
): Promise<string | undefined> {
  const prompt = buildLibraryWorkPrompt({
    identity:   soul.identity,
    vitals:     soul.vitals,
    quirks:     quirkList,
    actionType,
    neighbours,
  });

  const resp = await anthropicClient.chat({ systemBlocks, messages: [{ role: 'user', content: prompt }], long: true, label: 'generateLibraryWork', soulName: soul.name });
  accumulateCacheStats(resp.usage);
  const raw = resp.text;
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as { title?: string; body?: string };
    if (parsed.title && parsed.body) return `${parsed.title}\n\n${parsed.body}`;
  } catch { /* fall through */ }

  return undefined;
}

// ─── Phase 0: Memory recall ───────────────────────────────────────────────────

async function recallMemories(soulId: string, contextText: string): Promise<string[]> {
  const embedding = await embedText(contextText);
  if (!embedding) {
    // fallback: recency
    const { rows } = await getPool().query<{ content: string }>(
      `SELECT content FROM soul_memory WHERE soul_id = $1
       ORDER BY ts DESC LIMIT 5`,
      [soulId],
    );
    return rows.map(r => r.content).reverse();
  }
  const vec = '[' + embedding.join(',') + ']';
  const { rows } = await getPool().query<{ content: string }>(
    `SELECT content FROM soul_memory WHERE soul_id = $1
     ORDER BY embedding <=> $2::vector LIMIT 8`,
    [soulId, vec],
  );
  return rows.map(r => r.content);
}

// ─── Phase 2: Goal loading ────────────────────────────────────────────────────

async function loadActiveGoal(soulId: string): Promise<SoulGoal | null> {
  const { rows } = await getPool().query(
    `SELECT * FROM soul_goals WHERE soul_id = $1 AND status = 'active'
     ORDER BY priority DESC LIMIT 1`,
    [soulId],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    id:             row['id'] as string,
    soul_id:        row['soul_id'] as string,
    goal_text:      row['goal_text'] as string,
    formed_at:      row['formed_at'] as number,
    priority:       row['priority'] as 1 | 2 | 3,
    sub_goals:      (row['sub_goals'] as string[] | null) ?? null,     // JSONB — already parsed
    progress_notes: (row['progress_notes'] as string[] | null) ?? null,
    status:         row['status'] as SoulGoal['status'],
  };
}

// ─── Neighbour state lookup ───────────────────────────────────────────────────

async function fetchNeighbourStates(
  names: string[],
): Promise<Array<{ name: string; currentAction: string; activeGoal?: string }>> {
  if (names.length === 0) return [];
  try {
    const pool = getPool();

    // Most recent action per neighbour from world_log
    const { rows: actionRows } = await pool.query<{ name: string; action: string }>(
      `SELECT DISTINCT ON (s.id) s.name, wl.action
       FROM world_log wl
       JOIN souls s ON s.id = wl.soul_id
       WHERE s.name = ANY($1)
       ORDER BY s.id, wl.ts DESC`,
      [names],
    );

    // Active goal per neighbour (highest priority)
    const { rows: goalRows } = await pool.query<{ name: string; goal_text: string }>(
      `SELECT DISTINCT ON (sg.soul_id) s.name, sg.goal_text
       FROM soul_goals sg
       JOIN souls s ON s.id = sg.soul_id
       WHERE s.name = ANY($1) AND sg.status = 'active'
       ORDER BY sg.soul_id, sg.priority DESC`,
      [names],
    );

    const goalMap = new Map(goalRows.map(r => [r.name, r.goal_text]));

    return actionRows.map(r => ({
      name:          r.name,
      currentAction: r.action,
      activeGoal:    goalMap.get(r.name),
    }));
  } catch {
    return [];
  }
}

async function runGoalFormation(
  soul: Soul,
  quirkList: QuirkRecord[],
  neighbours: string[],
  systemBlocks: AnthropicContentBlock[],
): Promise<void> {
  const { wallet } = await soul.observe();
  const existingGoal = await loadActiveGoal(soul.id);

  const prompt = buildGoalFormationPrompt({
    identity:      soul.identity,
    vitals:        soul.vitals,
    wallet,
    quirks:        quirkList,
    recentActions: await soul.recentActions(10),
    existingGoal,
    neighbours,
  });

  const resp = await anthropicClient.chat({ systemBlocks, messages: [{ role: 'user', content: prompt }], long: true, label: 'runGoalFormation', soulName: soul.name });
  accumulateCacheStats(resp.usage);
  const raw = resp.text;
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as { goal?: string; sub_goals?: string[]; priority?: number };
    if (!parsed.goal) return;

    const priority = Math.max(1, Math.min(3, parsed.priority ?? 2)) as 1 | 2 | 3;
    const subGoals = (parsed.sub_goals ?? []).slice(0, 3);
    const pool = getPool();

    if (existingGoal) {
      await pool.query(
        `UPDATE soul_goals SET goal_text = $1, priority = $2, sub_goals = $3 WHERE id = $4`,
        [parsed.goal, priority, subGoals, existingGoal.id],
      );
    } else {
      await pool.query(
        `INSERT INTO soul_goals (id, soul_id, goal_text, formed_at, priority, sub_goals, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
        [randomUUID(), soul.id, parsed.goal, Date.now(), priority, subGoals],
      );
    }

    log(soul.name, `[goal] P${priority}: "${parsed.goal}"`);
    void worldLog.append({
      soul_id:      soul.id,
      significance: Significance.NOTABLE,
      action:       'goal_formation',
      description:  `${soul.name} sets a goal (P${priority}): "${parsed.goal}"`,
      metadata:     { sub_goals: subGoals },
      ts:           Date.now(),
    });
  } catch { /* ignore */ }
}

// ─── Phase 3: Registry action narration ──────────────────────────────────────

async function generateRegistryActionText(
  soul: Soul,
  label: string,
  description: string,
  neighbours: string[],
  systemBlocks: AnthropicContentBlock[],
): Promise<string | undefined> {
  const prompt = buildRegistryActionNarrationPrompt({
    identity:          soul.identity,
    actionLabel:       label,
    actionDescription: description,
    neighbours,
  });

  const resp = await anthropicClient.chat({ systemBlocks, messages: [{ role: 'user', content: prompt }], label: 'generateRegistryActionText', soulName: soul.name });
  accumulateCacheStats(resp.usage);
  const raw = resp.text;
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as { narration?: string };
    return parsed.narration ?? undefined;
  } catch {
    return undefined;
  }
}

// ─── Phase 4b: Tool action parameter generation ───────────────────────────────

async function generateToolAction(
  soul: Soul,
  toolType: string,
  neighbours: string[],
  action: import('../types').Action,
  systemBlocks: AnthropicContentBlock[],
): Promise<string | undefined> {
  const context = action.reasoning ?? action.description ?? `performing ${toolType}`;

  let prompt: string;
  let parseKey: string;

  if (toolType === 'search_web') {
    prompt    = buildWebSearchPrompt({ identity: soul.identity, vitals: soul.vitals, context, neighbours });
    parseKey  = 'searchQuery';
  } else if (toolType === 'read_codebase') {
    prompt    = buildCodeReadPrompt({ identity: soul.identity, context, neighbours });
    parseKey  = 'filePaths';
  } else if (toolType === 'write_code') {
    prompt    = buildCodeWritePrompt({ identity: soul.identity, context, neighbours });
    parseKey  = 'filePath';
  } else if (toolType === 'consult_ai') {
    prompt    = buildAIConsultPrompt({ identity: soul.identity, context, neighbours });
    parseKey  = 'question';
  } else {
    prompt    = buildShellCommandPrompt({ identity: soul.identity, context, neighbours });
    parseKey  = 'command';
  }

  const resp = await anthropicClient.chat({ systemBlocks, messages: [{ role: 'user', content: prompt }], label: `generateToolAction:${toolType}`, soulName: soul.name });
  accumulateCacheStats(resp.usage);
  const raw = resp.text;
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // Merge parsed params into action.payload for ToolRouter to consume
    Object.assign(action.payload, parsed);

    const value = parsed[parseKey];
    if (toolType === 'search_web' && value) {
      return `Searching the web for: "${value}"`;
    } else if (toolType === 'read_codebase') {
      const files = Array.isArray(value) ? value.join(', ') : String(value ?? '');
      return `Reading codebase: ${files}`;
    } else if (toolType === 'write_code' && value) {
      return `Writing code to ${value}: ${String(parsed['description'] ?? '')}`;
    } else if (toolType === 'consult_ai' && value) {
      return `Consulting Claude: "${String(value).substring(0, 100)}"`;
    } else if (toolType === 'run_command' && value) {
      return `Running command: ${value}`;
    }
  } catch {
    process.stderr.write(`[AgentLoop] generateToolAction parse failed for ${toolType}: ${raw.substring(0, 120)}\n`);
  }

  return undefined;
}

// ─── Phase 4c: Search synthesis ──────────────────────────────────────────────

async function generateSearchSynthesis(
  soul: Soul,
  query: string,
  rawResults: string,
  neighbours: string[],
  systemBlocks: AnthropicContentBlock[],
): Promise<string | undefined> {
  const snippetLines = rawResults.split('\n').filter(l => l.startsWith('•'));
  const results = snippetLines.slice(0, 5).map(l => {
    const m = l.match(/^• (.+?): (.+)$/);
    return { title: m?.[1] ?? '', url: '', snippet: m?.[2] ?? l };
  });

  const prompt = buildWebSearchSynthesisPrompt({ identity: soul.identity, query, results, neighbours });
  const resp = await anthropicClient.chat({
    systemBlocks,
    messages: [{ role: 'user', content: prompt }],
    long: true,
    label: 'searchSynthesis',
    soulName: soul.name,
  });
  accumulateCacheStats(resp.usage);
  const raw = resp.text;
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as { findings?: string };
    if (parsed.findings) return `Search: ${query}\n\n${parsed.findings}`;
  } catch { /* fall through */ }
  return undefined;
}

// ─── Phase 5: Venture logic ───────────────────────────────────────────────────

async function initiateVenture(
  soul: Soul,
  actionLabel: string,
  description: string,
  neighbours: string[],
): Promise<void> {
  if (neighbours.length === 0) return;

  const partnerName = neighbours[Math.floor(Math.random() * neighbours.length)]!;
  const pool = getPool();

  const { rows: partnerRows } = await pool.query<{ id: string }>(
    'SELECT id FROM souls WHERE name = $1',
    [partnerName],
  );
  if (!partnerRows[0]) return;
  const partnerId = partnerRows[0].id;

  const ventureId = randomUUID();
  const split = { initiator: 0.6, partner: 0.4 };

  await pool.query(
    `INSERT INTO joint_ventures (id, initiator_id, partner_id, action_label, description, reward_split, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'negotiating', $7)`,
    [ventureId, soul.id, partnerId, actionLabel, description, split, Date.now()],
  );

  const proposalId = randomUUID();
  const message = `[VENTURE:${ventureId}] ${soul.name} proposes collaborating on "${actionLabel}": ${description}. Proposed split: you get 40%, I get 60%.`;

  await pool.query(
    `INSERT INTO venture_proposals (id, venture_id, from_soul_id, to_soul_id, message, ts)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [proposalId, ventureId, soul.id, partnerId, message, Date.now()],
  );

  // Enqueue directive: DB write + Redis push so partner's drain picks it up
  const directiveId = randomUUID();
  const directiveTs = Date.now();
  await pool.query(
    `INSERT INTO directives (id, soul_id, visitor_id, message, injected, ts)
     VALUES ($1, $2, $3, $4, FALSE, $5)`,
    [directiveId, partnerId, soul.id, message, directiveTs],
  );
  const redis = getRedis();
  await redis.rpush(`directives:${partnerId}`, JSON.stringify({ id: directiveId, soul_id: partnerId, visitor_id: soul.id, message, ts: directiveTs }));
  await redis.expire(`directives:${partnerId}`, 86400);

  log(soul.name, `[venture] Proposed "${actionLabel}" to ${partnerName}`);
}

async function handleVentureDirective(
  soul: Soul,
  message: string,
  quirkList: QuirkRecord[],
  neighbours: string[],
  systemBlocks: AnthropicContentBlock[],
): Promise<void> {
  const match = message.match(/^\[VENTURE:([^\]]+)\]/);
  if (!match) return;

  const ventureId = match[1]!;
  const pool = getPool();

  const { rows: ventureRows } = await pool.query(
    'SELECT * FROM joint_ventures WHERE id = $1',
    [ventureId],
  );
  const venture = ventureRows[0] as Record<string, unknown> | undefined;
  if (!venture || venture['status'] !== 'negotiating') return;

  // Count prior counter-proposals to prevent infinite loops
  const { rows: counterRows } = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*) as cnt FROM venture_proposals WHERE venture_id = $1 AND response = 'counter'`,
    [ventureId],
  );
  const counterCount = Number(counterRows[0]?.cnt ?? 0);

  if (counterCount >= 2) {
    await pool.query(`UPDATE joint_ventures SET status = 'rejected' WHERE id = $1`, [ventureId]);
    return;
  }

  const { rows: initiatorRows } = await pool.query<{ name: string }>(
    'SELECT name FROM souls WHERE id = $1',
    [venture['initiator_id'] as string],
  );
  const { wallet } = await soul.observe();
  const activeGoal = await loadActiveGoal(soul.id);

  const split = venture['reward_split'] as { initiator: number; partner: number }; // JSONB
  const prompt = buildVentureResponsePrompt({
    identity:      soul.identity,
    vitals:        soul.vitals,
    proposerName:  initiatorRows[0]?.name ?? 'someone',
    actionLabel:   venture['action_label'] as string,
    description:   venture['description'] as string,
    proposedSplit: split,
    activeGoal,
    neighbours,
  });

  const resp = await anthropicClient.chat({ systemBlocks, messages: [{ role: 'user', content: prompt }], label: 'handleVentureDirective', soulName: soul.name });
  accumulateCacheStats(resp.usage);
  const raw = resp.text;
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as { response?: string; counter_text?: string; reasoning?: string };
    const response = parsed.response as VentureProposal['response'];
    if (!response) return;

    await pool.query(
      `UPDATE venture_proposals SET response = $1, counter_text = $2 WHERE venture_id = $3 AND to_soul_id = $4`,
      [response, parsed.counter_text ?? null, ventureId, soul.id],
    );

    if (response === 'accepted') {
      await pool.query(`UPDATE joint_ventures SET status = 'active' WHERE id = $1`, [ventureId]);
      log(soul.name, `[venture] Accepted venture ${ventureId}`);
      void worldLog.append({
        soul_id:      soul.id,
        significance: Significance.NOTABLE,
        action:       'venture_accepted',
        description:  `${soul.name} joined a venture with ${initiatorRows[0]?.name ?? 'a neighbour'}: "${venture['action_label']}"`,
        metadata:     { venture_id: ventureId },
        ts:           Date.now(),
      });
    } else if (response === 'rejected') {
      await pool.query(`UPDATE joint_ventures SET status = 'rejected' WHERE id = $1`, [ventureId]);
      log(soul.name, `[venture] Rejected venture ${ventureId}`);
    } else {
      // Counter — send back to initiator
      const counterMsg = `[VENTURE:${ventureId}] ${soul.name} counters: ${parsed.counter_text ?? 'different terms'}`;
      const counterDirectiveId = randomUUID();
      const counterTs = Date.now();
      const targetId = venture['initiator_id'] as string;
      await pool.query(
        `INSERT INTO directives (id, soul_id, visitor_id, message, injected, ts)
         VALUES ($1, $2, $3, $4, FALSE, $5)`,
        [counterDirectiveId, targetId, soul.id, counterMsg, counterTs],
      );
      const redis = getRedis();
      await redis.rpush(`directives:${targetId}`, JSON.stringify({ id: counterDirectiveId, soul_id: targetId, visitor_id: soul.id, message: counterMsg, ts: counterTs }));
      await redis.expire(`directives:${targetId}`, 86400);
      log(soul.name, `[venture] Countered venture ${ventureId}`);
    }
  } catch { /* ignore */ }

  void quirkList; // used elsewhere
}

async function saveSoulMemory(
  soulId: string,
  type: string,
  content: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const embedding = await embedText(content);
  const vec = embedding ? '[' + embedding.join(',') + ']' : null;
  await getPool().query(
    `INSERT INTO soul_memory (soul_id, type, content, metadata, ts, embedding)
     VALUES ($1, $2, $3, $4, $5, $6::vector)`,
    [soulId, type, content, metadata, Date.now(), vec],
  );
}

async function saveLibraryWork(
  soulId: string,
  type: string,
  content: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const lines = content.split('\n');
  const title = lines[0]?.trim() ?? 'Untitled';
  const body  = lines.slice(2).join('\n').trim(); // skip blank line after title

  await getPool().query(
    `INSERT INTO library_works (soul_id, type, title, content, metadata, ts)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [soulId, type, title, body || content, metadata, Date.now()],
  );
}

// ─── Phase 6: Real-time conversation trigger ────────────────────────────────

async function triggerConversation(
  soul: Soul,
  neighbours: string[],
  actionLabel: string,
  initialText: string,
): Promise<void> {
  // Pick a conversation partner (random neighbour)
  const partnerName = neighbours[Math.floor(Math.random() * neighbours.length)]!;
  const pool = getPool();

  const { rows: partnerRows } = await pool.query(
    'SELECT id, name, email, identity, reward_weights FROM souls WHERE name LIKE $1 AND is_active = TRUE',
    [`${partnerName}%`],
  );
  if (!partnerRows[0]) return;

  const partnerRow = partnerRows[0] as Record<string, unknown>;
  const partnerId = partnerRow['id'] as string;

  // Don't start if partner is already in a conversation
  if (isInConversation(partnerId)) return;

  // Load quirks for both
  const { rows: soulQuirks } = await pool.query(
    'SELECT * FROM quirks WHERE soul_id = $1',
    [soul.id],
  );
  const { rows: partnerQuirks } = await pool.query(
    'SELECT * FROM quirks WHERE soul_id = $1',
    [partnerId],
  );

  const participants: ConversationParticipant[] = [
    {
      id: soul.id,
      name: soul.name,
      identity: soul.identity,
      quirks: soulQuirks as QuirkRecord[],
    },
    {
      id: partnerId,
      name: partnerRow['name'] as string,
      identity: partnerRow['identity'] as import('../types').SoulIdentity,
      quirks: partnerQuirks as QuirkRecord[],
    },
  ];

  const context = /socialize/.test(actionLabel)
    ? `Casual socializing in the common area of Asphodel Tower`
    : `${soul.name.split(' ')[0]} wanted to meet ${partnerName} — ${initialText.substring(0, 100)}`;

  const turns = 4 + Math.floor(Math.random() * 4); // 4-7 turns
  await runConversation(participants, context, turns);
}

// ─── Proximity conversation trigger (spontaneous bump-in) ───────────────────

async function triggerProximityConversation(
  soul: Soul,
  partnerId: string,
  neighbours: string[],
  floorName: string,
): Promise<void> {
  if (isInConversation(soul.id) || isInConversation(partnerId)) return;

  const pool = getPool();

  const { rows: partnerRows } = await pool.query(
    'SELECT id, name, identity FROM souls WHERE id = $1 AND is_active = TRUE',
    [partnerId],
  );
  if (!partnerRows[0]) return;

  // Cooldown: skip if they talked in the last 10 minutes
  const { rows: recentRows } = await pool.query(
    `SELECT id FROM conversations
     WHERE participant_ids @> $1::jsonb AND participant_ids @> $2::jsonb
     AND started_at > $3 LIMIT 1`,
    [JSON.stringify([soul.id]), JSON.stringify([partnerId]), Date.now() - 10 * 60_000],
  );
  if (recentRows.length > 0) return;

  // Get last conversation snippet for anti-repetition context
  const { rows: prevConvos } = await pool.query(
    `SELECT messages FROM conversations
     WHERE participant_ids @> $1::jsonb AND participant_ids @> $2::jsonb
     AND status = 'ended' ORDER BY ended_at DESC LIMIT 1`,
    [JSON.stringify([soul.id]), JSON.stringify([partnerId])],
  );
  const prevHint = prevConvos.length > 0 && prevConvos[0]
    ? ` They've spoken before — you might naturally follow up on something from that conversation, or bring up something new. Be curious about what they've been up to.`
    : ' This is an early encounter — introduce yourselves a bit, find common ground.';

  // Load quirks for both
  const [{ rows: soulQuirks }, { rows: partnerQuirks }] = await Promise.all([
    pool.query('SELECT * FROM quirks WHERE soul_id = $1', [soul.id]),
    pool.query('SELECT * FROM quirks WHERE soul_id = $1', [partnerId]),
  ]);

  const partnerRow = partnerRows[0] as Record<string, unknown>;
  const participants: ConversationParticipant[] = [
    { id: soul.id, name: soul.name, identity: soul.identity, quirks: soulQuirks as QuirkRecord[] },
    {
      id:       partnerRow['id'] as string,
      name:     partnerRow['name'] as string,
      identity: partnerRow['identity'] as SoulIdentity,
      quirks:   partnerQuirks as QuirkRecord[],
    },
  ];

  const partnerFirstName = (partnerRow['name'] as string).split(' ')[0] ?? '';
  const context = `${soul.name.split(' ')[0]} and ${partnerFirstName} crossed paths in the ${floorName}.${prevHint}`;
  log(soul.name, `[proximity] Bumped into ${partnerRow['name'] as string} in ${floorName}`);
  await runConversation(participants, context, 8);
}

// Suppress unused import warning — JointVenture type referenced in venture flow
void (undefined as unknown as ReturnType<typeof String> & { _jv?: typeof import('../types').ActionType });
