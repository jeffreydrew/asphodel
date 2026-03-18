import { getPool } from '../db/pgClient';
import type { SoulPosition } from '../types';

function inferFloor(label: string): number {
  const l = label.toLowerCase();
  if (/rest|sleep|nap|dream|meditat/.test(l))          return 18.6; // BEDROOM
  if (/eat|cook|hunger|food|kitchen/.test(l))           return 5.1;  // KITCHEN
  if (/work|job|apply|browse_job|submit/.test(l))       return 9.6;  // OFFICE
  if (/exercise|gym|walk|yoga|stretch|fitness/.test(l)) return 14.1; // GYM
  if (/read|write|book|art|library|browse_web|research|journal/.test(l)) return 23.1; // LIBRARY
  if (/meet|social|chat|talk|friend|socialize/.test(l)) return 0.6;  // LOBBY
  return 0.6; // default: lobby
}

const SLOTS = [
  { x: -12.5, z: -12.5 },
  { x:  12.5, z: -12.5 },
  { x: -12.5, z:  12.5 },
  { x:  12.5, z:  12.5 },
  { x:   0,   z:   0   },
];

export async function updatePosition(
  soulId: string,
  action: string,
  slotIndex: number,
): Promise<SoulPosition> {
  const y    = inferFloor(action);
  const slot = SLOTS[slotIndex % SLOTS.length]!;
  const pos: SoulPosition = { soul_id: soulId, x: slot.x, y, z: slot.z };

  await getPool().query(
    `INSERT INTO soul_positions (soul_id, x, y, z, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (soul_id) DO UPDATE
       SET x = EXCLUDED.x, y = EXCLUDED.y, z = EXCLUDED.z, updated_at = EXCLUDED.updated_at`,
    [soulId, pos.x, pos.y, pos.z, Date.now()],
  );

  return pos;
}

export async function getAllPositions(): Promise<SoulPosition[]> {
  const { rows } = await getPool().query('SELECT soul_id, x, y, z FROM soul_positions');
  return rows as SoulPosition[];
}
