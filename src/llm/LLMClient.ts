import { llmQueue } from './LlmQueue';

// ── Config ────────────────────────────────────────────────────────────────────
const GROQ_API_KEY     = process.env['GROQ_API_KEY'] ?? '';
const TOGETHER_API_KEY = process.env['TOGETHER_API_KEY'] ?? '';
const OLLAMA_URL       = process.env['OLLAMA_URL'] ?? 'http://localhost:11434';
const OLLAMA_MODEL     = process.env['OLLAMA_MODEL'] ?? 'qwen2.5:7b';
const TIMEOUT_MS         = Number(process.env['OLLAMA_TIMEOUT_MS'] ?? 30_000);
const CONTENT_TIMEOUT_MS = Number(process.env['OLLAMA_CONTENT_TIMEOUT_MS'] ?? 90_000);

const PRIMARY_PROVIDER  = (process.env['LLM_PRIMARY_PROVIDER'] ?? 'groq') as Provider;
const QUALITY_PROVIDER  = (process.env['LLM_QUALITY_PROVIDER'] ?? 'together') as Provider;
const FALLBACK_PROVIDER = (process.env['LLM_FALLBACK_PROVIDER'] ?? 'ollama') as Provider;

const GROQ_MODEL    = 'llama-3.3-70b-versatile';
const TOGETHER_MODEL = 'Qwen/Qwen2.5-72B-Instruct-Turbo';

type Provider = 'groq' | 'together' | 'ollama';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface ChatOpts {
  json?: boolean;
  temperature?: number;
  long?: boolean;
  quality?: boolean;
  model?: string;        // only used for Ollama fallback
  tools?: OpenAITool[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function providerForOpts(opts: ChatOpts): Provider {
  return (opts.long || opts.quality) ? QUALITY_PROVIDER : PRIMARY_PROVIDER;
}

async function doApiChat(
  provider: 'groq' | 'together',
  messages: ChatMessage[],
  opts: ChatOpts,
): Promise<string | ToolCall | null> {
  const isGroq    = provider === 'groq';
  const apiKey    = isGroq ? GROQ_API_KEY : TOGETHER_API_KEY;
  const endpoint  = isGroq
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : 'https://api.together.xyz/v1/chat/completions';
  const model     = isGroq ? GROQ_MODEL : TOGETHER_MODEL;

  if (!apiKey) return null;

  const timeout   = opts.long ? CONTENT_TIMEOUT_MS : TIMEOUT_MS;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeout);
  const start      = Date.now();

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature:  opts.temperature ?? 0.7,
    max_tokens:   opts.long ? 4096 : 1024,
  };
  if (opts.json)  body['response_format'] = { type: 'json_object' };
  if (opts.tools) body['tools'] = opts.tools;

  try {
    const res = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });

    const latency = Date.now() - start;

    if (!res.ok) {
      process.stderr.write(`[LLM] provider=${provider} HTTP ${res.status}: ${await res.text()}\n`);
      return null;
    }

    const data = await res.json() as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{ function: { name: string; arguments: string } }>;
        };
      }>;
      usage?: { total_tokens?: number };
    };

    const msg    = data.choices[0]?.message;
    const tokens = data.usage?.total_tokens ?? '?';
    process.stdout.write(`[LLM] provider=${provider} latency=${latency}ms tokens≈${tokens}\n`);

    if (msg?.tool_calls?.length) {
      const tc = msg.tool_calls[0]!.function;
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(tc.arguments) as Record<string, unknown>; } catch { /* ignore */ }
      return { name: tc.name, arguments: parsed };
    }

    return msg?.content?.trim() ?? null;
  } catch (err) {
    const latency = Date.now() - start;
    if ((err as Error).name === 'AbortError') {
      process.stderr.write(`[LLM] provider=${provider} timed out after ${latency}ms\n`);
    } else {
      process.stderr.write(`[LLM] provider=${provider} error: ${String(err)}\n`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function doOllamaChat(
  messages: ChatMessage[],
  opts: ChatOpts,
): Promise<string | null> {
  const model   = opts.model ?? OLLAMA_MODEL;
  const timeout = opts.long ? CONTENT_TIMEOUT_MS : TIMEOUT_MS;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeout);
  const start      = Date.now();

  const body = {
    model,
    messages,
    stream:  false,
    format:  opts.json ? 'json' : undefined,
    options: { temperature: opts.temperature ?? 0.7, num_predict: opts.long ? 4096 : 1024 },
  };

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });

    if (!res.ok) {
      process.stderr.write(`[LLM] provider=ollama HTTP ${res.status}: ${await res.text()}\n`);
      return null;
    }

    const data = await res.json() as { message: { content: string } };
    const latency = Date.now() - start;
    process.stdout.write(`[LLM] provider=ollama latency=${latency}ms\n`);
    return data.message.content.trim();
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      process.stderr.write(`[LLM] provider=ollama timed out after ${opts.long ? CONTENT_TIMEOUT_MS : TIMEOUT_MS}ms\n`);
    } else {
      process.stderr.write(`[LLM] provider=ollama error: ${String(err)}\n`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function callProvider(
  provider: Provider,
  messages: ChatMessage[],
  opts: ChatOpts,
): Promise<string | ToolCall | null> {
  if (provider === 'ollama') return doOllamaChat(messages, opts);
  return doApiChat(provider, messages, opts);
}

// ── LLMClient ─────────────────────────────────────────────────────────────────
export class LLMClient {
  // Overloads: callers without `tools` always get string | null
  async chat(messages: ChatMessage[], opts?: Omit<ChatOpts, 'tools'>): Promise<string | null>;
  async chat(messages: ChatMessage[], opts: ChatOpts & { tools: OpenAITool[] }): Promise<string | ToolCall | null>;
  async chat(
    messages: ChatMessage[],
    opts: ChatOpts = {},
  ): Promise<string | ToolCall | null> {
    return llmQueue.run(() => this._doChat(messages, opts));
  }

  private async _doChat(
    messages: ChatMessage[],
    opts: ChatOpts,
  ): Promise<string | ToolCall | null> {
    const chosen = providerForOpts(opts);

    const result = await callProvider(chosen, messages, opts);
    if (result !== null) return result;

    // Fallback
    if (FALLBACK_PROVIDER !== chosen) {
      process.stderr.write(`[LLM] ${chosen} failed, falling back to ${FALLBACK_PROVIDER}\n`);
      return callProvider(FALLBACK_PROVIDER, messages, opts);
    }

    return null;
  }

  async isAvailable(): Promise<boolean> {
    // Try primary, then quality, then Ollama
    const providers: Provider[] = [PRIMARY_PROVIDER, QUALITY_PROVIDER, FALLBACK_PROVIDER];
    for (const p of [...new Set(providers)]) {
      try {
        if (p === 'ollama') {
          const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3_000) });
          if (res.ok) return true;
        } else {
          const key = p === 'groq' ? GROQ_API_KEY : TOGETHER_API_KEY;
          if (!key) continue;
          // Minimal probe — single token
          const res = await callProvider(p, [{ role: 'user', content: 'hi' }], { long: false });
          if (res !== null) return true;
        }
      } catch { /* try next */ }
    }
    return false;
  }
}

// Shared singleton — drop-in replacement for the old `ollama` export
export const ollama = new LLMClient();
