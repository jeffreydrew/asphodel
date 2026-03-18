// ─── Asphodel Tower — A* Grid Pathfinding ───────────────────────────────────
// Builds a walkability grid per floor from wall collision segments, then runs
// A* to find paths that navigate through doorways and around obstacles.
// Exports: buildNavGrid(floorIndex), findPath(floorIndex, startX, startZ, endX, endZ)

import { FLOOR_SIZE, FLOOR_WALLS } from './constants.js';

const CELL_SIZE   = 2;          // world units per grid cell
const GRID_DIM    = FLOOR_SIZE / CELL_SIZE; // 40 cells per side
const HALF        = FLOOR_SIZE / 2;         // 40
const AVATAR_R    = 0.8;        // avatar collision radius in world units

// Cached nav grids per floor index
const _grids = new Map();

// ─── Grid helpers ────────────────────────────────────────────────────────────

function worldToGrid(wx, wz) {
  const gx = Math.floor((wx + HALF) / CELL_SIZE);
  const gz = Math.floor((wz + HALF) / CELL_SIZE);
  return [Math.max(0, Math.min(GRID_DIM - 1, gx)), Math.max(0, Math.min(GRID_DIM - 1, gz))];
}

function gridToWorld(gx, gz) {
  return [(gx + 0.5) * CELL_SIZE - HALF, (gz + 0.5) * CELL_SIZE - HALF];
}

// ─── Build nav grid ─────────────────────────────────────────────────────────

export function buildNavGrid(floorIndex) {
  if (_grids.has(floorIndex)) return _grids.get(floorIndex);

  // true = walkable, false = blocked
  const grid = new Array(GRID_DIM * GRID_DIM).fill(true);

  const walls = FLOOR_WALLS[floorIndex];
  if (!walls) { _grids.set(floorIndex, grid); return grid; }

  // For each cell, test if any wall segment blocks it
  for (let gz = 0; gz < GRID_DIM; gz++) {
    for (let gx = 0; gx < GRID_DIM; gx++) {
      const [wx, wz] = gridToWorld(gx, gz);
      const idx = gz * GRID_DIM + gx;

      // Out of bounds (perimeter wall buffer)
      if (wx < -HALF + AVATAR_R || wx > HALF - AVATAR_R ||
          wz < -HALF + AVATAR_R || wz > HALF - AVATAR_R) {
        grid[idx] = false;
        continue;
      }

      for (const wall of walls) {
        if (wall.axis === 'x') {
          // Wall is a vertical line at x=value, spanning z=[min,max]
          if (wz >= wall.min - AVATAR_R && wz <= wall.max + AVATAR_R) {
            if (Math.abs(wx - wall.value) < AVATAR_R + CELL_SIZE * 0.5) {
              grid[idx] = false;
              break;
            }
          }
        } else {
          // Wall is a horizontal line at z=value, spanning x=[min,max]
          if (wx >= wall.min - AVATAR_R && wx <= wall.max + AVATAR_R) {
            if (Math.abs(wz - wall.value) < AVATAR_R + CELL_SIZE * 0.5) {
              grid[idx] = false;
              break;
            }
          }
        }
      }
    }
  }

  _grids.set(floorIndex, grid);
  return grid;
}

// ─── Invalidate cached grid (call when walls change) ────────────────────────

export function invalidateNavGrid(floorIndex) {
  _grids.delete(floorIndex);
}

export function invalidateAllNavGrids() {
  _grids.clear();
}

// ─── A* pathfinding ─────────────────────────────────────────────────────────

const _DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],       // cardinal
  [1, 1], [1, -1], [-1, 1], [-1, -1],      // diagonal
];
const _COST_STRAIGHT = 1.0;
const _COST_DIAG     = 1.414;

/**
 * Find a path from (startX, startZ) to (endX, endZ) on the given floor.
 * Returns an array of {x, z} world-coordinate waypoints, or null if no path.
 */
