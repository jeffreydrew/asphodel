import type { WebSearchResult, WebSearchFindings } from '../types';

const BRAVE_URL  = 'https://api.search.brave.com/res/v1/web/search';
const SERPER_URL = 'https://google.serper.dev/search';

export async function webSearch(query: string): Promise<WebSearchFindings | null> {
  const braveKey  = process.env['BRAVE_API_KEY'];
  const serperKey = process.env['SERPER_API_KEY'];

  if (!braveKey && !serperKey) return null;

  try {
    if (serperKey) {
      return await searchViaSerper(query, serperKey);
    }
    return await searchViaBrave(query, braveKey!);
  } catch (err) {
    process.stderr.write(`[WebSearchTool] error: ${String(err)}\n`);
    return null;
  }
}

async function searchViaBrave(query: string, apiKey: string): Promise<WebSearchFindings | null> {
  const url = `${BRAVE_URL}?q=${encodeURIComponent(query)}&count=5`;
  const res  = await fetch(url, {
    headers: {
      'Accept':               'application/json',
      'Accept-Encoding':      'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!res.ok) {
    process.stderr.write(`[WebSearchTool] Brave returned ${res.status}\n`);
    return null;
  }

  const data = await res.json() as {
    web?: { results?: Array<{ title: string; url: string; description?: string }> };
  };

  const items = data.web?.results ?? [];
  if (!items.length) return null;

  const results: WebSearchResult[] = items.slice(0, 5).map(r => ({
    title:   r.title,
    url:     r.url,
    snippet: r.description ?? '',
  }));

  return { query, results, source: 'brave' };
}

async function searchViaSerper(query: string, apiKey: string): Promise<WebSearchFindings | null> {
  const res = await fetch(SERPER_URL, {
    method:  'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ q: query, num: 5 }),
  });

  if (!res.ok) {
    process.stderr.write(`[WebSearchTool] Serper returned ${res.status}\n`);
    return null;
  }

  const data = await res.json() as {
    organic?: Array<{ title: string; link: string; snippet?: string }>;
  };

  const items = data.organic ?? [];
  if (!items.length) return null;

  const results: WebSearchResult[] = items.slice(0, 5).map(r => ({
    title:   r.title,
    url:     r.link,
    snippet: r.snippet ?? '',
  }));

  return { query, results, source: 'serper' };
}
