import { browserPool } from './BrowserPool';
import { sessionStore } from './SessionStore';
import { searchIndeed, searchCraigslist, searchMturk } from './tools/JobSearchTool';
import { fillForm, submitForm, buildApplicationFields } from './tools/FormFillTool';
import { browseEbay } from './tools/EbayTool';
import { ActionType } from '../types';
import type { Action, ActionResult, SoulVitals, SoulIdentity, JobListing } from '../types';

export class BrowserAgent {
  async run(
    action: Action,
    vitals: SoulVitals,
    identity: SoulIdentity,
    soulId: string,
  ): Promise<ActionResult | null> {
    const enabled = await browserPool.isEnabled();
    if (!enabled) return null;

    switch (action.type) {
      case ActionType.BROWSE_JOBS:    return this.browseJobs(vitals, identity, soulId);
      case ActionType.SUBMIT_APP:     return this.submitApplication(vitals, identity, soulId, action);
      default:                        return null; // other actions use simulated executor
    }
  }

  // ─── Browse Jobs ─────────────────────────────────────────────────────────────

  private async browseJobs(
    vitals: SoulVitals,
    identity: SoulIdentity,
    soulId: string,
  ): Promise<ActionResult> {
    const query   = identity.skills_public.slice(0, 2).join(' ') + ' remote';
    const context = await browserPool.getContext(soulId);

    const [indeedResult, craigslistResult, mturkResult] = await Promise.allSettled([
      searchIndeed(context, query, 3),
      searchCraigslist(context, query, 2),
      searchMturk(context, 3),
    ]);

    const jobs: JobListing[] = [
      ...(indeedResult.status      === 'fulfilled' ? indeedResult.value      : []),
      ...(craigslistResult.status  === 'fulfilled' ? craigslistResult.value  : []),
      ...(mturkResult.status       === 'fulfilled' ? mturkResult.value       : []),
    ];

    await browserPool.saveContext(soulId);
    sessionStore.upsert(soulId, 'indeed');
    sessionStore.upsert(soulId, 'craigslist');

    const found = jobs.length > 0;
    const energyCost = 8;

    return {
      action:          ActionType.BROWSE_JOBS,
      success:         true,
      description:     found
        ? `Real browser search: found ${jobs.length} listings (Indeed, Craigslist, MTurk)`
        : 'Real browser search: no listings found right now.',
      profit_delta:    0,
      social_delta:    found ? 2 : 0,
      health_delta:    0,
      penalty:         0,
      vitals_after:    {
        ...vitals,
        energy:    Math.max(0, vitals.energy - energyCost),
        happiness: Math.min(100, vitals.happiness + (found ? 4 : -1)),
      },
      tos_violation:    false,
      deceptive_content: false,
      metadata:         { jobs: jobs.slice(0, 5), real_browser: true, found_count: jobs.length },
    };
  }

  // ─── Submit Application ───────────────────────────────────────────────────────

  private async submitApplication(
    vitals: SoulVitals,
    identity: SoulIdentity,
    soulId: string,
    action: Action,
  ): Promise<ActionResult> {
    const context = await browserPool.getContext(soulId);
    const page    = await context.newPage();

    let success = false;
    let earn    = 0;
    let description = 'Submitted a job application.';

    try {
      const targetUrl = (action.payload['job_url'] as string | undefined) ?? 'https://www.indeed.com';
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });

      const fields = buildApplicationFields({
        fullName:    identity.full_name,
        email:       identity.email,
        coverLetter: `Hi, I'm ${identity.full_name}. ${identity.bio} I'd love to help with this task.`,
      });

      await fillForm(page, fields);

      const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
      if (submitBtn) {
        const result = await submitForm(page, 'button[type="submit"]');
        success      = result.success;
        earn         = success ? parseFloat((Math.random() * 3 + 0.5).toFixed(2)) : 0;
        description  = success
          ? `Application submitted via real browser. Earned $${earn.toFixed(2)} (abstract).`
          : 'Application form filled but submit button not found.';
      }
    } catch (err) {
      description = `Application attempt failed: ${String(err).substring(0, 80)}`;
    } finally {
      await page.close();
      await browserPool.saveContext(soulId);
    }

    if (success) {
      sessionStore.upsert(soulId, 'indeed', {
        tasks_completed:      1,
        abstract_earned_here: earn,
      });
    }

    return {
      action:          ActionType.SUBMIT_APP,
      success,
      description,
      profit_delta:    earn,
      social_delta:    0,
      health_delta:    0,
      penalty:         0,
      vitals_after:    {
        ...vitals,
        energy:    Math.max(0, vitals.energy - 15),
        happiness: Math.min(100, vitals.happiness + (success ? 8 : -3)),
      },
      tos_violation:    false,
      deceptive_content: false,
      metadata:         { real_browser: true, success, earn },
    };
  }
}

export const browserAgent = new BrowserAgent();