export function findPath(floorIndex, startX, startZ, endX, endZ) {
  const grid = buildNavGrid(floorIndex);

  const [sx, sz] = worldToGrid(startX, startZ);
  const [ex, ez] = worldToGrid(endX, endZ);

  // If start or end is blocked, snap to nearest walkable cell
  const start = _findNearestWalkable(grid, sx, sz);
  const end   = _findNearestWalkable(grid, ex, ez);
  if (!start || !end) return null;

  const [sxf, szf] = start;
  const [exf, ezf] = end;

  if (sxf === exf && szf === ezf) {
    return [{ x: endX, z: endZ }];
  }

  // A* open set as a simple sorted array (adequate for 40×40 grid)
  const openSet  = [];
  const cameFrom = new Map();
  const gScore   = new Map();
  const fScore   = new Map();
  const closed   = new Set();

  const key = (gx, gz) => gz * GRID_DIM + gx;
  const heuristic = (ax, az, bx, bz) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));

  const sk = key(sxf, szf);
  gScore.set(sk, 0);
  fScore.set(sk, heuristic(sxf, szf, exf, ezf));
  openSet.push({ gx: sxf, gz: szf, f: fScore.get(sk) });

  let iterations = 0;
  const MAX_ITER = 3000;

  while (openSet.length > 0 && iterations++ < MAX_ITER) {
    // Pop node with lowest f-score
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift();
    const ck = key(current.gx, current.gz);

    if (current.gx === exf && current.gz === ezf) {
      return _reconstructPath(cameFrom, current.gx, current.gz, endX, endZ);
    }

    closed.add(ck);

    for (const [dx, dz] of _DIRS) {
      const nx = current.gx + dx;
      const nz = current.gz + dz;

      if (nx < 0 || nx >= GRID_DIM || nz < 0 || nz >= GRID_DIM) continue;

      const nk = key(nx, nz);
      if (closed.has(nk)) continue;
      if (!grid[nk]) continue;

      // For diagonal moves, ensure both adjacent cardinal cells are walkable
      if (dx !== 0 && dz !== 0) {
        if (!grid[key(current.gx + dx, current.gz)] || !grid[key(current.gx, current.gz + dz)]) continue;
      }

      const moveCost = (dx !== 0 && dz !== 0) ? _COST_DIAG : _COST_STRAIGHT;
      const tentG    = (gScore.get(ck) ?? Infinity) + moveCost;

      if (tentG < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, ck);
        gScore.set(nk, tentG);
        const f = tentG + heuristic(nx, nz, exf, ezf);
        fScore.set(nk, f);

        if (!openSet.some(n => n.gx === nx && n.gz === nz)) {
          openSet.push({ gx: nx, gz: nz, f });
        }
      }
    }
  }

  return null; // no path found
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _findNearestWalkable(grid, gx, gz) {
  if (gx >= 0 && gx < GRID_DIM && gz >= 0 && gz < GRID_DIM && grid[gz * GRID_DIM + gx]) {
    return [gx, gz];
  }
  // Spiral search for nearest walkable cell
  for (let r = 1; r < 10; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const nx = gx + dx, nz = gz + dz;
        if (nx >= 0 && nx < GRID_DIM && nz >= 0 && nz < GRID_DIM && grid[nz * GRID_DIM + nx]) {
          return [nx, nz];
        }
      }
    }
    for (let dz = -r + 1; dz < r; dz++) {
      for (const dx of [-r, r]) {
        const nx = gx + dx, nz = gz + dz;
        if (nx >= 0 && nx < GRID_DIM && nz >= 0 && nz < GRID_DIM && grid[nz * GRID_DIM + nx]) {
          return [nx, nz];
        }
      }
    }
  }
  return null;
}

function _reconstructPath(cameFrom, endGx, endGz, finalX, finalZ) {
  const key = (gx, gz) => gz * GRID_DIM + gx;
  const rawPath = [];
  let ck = key(endGx, endGz);

  while (cameFrom.has(ck)) {
    const gx = ck % GRID_DIM;
    const gz = Math.floor(ck / GRID_DIM);
    rawPath.unshift({ gx, gz });
    ck = cameFrom.get(ck);
  }

  // Convert to world coordinates and simplify (remove collinear points)
  const waypoints = [];
  for (let i = 0; i < rawPath.length; i++) {
    const [wx, wz] = gridToWorld(rawPath[i].gx, rawPath[i].gz);

    if (waypoints.length >= 2) {
      const prev  = waypoints[waypoints.length - 1];
      const prev2 = waypoints[waypoints.length - 2];
      const dx1 = prev.x - prev2.x, dz1 = prev.z - prev2.z;
      const dx2 = wx - prev.x, dz2 = wz - prev.z;
      // If same direction, skip intermediate point
      if (Math.abs(dx1 * dz2 - dz1 * dx2) < 0.01) {
        waypoints[waypoints.length - 1] = { x: wx, z: wz };
        continue;
      }
    }
    waypoints.push({ x: wx, z: wz });
  }

  // Replace final waypoint with exact target
  if (waypoints.length > 0) {
    waypoints[waypoints.length - 1] = { x: finalX, z: finalZ };
  } else {
    waypoints.push({ x: finalX, z: finalZ });
  }

  return waypoints;
}
