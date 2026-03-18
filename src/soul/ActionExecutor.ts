import type { Action, ActionResult, SoulVitals, SoulIdentity } from '../types';
import { browserAgent } from '../browser/BrowserAgent';
import { toolRouter } from '../tools/ToolRouter';
import { getRegistryActions } from '../world/ActionRegistry';
import { placeObject, modifyObject, giftObject } from '../world/WorldObjectManager';

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

export function applyPassiveDrift(vitals: SoulVitals): SoulVitals {
  return applyVitalsDelta(vitals, {
    hunger:     +3,
    energy:     -2,
    sleep_debt: +2,
  });
}

export class ActionExecutor {
  async run(
    action: Action,
    vitals: SoulVitals,
    identity?: SoulIdentity,
    soulId?: string,
  ): Promise<ActionResult> {
    if (identity && soulId) {
      const browserResult = await browserAgent.run(action, vitals, identity, soulId);
      if (browserResult) return browserResult;

      const toolResult = await toolRouter.run(action, vitals, identity, soulId);
      if (toolResult) return toolResult;
    }

    return this.runRegistryAction(action, vitals, soulId);
  }

  private async runRegistryAction(
    action: Action,
    vitals: SoulVitals,
    soulId?: string,
  ): Promise<ActionResult> {
    const registryActions = await getRegistryActions();
    const reg = registryActions.find(r => r.label === action.type);

    const effect = reg?.vitals_effect ?? { energy: -1 };

    let objectMeta: Record<string, unknown> = {};
    if (soulId) {
      if (action.type === 'place_object') {
        const obj = await placeObject(soulId, {
          label: String(action.payload['label'] ?? 'object'),
          floor: Number(action.payload['floor'] ?? 0),
        });
        objectMeta = { placed_object: obj.id, label: obj.label };
      } else if (action.type === 'modify_object' && action.payload['object_id']) {
        const obj = await modifyObject(soulId, {
          object_id: String(action.payload['object_id']),
          ...action.payload,
        });
        objectMeta = { modified_object: obj?.id };
      } else if (action.type === 'gift_object' && action.payload['object_id'] && action.payload['to_soul_id']) {
        const obj = await giftObject(
          soulId,
          String(action.payload['to_soul_id']),
          String(action.payload['object_id']),
        );
        objectMeta = { gifted_object: obj?.id, to: action.payload['to_soul_id'] };
      }
    }

    const vitals_after = applyVitalsDelta(vitals, effect);
    return this.result(action.type, vitals_after, {
      description:  reg ? `${reg.label}: ${reg.description}` : String(action.type),
      profit_delta: reg?.profit_delta ?? 0,
      social_delta: reg?.social_delta ?? 0,
      metadata:     { registry_action: action.type, ...objectMeta },
    });
  }

  private result(
    action: string,
    vitals_after: SoulVitals,
    overrides: Partial<ActionResult>,
  ): ActionResult {
    return {
      action,
      success:           true,
      description:       '',
      profit_delta:      0,
      social_delta:      0,
      health_delta:      0,
      penalty:           0,
      tos_violation:     false,
      deceptive_content: false,
      metadata:          {},
      ...overrides,
      vitals_after,
    };
  }
}
