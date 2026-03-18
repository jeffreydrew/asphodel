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
} from '../types';
import { ollama } from '../llm/OllamaClient';
import { buildDecisionPrompt } from '../llm/prompts';
import { HardcodedDecider } from './HardcodedDecider';

const VALID_ACTIONS = new Set<string>(Object.values(ActionType));
const fallback = new HardcodedDecider();

interface DecisionResponse {
  action: string;
  reasoning: string;
}

export class LLMDecider {
  async decide(
    identity: SoulIdentity,
    vitals: SoulVitals,
    weights: RewardWeights,
    wallet: WalletRow,
    quirks: QuirkRecord[],
    lastReward: RewardComponents | null,
    lastAction: ActionType | null,
    timeOfDay: string,
    directive?: string,
    neighbours?: string[],
    activeTask?: DirectiveTask | null,
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
    });

    const raw = await ollama.chat(
      [{ role: 'user', content: prompt }],
      { json: true, temperature: 0.75 },
    );

    if (raw) {
      const parsed = this.parseDecision(raw);
      if (parsed) {
        return { type: parsed.action, payload: { reasoning: parsed.reasoning }, reasoning: parsed.reasoning };
      }
    }

    // Fallback: hardcoded decider when Ollama is unavailable or returns garbage
    const hardcodedAction = fallback.decide(vitals, weights, quirks, lastReward);
    return { ...hardcodedAction, reasoning: undefined };
  }

  private parseDecision(raw: string): { action: ActionType; reasoning: string } | null {
    try {
      const parsed = JSON.parse(raw) as Partial<DecisionResponse>;
      const action = parsed.action?.trim().toLowerCase();

      if (!action || !VALID_ACTIONS.has(action)) {
        process.stderr.write(`[LLMDecider] Invalid action in response: ${raw.substring(0, 120)}\n`);
        return null;
      }

      return {
        action:    action as ActionType,
        reasoning: parsed.reasoning ?? '',
      };
    } catch {
      process.stderr.write(`[LLMDecider] JSON parse failed: ${raw.substring(0, 120)}\n`);
      return null;
    }
  }
}
