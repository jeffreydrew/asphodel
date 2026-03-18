const OLLAMA_URL         = process.env['OLLAMA_URL'] ?? 'http://localhost:11434';
const MODEL              = process.env['OLLAMA_MODEL'] ?? 'qwen2.5:7b';
const TIMEOUT_MS         = Number(process.env['OLLAMA_TIMEOUT_MS'] ?? 30_000);
const CONTENT_TIMEOUT_MS = Number(process.env['OLLAMA_CONTENT_TIMEOUT_MS'] ?? 90_000);

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  message: { content: string };
}

export class OllamaClient {
  private model: string;

  constructor(model = MODEL) {
    this.model = model;
  }

  async chat(
    messages: OllamaChatMessage[],
    opts: { json?: boolean; temperature?: number; long?: boolean } = {},
  ): Promise<string | null> {
    const body = {
      model:    this.model,
      messages,
      stream:   false,
      format:   opts.json ? 'json' : undefined,
      options:  { temperature: opts.temperature ?? 0.7 },
    };

    const timeout = opts.long ? CONTENT_TIMEOUT_MS : TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });

      if (!res.ok) {
        process.stderr.write(`[Ollama] HTTP ${res.status}: ${await res.text()}\n`);
        return null;
      }

      const data = await res.json() as OllamaChatResponse;
      return data.message.content.trim();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        process.stderr.write(`[Ollama] Request timed out after ${timeout}ms\n`);
      } else {
        process.stderr.write(`[Ollama] Error: ${String(err)}\n`);
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3_000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// Shared singleton for the process
export const ollama = new OllamaClient();
