import { EventEmitter } from 'events';
import type { SoulSnapshot, WorldUpdate, WorldLogEntry } from '../types';
import { getAllPositions } from './PositionTracker';

class WorldStateEmitter extends EventEmitter {}

export const worldEvents = new WorldStateEmitter();

interface SnapshotStore {
  [soulId: string]: SoulSnapshot;
}

const snapshots: SnapshotStore = {};
let tickCounter = 0;

export function pushSnapshot(snapshot: SoulSnapshot): void {
  snapshots[snapshot.id] = snapshot;
  tickCounter += 1;
}

export function buildWorldUpdate(recentLog: WorldLogEntry[]): WorldUpdate {
  return {
    type:       'WORLD_UPDATE',
    ts:         Date.now(),
    souls:      Object.values(snapshots),
    recent_log: recentLog,
    positions:  getAllPositions(),
    tick:       tickCounter,
  };
}

export function getTickCount(): number {
  return tickCounter;
}
