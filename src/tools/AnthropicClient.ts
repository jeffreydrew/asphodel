import Anthropic from '@anthropic-ai/sdk';
import type { AIConsultResult } from '../types';

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export async function consultClaude(question: string): Promise<AIConsultResult | null> {
  const sdk = getClient();
  if (!sdk) return null;

  try {
    const message = await sdk.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: question }],
    });

    const block = message.content[0];
    if (!block || block.type !== 'text') return null;

    return {
      question,
      answer:       block.text,
      model:        message.model,
      input_tokens: message.usage.input_tokens,
    };
  } catch (err) {
    process.stderr.write(`[AnthropicClient] error: ${String(err)}\n`);
    return null;
  }
}
