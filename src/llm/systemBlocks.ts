import { buildIdentityPreamble } from './prompts';
import type { SoulIdentity, QuirkRecord, SoulGoal } from '../types';
import type { AnthropicContentBlock } from './AnthropicClient';

/**
 * Builds Anthropic system content blocks with ephemeral cache_control.
 *
 * Block 1: static identity preamble (name, bio, email, neighbours) — cached
 * Block 2: persisted quirks + active goals — cached
 *
 * These blocks are identical across all calls for the same soul within a tick,
 * so Anthropic's prompt cache serves them on the 2nd+ call (~80% token saving).
 *
 * Dynamic context (vitals, wallet, recent actions, directives) goes in the
 * USER message, not here.
 */
export function buildSystemBlocks(params: {
  identity: SoulIdentity;
  neighbours: string[];
  quirks: QuirkRecord[];
  goals: SoulGoal[];
}): AnthropicContentBlock[] {
  const { identity, neighbours, quirks, goals } = params;

  const blocks: AnthropicContentBlock[] = [
    {
      type:          'text',
      text:          buildIdentityPreamble(identity, neighbours),
      cache_control: { type: 'ephemeral' },
    },
  ];

  const persistedQuirks = quirks.filter(q => q.persisted);
  const quirksText = persistedQuirks.length > 0
    ? `Your known tendencies (earned over time):\n${persistedQuirks.map(q => {
        const level = q.strength > 0.7 ? 'strong' : q.strength > 0.4 ? 'medium' : 'developing';
        return `- ${q.trigger} [strength: ${level}]`;
      }).join('\n')}`
    : '';

  const goalsText = goals.length > 0
    ? `Your current goals:\n${goals.map(g => `- (P${g.priority}) ${g.goal_text}`).join('\n')}`
    : '';

  const block2 = [quirksText, goalsText].filter(Boolean).join('\n\n');
  if (block2) {
    blocks.push({
      type:          'text',
      text:          block2,
      cache_control: { type: 'ephemeral' },
    });
  }

  return blocks;
}
