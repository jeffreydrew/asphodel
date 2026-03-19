/**
 * Embed text using Together AI's embeddings endpoint (m2-bert-80M-8k-retrieval).
 * Returns null on any failure — never throws.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env['TOGETHER_API_KEY'] ?? '';
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.together.xyz/v1/embeddings', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body:   JSON.stringify({
        model: 'togethercomputer/m2-bert-80M-8k-retrieval',
        input: text,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;

    const data = await res.json() as { data?: Array<{ embedding?: number[] }> };
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}
