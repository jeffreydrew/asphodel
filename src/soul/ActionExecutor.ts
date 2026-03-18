import { ActionType } from '../types';
import type { Action, ActionResult, SoulVitals, SoulIdentity } from '../types';
import { browserAgent } from '../browser/BrowserAgent';

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

function applyVitalsDelta(
  vitals: SoulVitals,
  delta: Partial<SoulVitals>,
): SoulVitals {
  return {
    hunger:     clamp(vitals.hunger     + (delta.hunger     ?? 0)),
    energy:     clamp(vitals.energy     + (delta.energy     ?? 0)),
    health:     clamp(vitals.health     + (delta.health     ?? 0)),
    happiness:  clamp(vitals.happiness  + (delta.happiness  ?? 0)),
    sleep_debt: clamp(vitals.sleep_debt + (delta.sleep_debt ?? 0)),
  };
}

// Passive vitals drift: hunger rises, energy falls, sleep debt rises over time.
// Called once per tick to simulate continuous biological decay.
export function applyPassiveDrift(vitals: SoulVitals): SoulVitals {
  return applyVitalsDelta(vitals, {
    hunger:     +3,
    energy:     -2,
    sleep_debt: +2,
  });
}

export class ActionExecutor {
  async run(action: Action, vitals: SoulVitals, identity?: SoulIdentity, soulId?: string): Promise<ActionResult> {
    // Try real browser execution first (Phase 3)
    if (identity && soulId) {
      const browserResult = await browserAgent.run(action, vitals, identity, soulId);
      if (browserResult) return browserResult;
    }

    // Fall back to simulation
    switch (action.type) {
      case ActionType.EAT:            return this.eat(vitals);
      case ActionType.REST:           return this.rest(vitals);
      case ActionType.EXERCISE:       return this.exercise(vitals);
      case ActionType.BROWSE_JOBS:    return this.browseJobs(vitals);
      case ActionType.SUBMIT_APP:     return this.submitApp(vitals);
      case ActionType.CREATE_CONTENT: return this.createContent(vitals);
      case ActionType.MEET_SOUL:      return this.meetSoul(vitals);
      case ActionType.SOCIAL_POST:    return this.socialPost(vitals);
      case ActionType.IDLE:           return this.idle(vitals);
      // Library actions
      case ActionType.READ_BOOK:      return this.readBook(vitals);
      case ActionType.WRITE_BOOK:     return this.writeBook(vitals);
      case ActionType.CREATE_ART:     return this.createArt(vitals);
      case ActionType.BROWSE_WEB:     return this.browseWeb(vitals);
    }
  }

  private eat(vitals: SoulVitals): ActionResult {
    const hungerRelief = Math.min(vitals.hunger, 40);
    const vitals_after = applyVitalsDelta(vitals, {
      hunger:    -hungerRelief,
      happiness: +5,
      energy:    +5,
    });
    return this.result(ActionType.EAT, vitals_after, {
      description: 'Had a meal. Hunger satisfied.',
      health_delta: hungerRelief * 0.1,
    });
  }

  private rest(vitals: SoulVitals): ActionResult {
    const sleepRelief = Math.min(vitals.sleep_debt, 30);
    const vitals_after = applyVitalsDelta(vitals, {
      energy:     +25,
      sleep_debt: -sleepRelief,
      hunger:     +5,
    });
    return this.result(ActionType.REST, vitals_after, {
      description: 'Rested and recharged.',
      health_delta: sleepRelief * 0.05,
    });
  }

  private exercise(vitals: SoulVitals): ActionResult {
    const vitals_after = applyVitalsDelta(vitals, {
      health:    +8,
      energy:    -15,
      hunger:    +10,
      happiness: +6,
    });
    return this.result(ActionType.EXERCISE, vitals_after, {
      description: 'Worked out. Feeling stronger.',
      health_delta: 8,
    });
  }

  private browseJobs(vitals: SoulVitals): ActionResult {
    const found = Math.random() < 0.7; // 70% chance of finding something interesting
    const vitals_after = applyVitalsDelta(vitals, {
      energy:    -5,
      happiness: found ? +3 : -2,
    });
    return this.result(ActionType.BROWSE_JOBS, vitals_after, {
      description: found
        ? 'Browsed job boards. Found 3 promising micro-tasks.'
        : 'Browsed job boards. Slim pickings today.',
      metadata: { found_jobs: found ? Math.floor(Math.random() * 4) + 1 : 0 },
    });
  }

  private submitApp(vitals: SoulVitals): ActionResult {
    const accepted = Math.random() < 0.4; // 40% acceptance rate
    const earn     = accepted ? parseFloat((Math.random() * 4 + 0.5).toFixed(2)) : 0;
    const vitals_after = applyVitalsDelta(vitals, {
      energy:    -10,
      happiness: accepted ? +8 : -3,
    });
    return this.result(ActionType.SUBMIT_APP, vitals_after, {
      description: accepted
        ? `Application accepted! Earned $${earn.toFixed(2)}.`
        : 'Application submitted. No response yet.',
      profit_delta: earn,
      metadata:     { accepted, earn },
    });
  }

