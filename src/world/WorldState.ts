import { EventEmitter } from 'events';
import type { SoulSnapshot, WorldUpdate, WorldLogEntry, WorldObject } from '../types';
import { getAllPositions } from './PositionTracker';
import { getWorldObjects } from './WorldObjectManager';

class WorldStateEmitter extends EventEmitter {}

export const worldEvents = new WorldStateEmitter();

interface SnapshotStore {
  [soulId: string]: SoulSnapshot;
}

const snapshots: SnapshotStore = {};
let tickCounter = 0;

// World-objects cache (5s TTL, invalidated by object actions)
let objectsCache: WorldObject[] = [];
let objectsCacheTs = 0;
const OBJECTS_TTL  = 5_000;

export function invalidateObjectsCache(): void {
  objectsCacheTs = 0;
}

async function getCachedObjects(): Promise<WorldObject[]> {
  const now = Date.now();
  if (now - objectsCacheTs > OBJECTS_TTL) {
    objectsCache   = await getWorldObjects();
    objectsCacheTs = now;
  }
  return objectsCache;
}

export function pushSnapshot(snapshot: SoulSnapshot): void {
  snapshots[snapshot.id] = snapshot;
  tickCounter += 1;
}

export async function buildWorldUpdate(recentLog: WorldLogEntry[]): Promise<WorldUpdate> {
  return {
    type:          'WORLD_UPDATE',
    ts:            Date.now(),
    souls:         Object.values(snapshots),
    recent_log:    recentLog,
    positions:     await getAllPositions(),
    tick:          tickCounter,
    world_objects: await getCachedObjects(),
  };
}

export function getTickCount(): number {
  return tickCounter;
}
