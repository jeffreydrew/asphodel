import { getDb } from '../db/client';
import { ActionType } from '../types';
import type { SoulPosition } from '../types';

// Maps action types to tower floor positions.
// y = floor height, slot x/z are assigned per soul index.
// Floor y values must match FLOORS array in public/js/world.js
// LOBBY=0, KITCHEN=4.5, OFFICE=9, GYM=13.5, BEDROOM=18, LIBRARY=22.5
const FLOOR_Y: Record<ActionType, number> = {
  [ActionType.IDLE]:           0.6,
  [ActionType.SOCIAL_POST]:    0.6,
  [ActionType.MEET_SOUL]:      0.6,
  [ActionType.EAT]:            5.1,
  [ActionType.BROWSE_JOBS]:    9.6,
  [ActionType.SUBMIT_APP]:     9.6,
  [ActionType.CREATE_CONTENT]: 9.6,
  [ActionType.EXERCISE]:       14.1,
  [ActionType.REST]:           18.6,
  // Library floor (y=22.5 + 0.6 offset)
  [ActionType.READ_BOOK]:      23.1,
  [ActionType.WRITE_BOOK]:     23.1,
  [ActionType.CREATE_ART]:     23.1,
  [ActionType.BROWSE_WEB]:     23.1,
};

// 5 slots, one per soul
const SLOTS = [
  { x: -2.5, z: -2.5 },
  { x:  2.5, z: -2.5 },
  { x: -2.5, z:  2.5 },
  { x:  2.5, z:  2.5 },
  { x:  0,   z:  0   },
];

export function updatePosition(soulId: string, action: ActionType, slotIndex: number): SoulPosition {
  const y    = FLOOR_Y[action] ?? 0.5;
  const slot = SLOTS[slotIndex % SLOTS.length]!;
  const pos: SoulPosition = { soul_id: soulId, x: slot.x, y, z: slot.z };

  getDb().prepare(`
    INSERT INTO soul_positions (soul_id, x, y, z, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(soul_id) DO UPDATE SET x = excluded.x, y = excluded.y, z = excluded.z, updated_at = excluded.updated_at
  `).run(soulId, pos.x, pos.y, pos.z, Date.now());

  return pos;
}

export function getAllPositions(): SoulPosition[] {
  return getDb().prepare('SELECT soul_id, x, y, z FROM soul_positions').all() as SoulPosition[];
}
