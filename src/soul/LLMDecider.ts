import { ActionType } from '../types';
import type {
  Action,
  SoulVitals,
  SoulIdentity,
  RewardWeights,
  QuirkRecord,
  RewardComponents,
  WalletRow,
  DirectiveTask,
  SoulGoal,
  RegistryAction,
} from '../types';
import { ollama } from '../llm/OllamaClient';
import { buildDecisionPrompt } from '../llm/prompts';
import { HardcodedDecider } from './HardcodedDecider';
import { getRegistryActions, autoRegister } from '../world/ActionRegistry';

const fallback = new HardcodedDecider();

export class LLMDecider {
  async decide(
    identity: SoulIdentity,
    vitals: SoulVitals,
    weights: RewardWeights,
    wallet: WalletRow,
    quirks: QuirkRecord[],
    lastReward: RewardComponents | null,
    lastAction: ActionType | string | null,
    timeOfDay: string,
    directive?: string,
    neighbours?: string[],
    activeTask?: DirectiveTask | null,
    recentMemories?: string[],
    wildcard?: string,
    activeGoal?: SoulGoal | null,
    registryActions?: RegistryAction[],
    tick?: number,
    soulId?: string,
  ): Promise<Action & { reasoning?: string }> {
    const prompt = buildDecisionPrompt({
      identity,
      vitals,
      weights,
      wallet,
      quirks,
      lastReward,
      lastAction,
      timeOfDay,
      directive,
      neighbours,
      activeTask,
      recentMemories,
      wildcard,
      activeGoal,
      registryActions,
      tick,
    });

    const raw = await ollama.chat(
      [{ role: 'user', content: prompt }],
      { json: true, temperature: 0.75, model: identity.llm_model },
    );

    if (raw) {
      const parsed = await this.parseDecision(raw, soulId ?? identity.full_name);
      if (parsed) {
        return {
          type:        parsed.label,
          payload:     {},
          reasoning:   parsed.reasoning,
          story_hours: parsed.hours,
          description: parsed.description,
        };
      }
    }

    // Fallback: hardcoded decider when Ollama is unavailable or returns garbage
    const hardcodedAction = fallback.decide(vitals, weights, quirks, lastReward);
    return { ...hardcodedAction, reasoning: undefined };
  }

  private async parseDecision(
    raw: string,
    soulId: string,
  ): Promise<{ label: string; reasoning: string; hours: number; description: string } | null> {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      // Normalize action label
      let label = typeof parsed['action'] === 'string'
        ? parsed['action'].trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
        : '';
      if (!label || label === 'new') label = 'idle';

      // Auto-register unknown labels (not a known ActionType and not already in registry)
      const registryActions = await getRegistryActions();
      const knownLabels = new Set<string>([
        ...Object.values(ActionType),
        ...registryActions.map(a => a.label),
      ]);
      if (!knownLabels.has(label)) {
        const desc = typeof parsed['description'] === 'string' ? parsed['description'] : label;
        autoRegister(label, desc, soulId);
      }

      const hours = typeof parsed['hours'] === 'number'
        ? Math.max(1, Math.min(8, Math.round(parsed['hours'])))
        : 1;

      return {
        label,
        reasoning:   typeof parsed['reasoning']   === 'string' ? parsed['reasoning']   : '',
        description: typeof parsed['description'] === 'string' ? parsed['description'] : '',
        hours,
      };
    } catch {
      process.stderr.write(`[LLMDecider] JSON parse failed: ${raw.substring(0, 120)}\n`);
      return null;
    }
  }
}
