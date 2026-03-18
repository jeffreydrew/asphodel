import type { BrowserContext } from 'playwright';

export interface EbayItem {
  id: string;
  title: string;
  price: string;
  condition: string;
  url: string;
  seller: string;
}

export interface EbayListingDraft {
  title: string;
  description: string;
  price: number;
  condition: 'new' | 'used_like_new' | 'used_good' | 'used_acceptable';
  category: string;
}

export async function browseEbay(
  context: BrowserContext,
  query: string,
  limit = 5,
): Promise<EbayItem[]> {
  const page = await context.newPage();
  const items: EbayItem[] = [];

  try {
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sacat=0&LH_BIN=1`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(1_000 + Math.random() * 500);

    const cards = await page.$$('.s-item:not(.s-item--placeholder)');

    for (const card of cards.slice(0, limit)) {
      const id     = (await card.getAttribute('id')) ?? crypto.randomUUID();
      const title  = await card.$eval('.s-item__title', el => el.textContent?.trim() ?? '').catch(() => '');
      const price  = await card.$eval('.s-item__price',  el => el.textContent?.trim() ?? '').catch(() => '');
      const cond   = await card.$eval('.SECONDARY_INFO', el => el.textContent?.trim() ?? '').catch(() => 'Unknown');
      const url    = await card.$eval('a.s-item__link',  el => el.getAttribute('href') ?? '').catch(() => '');
      const seller = await card.$eval('.s-item__seller-info-text', el => el.textContent?.trim() ?? '').catch(() => '');

      if (!title || title === 'Shop on eBay') continue;

      items.push({ id, title, price, condition: cond, url, seller });
    }
  } catch (err) {
    process.stderr.write(`[EbayTool/browse] ${String(err)}\n`);
  } finally {
    await page.close();
  }

  return items;
}

// Abstract listing: navigates eBay sell flow but records listing as abstract
// (no real submission; real listing requires seller account setup)
export async function createAbstractListing(
  context: BrowserContext,
  draft: EbayListingDraft,
): Promise<{ success: boolean; abstractId: string }> {
  const page = await context.newPage();
  let success = false;

  try {
    await page.goto('https://www.ebay.com/sl/sell', {
      waitUntil: 'domcontentloaded',
      timeout:   20_000,
    });
    await page.waitForTimeout(1_000);

    // Check if we're logged in (seller dashboard visible)
    const loggedIn = await page.$('.selling-hub').then(el => !!el).catch(() => false);
    success = loggedIn;
  } catch (err) {
    process.stderr.write(`[EbayTool/list] ${String(err)}\n`);
  } finally {
    await page.close();
  }

  return {
    success,
    abstractId: `ABSTRACT-EBAY-${Date.now()}`,
  };
}
