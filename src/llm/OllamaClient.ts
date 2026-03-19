/**
 * OllamaClient — compatibility adapter for legacy call sites.
 *
 * LLMDecider, ConversationLoop, and httpServer import `ollama` from here and
 * call `ollama.chat([{role,content}], opts)`. Those files are not changed.
 *
 * This adapter proxies all calls to AnthropicClient with empty system blocks
 * (no caching benefit, but correct behaviour). AgentLoop builds real system
 * blocks and calls anthropicClient directly for cached calls.
 */

import { anthropicClient } from './AnthropicClient';
import type { AnthropicMessage } from './AnthropicClient';

class OllamaAdapter {
  async chat(
    messages: Array<{ role: string; content: string }>,
    _opts?: { json?: boolean; temperature?: number; long?: boolean; model?: string },
  ): Promise<string | null> {
    const response = await anthropicClient.chat({
      systemBlocks: [],
      messages:     messages as AnthropicMessage[],
      long:         _opts?.long,
      label:        'legacy',
    });
    return response.text;
  }

  async isAvailable(): Promise<boolean> {
    return anthropicClient.isAvailable();
  }
}

export const ollama = new OllamaAdapter();
export { OllamaAdapter as OllamaClient };
