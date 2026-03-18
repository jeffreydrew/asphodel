import type { BrowserContext } from 'playwright';
import type { JobListing } from '../../types';

// ─── Indeed ───────────────────────────────────────────────────────────────────

export async function searchIndeed(
  context: BrowserContext,
  query: string,
  limit = 5,
): Promise<JobListing[]> {
  const page = await context.newPage();
  const jobs: JobListing[] = [];

  try {
    const url = `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}&l=remote&remotejob=032b3046-06a3-4876-8dfd-474eb5e7ed11`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(1_500 + Math.random() * 500); // human-like pause

    const cards = await page.$$('[data-jk]');

    for (const card of cards.slice(0, limit)) {
      const jk     = (await card.getAttribute('data-jk')) ?? crypto.randomUUID();
      const title   = await card.$eval('[data-testid="jobTitle"] span', el => el.textContent?.trim() ?? '').catch(() => 'Unknown Role');
      const company = await card.$eval('[data-testid="company-name"]', el => el.textContent?.trim() ?? '').catch(() => 'Unknown');
      const loc     = await card.$eval('[data-testid="text-location"]', el => el.textContent?.trim() ?? 'Remote').catch(() => 'Remote');
      const pay     = await card.$eval('[class*="salary"]', el => el.textContent?.trim()).catch(() => null);
      const snippet = await card.$eval('[class*="snippet"]', el => el.textContent?.trim() ?? '').catch(() => '');

      jobs.push({
        id:          jk,
        title,
        company,
        location:    loc,
        pay,
        description: snippet,
        url:         `https://www.indeed.com/viewjob?jk=${jk}`,
        platform:    'indeed',
      });
    }
  } catch (err) {
    process.stderr.write(`[JobSearch/Indeed] ${String(err)}\n`);
  } finally {
    await page.close();
  }

  return jobs;
}

// ─── Craigslist ───────────────────────────────────────────────────────────────

export async function searchCraigslist(
  context: BrowserContext,
  query: string,
  limit = 5,
): Promise<JobListing[]> {
  const page = await context.newPage();
  const jobs: JobListing[] = [];

  try {
    const url = `https://newyork.craigslist.org/search/cpg?query=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(1_000 + Math.random() * 500);

    const listings = await page.$$('.cl-search-result');

    for (const listing of listings.slice(0, limit)) {
      const pid   = (await listing.getAttribute('data-pid')) ?? crypto.randomUUID();
      const title = await listing.$eval('.posting-title', el => el.textContent?.trim() ?? '').catch(() => 'Unknown');
      const href  = await listing.$eval('a.posting-title', el => el.getAttribute('href') ?? '').catch(() => '');

      if (!title) continue;

      jobs.push({
        id:          pid,
        title,
        company:     'Craigslist Poster',
        location:    'Remote / NYC',
        pay:         null,
        description: title,
        url:         href.startsWith('http') ? href : `https://newyork.craigslist.org${href}`,
        platform:    'craigslist',
      });
    }
  } catch (err) {
    process.stderr.write(`[JobSearch/Craigslist] ${String(err)}\n`);
  } finally {
    await page.close();
  }

  return jobs;
}

// ─── MTurk HIT Search ─────────────────────────────────────────────────────────

export async function searchMturk(
  context: BrowserContext,
  limit = 5,
): Promise<JobListing[]> {
  const page = await context.newPage();
  const hits: JobListing[] = [];

  try {
    await page.goto('https://worker.mturk.com/', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(1_500);

    const rows = await page.$$('[data-task-group-id]');

    for (const row of rows.slice(0, limit)) {
      const id    = (await row.getAttribute('data-task-group-id')) ?? crypto.randomUUID();
      const title = await row.$eval('.task-title', el => el.textContent?.trim() ?? '').catch(() => 'HIT Task');
      const pay   = await row.$eval('.reward', el => el.textContent?.trim()).catch(() => null);
      const desc  = await row.$eval('.task-description', el => el.textContent?.trim() ?? '').catch(() => '');

      hits.push({
        id,
        title,
        company:     'Amazon Mechanical Turk',
        location:    'Remote',
        pay,
        description: desc,
        url:         `https://worker.mturk.com/tasks/${id}`,
        platform:    'mturk',
      });
    }
  } catch (err) {
    process.stderr.write(`[JobSearch/MTurk] ${String(err)}\n`);
  } finally {
    await page.close();
  }

  return hits;
}
