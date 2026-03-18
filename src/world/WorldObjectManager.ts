import { randomUUID } from 'crypto';
import { getPool } from '../db/pgClient';
import type { WorldObject } from '../types';

function rowToWorldObject(row: Record<string, unknown>): WorldObject {
  return {
    id:            row['id'] as string,
    type:          row['type'] as WorldObject['type'],
    label:         row['label'] as string,
    owner_soul_id: row['owner_soul_id'] as string | null,
    floor:         row['floor'] as number,
    position_x:    row['position_x'] as number,
    position_y:    row['position_y'] as number,
    position_z:    row['position_z'] as number,
    // properties is JSONB — already parsed by pg
    properties:    (row['properties'] as Record<string, unknown> | null) ?? null,
    created_by:    row['created_by'] as string,
    created_at:    row['created_at'] as number,
  };
}

export async function getWorldObjects(floor?: number): Promise<WorldObject[]> {
  const { rows } = floor !== undefined
    ? await getPool().query(
        'SELECT * FROM world_objects WHERE floor = $1 ORDER BY created_at DESC LIMIT 200',
        [floor],
      )
    : await getPool().query(
        'SELECT * FROM world_objects ORDER BY created_at DESC LIMIT 200',
      );
  return rows.map(rowToWorldObject);
}

export interface PlacePayload {
  type?: string;
  label: string;
  floor?: number;
  position_x?: number;
  position_y?: number;
  position_z?: number;
  color?: string;
  [key: string]: unknown;
}

export interface ModifyPayload {
  object_id: string;
  label?: string;
  floor?: number;
  position_x?: number;
  position_y?: number;
  position_z?: number;
  color?: string;
  [key: string]: unknown;
}

export interface GiftPayload {
  object_id: string;
  to_soul_id: string;
}

export async function placeObject(soulId: string, payload: PlacePayload): Promise<WorldObject> {
  const obj: WorldObject = {
    id:            randomUUID(),
    type:          (payload.type as WorldObject['type']) ?? 'custom',
    label:         String(payload.label ?? 'object').substring(0, 80),
    owner_soul_id: soulId,
    floor:         Number(payload.floor ?? 0),
    position_x:    Number(payload.position_x ?? (Math.random() * 20 - 10)),
    position_y:    0,
    position_z:    Number(payload.position_z ?? (Math.random() * 20 - 10)),
    properties:    payload.color ? { color: payload.color } : null,
    created_by:    soulId,
    created_at:    Date.now(),
  };

  await getPool().query(
    `INSERT INTO world_objects
       (id, type, label, owner_soul_id, floor, position_x, position_y, position_z,
        properties, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      obj.id, obj.type, obj.label, obj.owner_soul_id, obj.floor,
      obj.position_x, obj.position_y, obj.position_z,
      obj.properties, // pass JS object directly, pg serializes as JSONB
      obj.created_by, obj.created_at,
    ],
  );

  return obj;
}

export async function modifyObject(
  soulId: string,
  payload: ModifyPayload,
): Promise<WorldObject | null> {
  const { rows } = await getPool().query(
    'SELECT * FROM world_objects WHERE id = $1 AND owner_soul_id = $2',
    [payload.object_id, soulId],
  );
  const existingRow = rows[0] as Record<string, unknown> | undefined;
  if (!existingRow) return null;

  const merged: WorldObject = rowToWorldObject(existingRow);
  if (payload.label      !== undefined) merged.label      = String(payload.label).substring(0, 80);
  if (payload.floor      !== undefined) merged.floor      = Number(payload.floor);
  if (payload.position_x !== undefined) merged.position_x = Number(payload.position_x);
  if (payload.position_z !== undefined) merged.position_z = Number(payload.position_z);
  if (payload.color      !== undefined) merged.properties = { ...(merged.properties ?? {}), color: payload.color };

  await getPool().query(
    `UPDATE world_objects
     SET label = $1, floor = $2, position_x = $3, position_z = $4, properties = $5
     WHERE id = $6`,
    [merged.label, merged.floor, merged.position_x, merged.position_z, merged.properties, merged.id],
  );

  return merged;
}

export async function giftObject(
  fromId: string,
  toId: string,
  objectId: string,
): Promise<WorldObject | null> {
  const { rows } = await getPool().query(
    'SELECT * FROM world_objects WHERE id = $1 AND owner_soul_id = $2',
    [objectId, fromId],
  );
  const existingRow = rows[0] as Record<string, unknown> | undefined;
  if (!existingRow) return null;

  await getPool().query(
    'UPDATE world_objects SET owner_soul_id = $1 WHERE id = $2',
    [toId, objectId],
  );

  const updated = rowToWorldObject(existingRow);
  updated.owner_soul_id = toId;
  return updated;
}
