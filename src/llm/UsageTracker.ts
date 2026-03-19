/**
 * UsageTracker — in-memory ring buffer for Anthropic API usage.
 *
 * Records every LLM call with token counts, cost, soul name, and label.
 * Consumed by GET /stats for the frontend analytics panel.
 *
 * Pricing: claude-haiku-4-5 (per 1M tokens)
 *   Input:       $0.80  | Output:      $4.00
 *   Cache write: $1.00  | Cache read:  $0.08
 */

const PRICE_INPUT       = 0.80  / 1_000_000;
const PRICE_OUTPUT      = 4.00  / 1_000_000;
const PRICE_CACHE_WRITE = 1.00  / 1_000_000;
const PRICE_CACHE_READ  = 0.08  / 1_000_000;

const MAX_SAMPLES = 50_000;
const MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1_000;

export interface UsageSample {
  ts:         number;
  soulName:   string;
  label:      string;
  input:      number;
  output:     number;
  cacheRead:  number;
  cacheWrite: number;
  cost:       number;
}

interface Bucket {
  input:      number;
  output:     number;
  cacheRead:  number;
  cacheWrite: number;
  calls:      number;
  cost:       number;
}

function emptyBucket(): Bucket {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0, cost: 0 };
}

function addSample(b: Bucket, s: UsageSample): void {
  b.input      += s.input;
  b.output     += s.output;
  b.cacheRead  += s.cacheRead;
  b.cacheWrite += s.cacheWrite;
  b.calls++;
  b.cost       += s.cost;
}

export class UsageTracker {
  private samples: UsageSample[] = [];

  record(params: {
    soulName:   string;
    label:      string;
    input:      number;
    output:     number;
    cacheRead:  number;
    cacheWrite: number;
  }): void {
    const cost =
      params.input      * PRICE_INPUT       +
      params.output     * PRICE_OUTPUT      +
      params.cacheWrite * PRICE_CACHE_WRITE +
      params.cacheRead  * PRICE_CACHE_READ;

    this.samples.push({ ts: Date.now(), cost, ...params });

    if (this.samples.length > MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    }
    const cutoff = Date.now() - MAX_AGE_MS;
    const firstValid = this.samples.findIndex(s => s.ts >= cutoff);
    if (firstValid > 0) this.samples.splice(0, firstValid);
  }

  getStats(windowMs: number): {
    totals:   Bucket & { cacheHitRate: number };
    bySoul:   Record<string, Bucket>;
    timeline: Array<{ ts: number } & Bucket>;
    bucketMs: number;
  } {
    const cutoff = Date.now() - windowMs;
    const window = this.samples.filter(s => s.ts >= cutoff);

    const totals = emptyBucket();
    const bySoul: Record<string, Bucket> = {};

    for (const s of window) {
      addSample(totals, s);
      if (!bySoul[s.soulName]) bySoul[s.soulName] = emptyBucket();
      addSample(bySoul[s.soulName]!, s);
    }

    const cacheHitRate = totals.input + totals.cacheRead > 0
      ? totals.cacheRead / (totals.input + totals.cacheRead)
      : 0;

    // Build timeline with ~24 buckets
    const NUM_BUCKETS = 24;
    const bucketMs    = Math.max(Math.ceil(windowMs / NUM_BUCKETS), 60_000);
    const bucketMap   = new Map<number, Bucket>();

    for (const s of window) {
      const key = Math.floor(s.ts / bucketMs) * bucketMs;
      if (!bucketMap.has(key)) bucketMap.set(key, emptyBucket());
      addSample(bucketMap.get(key)!, s);
    }

    // Fill empty buckets so chart has continuous bars
    const firstBucket = Math.floor(cutoff / bucketMs) * bucketMs;
    const lastBucket  = Math.floor(Date.now() / bucketMs) * bucketMs;
    for (let t = firstBucket; t <= lastBucket; t += bucketMs) {
      if (!bucketMap.has(t)) bucketMap.set(t, emptyBucket());
    }

    const timeline = Array.from(bucketMap.entries())
      .map(([ts, b]) => ({ ts, ...b }))
      .sort((a, b) => a.ts - b.ts);

    return { totals: { ...totals, cacheHitRate }, bySoul, timeline, bucketMs };
  }
}

export const usageTracker = new UsageTracker();
