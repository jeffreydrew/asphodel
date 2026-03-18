import { chromium } from 'playwright';
import type { Browser, BrowserContext } from 'playwright';
import path from 'path';
import fs from 'fs';

const CONTEXTS_DIR = process.env.BROWSER_CONTEXTS_DIR ?? './browser-contexts';
const ENABLED      = process.env.ENABLE_BROWSER === 'true';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

class BrowserPool {
  private _browser: Browser | null = null;
  private _contexts = new Map<string, BrowserContext>();
  private _available: boolean | null = null;

  async isEnabled(): Promise<boolean> {
    if (!ENABLED) return false;
    if (this._available !== null) return this._available;

    try {
      await this.getBrowser();
      this._available = true;
    } catch {
      this._available = false;
    }
    return this._available;
  }

  async getContext(soulId: string): Promise<BrowserContext> {
    if (this._contexts.has(soulId)) {
      return this._contexts.get(soulId)!;
    }

    const browser   = await this.getBrowser();
    const stateFile = path.join(CONTEXTS_DIR, soulId, 'state.json');

    const context = await browser.newContext({
      storageState: fs.existsSync(stateFile) ? stateFile : undefined,
      userAgent:    USER_AGENT,
      viewport:     { width: 1280, height: 720 },
      locale:       'en-US',
      timezoneId:   'America/New_York',
    });

    this._contexts.set(soulId, context);
    return context;
  }

  async saveContext(soulId: string): Promise<void> {
    const context = this._contexts.get(soulId);
    if (!context) return;

    const dir = path.join(CONTEXTS_DIR, soulId);
    fs.mkdirSync(dir, { recursive: true });
    await context.storageState({ path: path.join(dir, 'state.json') });
  }

  async closeAll(): Promise<void> {
    for (const [id, context] of this._contexts) {
      await this.saveContext(id);
      await context.close();
    }
    this._contexts.clear();
    await this._browser?.close();
    this._browser = null;
  }

  private async getBrowser(): Promise<Browser> {
    if (!this._browser) {
      this._browser = await chromium.launch({ headless: true });
    }
    return this._browser;
  }
}

export const browserPool = new BrowserPool();