  private createContent(vitals: SoulVitals): ActionResult {
    const quality     = Math.random(); // 0–1
    const earn        = parseFloat((quality * 3).toFixed(2));
    const socialBoost = Math.round(quality * 20);
    const vitals_after = applyVitalsDelta(vitals, {
      energy:    -20,
      happiness: +10,
      hunger:    +8,
    });
    return this.result(ActionType.CREATE_CONTENT, vitals_after, {
      description: `Created content. Quality score: ${Math.round(quality * 100)}/100.`,
      profit_delta: earn,
      social_delta: socialBoost,
      metadata:     { quality: Math.round(quality * 100), earn },
    });
  }

  private meetSoul(vitals: SoulVitals): ActionResult {
    const went_well = Math.random() < 0.8;
    const vitals_after = applyVitalsDelta(vitals, {
      happiness:  went_well ? +12 : -5,
      energy:     -8,
    });
    return this.result(ActionType.MEET_SOUL, vitals_after, {
      description: went_well
        ? 'Had a great conversation with another soul.'
        : 'The meeting was awkward. Maybe next time.',
      social_delta: went_well ? 15 : -5,
      metadata:     { went_well },
    });
  }

  private socialPost(vitals: SoulVitals): ActionResult {
    const engagement  = Math.random();
    const socialBoost = Math.round(engagement * 25);
    const vitals_after = applyVitalsDelta(vitals, {
      energy:    -5,
      happiness: socialBoost > 12 ? +5 : 0,
    });
    return this.result(ActionType.SOCIAL_POST, vitals_after, {
      description: `Posted online. Engagement: ${Math.round(engagement * 100)}/100.`,
      social_delta: socialBoost,
      metadata:     { engagement: Math.round(engagement * 100) },
    });
  }

  private idle(vitals: SoulVitals): ActionResult {
    const vitals_after = applyVitalsDelta(vitals, {
      energy:    +3,
      happiness: -2,
    });
    return this.result(ActionType.IDLE, vitals_after, {
      description: 'Doing nothing in particular.',
    });
  }

  private readBook(vitals: SoulVitals): ActionResult {
    const absorbed = Math.random();
    const vitals_after = applyVitalsDelta(vitals, {
      happiness: absorbed > 0.5 ? +8 : +4,
      energy:    -5,
      health:    +3,
    });
    return this.result(ActionType.READ_BOOK, vitals_after, {
      description: absorbed > 0.5
        ? 'Got lost in a book. Mind feels sharp.'
        : 'Read for a while. Peaceful.',
      social_delta: Math.round(absorbed * 5),
      metadata: { absorbed: Math.round(absorbed * 100) },
    });
  }

  private writeBook(vitals: SoulVitals): ActionResult {
    const quality     = Math.random();
    const earn        = parseFloat((quality * 2).toFixed(2));
    const socialBoost = Math.round(quality * 15);
    const vitals_after = applyVitalsDelta(vitals, {
      energy:    -18,
      happiness: +12,
      hunger:    +6,
    });
    return this.result(ActionType.WRITE_BOOK, vitals_after, {
      description: `Wrote in the library. Quality: ${Math.round(quality * 100)}/100.`,
      profit_delta: earn,
      social_delta: socialBoost,
      metadata: { quality: Math.round(quality * 100), earn, work_type: 'writing' },
    });
  }

  private createArt(vitals: SoulVitals): ActionResult {
    const quality     = Math.random();
    const earn        = parseFloat((quality * 2.5).toFixed(2));
    const socialBoost = Math.round(quality * 18);
    const vitals_after = applyVitalsDelta(vitals, {
      energy:    -15,
      happiness: +14,
      hunger:    +5,
    });
    return this.result(ActionType.CREATE_ART, vitals_after, {
      description: `Created a piece of art. Expressed something real.`,
      profit_delta: earn,
      social_delta: socialBoost,
      metadata: { quality: Math.round(quality * 100), earn, work_type: 'art' },
    });
  }

  private browseWeb(vitals: SoulVitals): ActionResult {
    const found_something = Math.random() < 0.75;
    const vitals_after = applyVitalsDelta(vitals, {
      energy:    -8,
      happiness: found_something ? +6 : +1,
      health:    +2,
    });
    return this.result(ActionType.BROWSE_WEB, vitals_after, {
      description: found_something
        ? 'Researched online. Found something interesting.'
        : 'Browsed the web. Nothing remarkable.',
      social_delta: found_something ? 8 : 2,
      metadata: { found_something, work_type: 'research' },
    });
  }

  private result(
    action: ActionType,
    vitals_after: SoulVitals,
    overrides: Partial<ActionResult>,
  ): ActionResult {
    return {
      action,
      success:          true,
      description:      '',
      profit_delta:     0,
      social_delta:     0,
      health_delta:     0,
      penalty:          0,
      tos_violation:    false,
      deceptive_content: false,
      metadata:         {},
      ...overrides,
      vitals_after,
    };
  }
}
