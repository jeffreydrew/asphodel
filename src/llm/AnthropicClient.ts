import Anthropic from '@anthropic-ai/sdk';
import { llmQueue } from './LlmQueue';
import { usageTracker } from './UsageTracker';

// ── Config ────────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY          = process.env['ANTHROPIC_API_KEY'] ?? '';
const ANTHROPIC_MODEL            = process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5-20251001';
const ANTHROPIC_MAX_TOKENS_SHORT = Number(process.env['ANTHROPIC_MAX_TOKENS_SHORT'] ?? 1024);
const ANTHROPIC_MAX_TOKENS_LONG  = Number(process.env['ANTHROPIC_MAX_TOKENS_LONG']  ?? 4096);
const AVAILABILITY_TTL           = 60_000; // 60s cache

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnthropicContentBlock = {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
};

export type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

export type AnthropicResponse = {
  text: string | null;
  toolUse: { id: string; name: string; input: Record<string, unknown> } | null;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  stopReason: string;
};

export interface ChatParams {
  systemBlocks: AnthropicContentBlock[];
  messages:     AnthropicMessage[];
  long?:        boolean;
  label?:       string;
  soulName?:    string;
  tools?:       Anthropic.Tool[];
}

// ── Availability cache ────────────────────────────────────────────────────────

let availabilityCache: { result: boolean; ts: number } | null = null;

// ── AnthropicClient ───────────────────────────────────────────────────────────

export class AnthropicClient {
  private sdk: Anthropic | null = null;

  private getSDK(): Anthropic | null {
    if (!ANTHROPIC_API_KEY) return null;
    if (!this.sdk) this.sdk = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    return this.sdk;
  }

  async chat(params: ChatParams): Promise<AnthropicResponse> {
    const sdk = this.getSDK();
    if (!sdk) {
      return {
        text: null, toolUse: null,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        stopReason: 'no_api_key',
      };
    }
    return llmQueue.run(() => this._doChat(sdk, params));
  }

  private async _doChat(sdk: Anthropic, params: ChatParams): Promise<AnthropicResponse> {
    const empty: AnthropicResponse = {
      text: null, toolUse: null,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      stopReason: 'error',
    };

    const maxTokens = params.long ? ANTHROPIC_MAX_TOKENS_LONG : ANTHROPIC_MAX_TOKENS_SHORT;
    const label     = params.label ?? 'llm';
    const start     = Date.now();

    try {
      const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
        model:      ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        messages:   params.messages as Anthropic.MessageParam[],
      };

      if (params.systemBlocks.length > 0) {
        requestParams.system = params.systemBlocks as Anthropic.TextBlockParam[];
      }

      if (params.tools && params.tools.length > 0) {
        requestParams.tools = params.tools;
      }

      const response = await sdk.messages.create(requestParams);
      const latency  = Date.now() - start;

      // cache_read/cache_creation are present when caching is active — cast to access
      const rawUsage  = response.usage as unknown as Record<string, number>;
      const usage = {
        input:      response.usage.input_tokens,
        output:     response.usage.output_tokens,
        cacheRead:  rawUsage['cache_read_input_tokens']        ?? 0,
        cacheWrite: rawUsage['cache_creation_input_tokens']    ?? 0,
      };

      process.stdout.write(
        `[AnthropicClient] [${label}] in=${usage.input} out=${usage.output} ` +
        `cache_read=${usage.cacheRead} cache_write=${usage.cacheWrite} latency=${latency}ms\n`,
      );

      usageTracker.record({
        soulName:   params.soulName ?? 'system',
        label,
        input:      usage.input,
        output:     usage.output,
        cacheRead:  usage.cacheRead,
        cacheWrite: usage.cacheWrite,
      });

      let text: string | null = null;
      let toolUse: AnthropicResponse['toolUse'] = null;

      for (const block of response.content) {
        if (block.type === 'text') {
          text = block.text;
        } else if (block.type === 'tool_use') {
          toolUse = {
            id:    block.id,
            name:  block.name,
            input: block.input as Record<string, unknown>,
          };
        }
      }

      return { text, toolUse, usage, stopReason: response.stop_reason ?? 'end_turn' };
    } catch (err) {
      const latency = Date.now() - start;
      process.stderr.write(`[AnthropicClient] [${label}] error after ${latency}ms: ${String(err)}\n`);
      return empty;
    }
  }

  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (availabilityCache && now - availabilityCache.ts < AVAILABILITY_TTL) {
      return availabilityCache.result;
    }

    const sdk = this.getSDK();
    if (!sdk) {
      availabilityCache = { result: false, ts: now };
      return false;
    }

    try {
      await sdk.messages.create({
        model:      ANTHROPIC_MODEL,
        max_tokens: 1,
        messages:   [{ role: 'user', content: 'hi' }],
      });
      availabilityCache = { result: true, ts: now };
      return true;
    } catch {
      availabilityCache = { result: false, ts: now };
      return false;
    }
  }
}

export const anthropicClient = new AnthropicClient();
