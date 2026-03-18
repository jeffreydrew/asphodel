/**
 * Embed text using nomic-embed-text via the Ollama /api/embeddings endpoint.
 * Returns null on any failure — never throws.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const ollamaUrl = process.env['OLLAMA_URL'] ?? 'http://localhost:11434';
  const timeoutMs = Number(process.env['OLLAMA_TIMEOUT_MS'] ?? 30_000);

  try {
    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: 'nomic-embed-text', prompt: text }),
      signal:  AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) return null;

    const data = await res.json() as { embedding?: number[] };
    return data.embedding ?? null;
  } catch {
    return null;
  }
}
