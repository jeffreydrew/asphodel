// ─── Asphodel Tower — Static Geometry Builders ───────────────────────────────
// Constructs floor slabs, perimeter walls, elevator shaft, ground, and scene lights.
// Exports: buildTower(scene, floorGroups), setupLights(scene)

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { FLOORS, FLOOR_SIZE, WALL_HEIGHT } from './constants.js';

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildTower(scene, floorGroups) {
  FLOORS.forEach((floor, i) => buildFloor(scene, floorGroups, floor, i));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshBasicMaterial({ color: 0xd8e8f0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  scene.add(ground);

  const grid = new THREE.GridHelper(500, 500, 0xaac0d8, 0xc0d4e8);
  grid.position.y = -0.48;
  scene.add(grid);
}

export function setupLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(-15, 40, -20);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xc8e8ff, 0xc8d8c0, 0.8));
  const baseGlow = new THREE.PointLight(0xffd4a0, 20, 80);
  baseGlow.position.set(0, -0.2, 0);
  scene.add(baseGlow);
}

// ─── Floor ────────────────────────────────────────────────────────────────────

function buildFloor(scene, floorGroups, floor, index) {
  const group = new THREE.Group();
  group.userData.floorIndex = index;
  scene.add(group);
  floorGroups[index] = group;

  const half = FLOOR_SIZE / 2;

  // Slab
  const slabGeo = new THREE.BoxGeometry(FLOOR_SIZE, 0.28, FLOOR_SIZE);
  const slabMat = new THREE.MeshBasicMaterial({ color: floor.floorColor });
  const slab    = new THREE.Mesh(slabGeo, slabMat);
  slab.position.set(0, floor.y - 0.14, 0);
  group.add(slab);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(slabGeo),
    new THREE.LineBasicMaterial({ color: index === 0 ? 0x4a90d9 : 0x1e2e50 }),
  );
  edges.position.copy(slab.position);
  group.add(edges);

  buildFloorWalls(floor.y, index, group);

  // Main central light — high power, wide range
  const mainLight = new THREE.PointLight(floor.lightColor, floor.lightIntensity * 3, 120, 1.2);
  mainLight.position.set(0, floor.y + WALL_HEIGHT * 0.85, 0);
  group.add(mainLight);

  // Edge accent lights (mid-wall, lower — add warmth near perimeter)
  for (const [ex, ez] of [[-38, 0], [38, 0], [0, -38], [0, 38]]) {
    const edge = new THREE.PointLight(floor.lightColor, floor.lightIntensity * 0.8, 50, 1.5);
    edge.position.set(ex, floor.y + WALL_HEIGHT * 0.5, ez);
    group.add(edge);
  }

  // Floor label (CSS2D)
  const div = document.createElement('div');
  div.className   = 'floor-label';
  div.textContent = floor.label;
  const label = new CSS2DObject(div);
  label.position.set(-half - 1.0, floor.y + 1.8, 0);
  group.add(label);
}

// ─── Walls ────────────────────────────────────────────────────────────────────

function buildFloorWalls(floorY, index, group) {
  const half    = FLOOR_SIZE / 2;
  const wallY   = floorY + WALL_HEIGHT / 2;
  const wallColors = [0x5858c0, 0x4080b8, 0x3868b8, 0x389870, 0x8050b8, 0xc09050];

  const mat = new THREE.MeshLambertMaterial({
    color:       wallColors[index] ?? 0x14143a,
    transparent: true,
    opacity:     0.65,
    side:        THREE.DoubleSide,
    depthWrite:  false,
  });

  const addWall = (w, h, d, x, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, wallY, z);
    mesh.userData.isEditableWall = true;
    group.add(mesh);
  };

  // 4-sided perimeter walls
  addWall(FLOOR_SIZE, WALL_HEIGHT, 0.2,   0, -half); // south
  addWall(FLOOR_SIZE, WALL_HEIGHT, 0.2,   0,  half); // north
  addWall(0.2, WALL_HEIGHT, FLOOR_SIZE, -half,  0);  // west
  addWall(0.2, WALL_HEIGHT, FLOOR_SIZE,  half,  0);  // east

  addInteriorWalls(floorY, index, group, mat);
}

// ─── Interior wall helpers ────────────────────────────────────────────────────

function addWallSegment(group, wallY, x1, z1, x2, z2, mat) {
  if (Math.abs(x2 - x1) < 0.01) {
    // Vertical wall (along Z axis)
    const len = Math.abs(z2 - z1);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, WALL_HEIGHT, len), mat);
    mesh.position.set(x1, wallY, (z1 + z2) / 2);
    mesh.userData.isEditableWall = true;
    group.add(mesh);
  } else {
    // Horizontal wall (along X axis)
    const len = Math.abs(x2 - x1);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, WALL_HEIGHT, 0.2), mat);
    mesh.position.set((x1 + x2) / 2, wallY, z1);
    mesh.userData.isEditableWall = true;
    group.add(mesh);
  }
}

function addInteriorWalls(floorY, index, group, mat) {
  const wallY = floorY + WALL_HEIGHT / 2;

  // Glass-wall material (more transparent, for meeting rooms / dividers)
  const glassMat = new THREE.MeshLambertMaterial({
    color:       mat.color,
    transparent: true,
    opacity:     0.35,
    side:        THREE.DoubleSide,
    depthWrite:  false,
  });

  // Elevator shaft walls (all floors): x=[24,32], z=[24,32]
  addWallSegment(group, wallY, 24, 24, 24, 32, mat);  // west face
  addWallSegment(group, wallY, 24, 24, 32, 24, mat);  // south face

  if (index === 0) {
    // ── LOBBY ───────────────────────────────────────────────────────────────
    // Partial divider wall (E-W) separating West Lounge from south, at z=0
    addWallSegment(group, wallY, -32, 0, -8, 0, mat);
    // Partial divider wall (E-W) separating East Meeting from Waiting, at z=-16
    addWallSegment(group, wallY, 8, -16, 24, -16, mat);

  } else if (index === 1) {
    // ── KITCHEN ─────────────────────────────────────────────────────────────
    // Kitchen prep south wall (E-W at z=16, from west wall to x=-16)
    addWallSegment(group, wallY, -40, 16, -16, 16, mat);
    // Kitchen prep east wall (N-S at x=-16, from z=8 to z=16)
    addWallSegment(group, wallY, -16, 8, -16, 16, mat);
    // Pantry north wall (E-W at z=-16, from x=8 to east wall)
    addWallSegment(group, wallY, 16, -16, 40, -16, mat);
    // Pantry west wall (N-S at x=8, from south wall to z=-24), door gap z=-24..-16
    addWallSegment(group, wallY, 8, -40, 8, -24, mat);

  } else if (index === 2) {
    // ── OFFICE ──────────────────────────────────────────────────────────────
    // Meeting room south wall (E-W at z=8, from west wall to x=-8)
    addWallSegment(group, wallY, -40, 8, -8, 8, mat);
    // Meeting room east wall — solid lower (x=-8, z=8 to z=16)
    addWallSegment(group, wallY, -8, 8, -8, 16, mat);
    // Meeting room east wall — glass upper (x=-8, z=16 to z=20), door gap z=20..24
    addWallSegment(group, wallY, -8, 16, -8, 20, glassMat);
    // Library wall (N-S at x=16) with door gap z=-4..4
    addWallSegment(group, wallY, 16, -16, 16, -4, mat);
    addWallSegment(group, wallY, 16, 4, 16, 24, mat);
    // Lounge/Break room divider (E-W at z=-16) with door gaps
    addWallSegment(group, wallY, -40, -16, -12, -16, mat);
    addWallSegment(group, wallY, -4, -16, 4, -16, mat);
    addWallSegment(group, wallY, 12, -16, 16, -16, mat);

  } else if (index === 3) {
    // ── GYM ─────────────────────────────────────────────────────────────────
    // Yoga zone divider (E-W at z=16, from west wall), door gap x=-8..0
    addWallSegment(group, wallY, -40, 16, -8, 16, mat);
    // Locker room north wall (E-W at z=-16, from x=16 to east wall)
    addWallSegment(group, wallY, 16, -16, 40, -16, mat);
    // Locker room west wall (N-S at x=16, from south wall to z=-24), door gap z=-24..-16
    addWallSegment(group, wallY, 16, -40, 16, -24, mat);

  } else if (index === 4) {
    // ── BEDROOM ─────────────────────────────────────────────────────────────
    // Apt dividing walls (N-S from z=8 to z=40)
    addWallSegment(group, wallY, -24, 8, -24, 40, mat);  // between apt1 & apt2
    addWallSegment(group, wallY,  -8, 8,  -8, 40, mat);  // between apt2 & apt3
    addWallSegment(group, wallY,   8, 8,   8, 40, mat);  // between apt3 & apt4

    // Hallway wall (E-W at z=8) with door gaps per apartment
    addWallSegment(group, wallY, -40, 8, -36, 8, mat);   // apt1 left
    addWallSegment(group, wallY, -28, 8, -24, 8, mat);   // apt1 right
    addWallSegment(group, wallY, -24, 8, -20, 8, mat);   // apt2 left
    addWallSegment(group, wallY, -12, 8,  -8, 8, mat);   // apt2 right
    addWallSegment(group, wallY,  -8, 8,  -4, 8, mat);   // apt3 left
    addWallSegment(group, wallY,   4, 8,   8, 8, mat);   // apt3 right
    addWallSegment(group, wallY,   8, 8,  12, 8, mat);   // apt4 left
    addWallSegment(group, wallY,  20, 8,  24, 8, mat);   // apt4 right

    // Apt 5 west wall (N-S at x=16, z=-16 to z=8) with door gap z=-4..4
    addWallSegment(group, wallY, 16, -16, 16, -4, mat);
    addWallSegment(group, wallY, 16, 4, 16, 8, mat);
    // Apt 5 north wall connects to elevator at z=8, x=16 to x=24
    addWallSegment(group, wallY, 16, 8, 24, 8, mat);

    // Apartment ceilings (visual)
    const ceilMat = new THREE.MeshLambertMaterial({ color: 0x7050a0 });
    for (const cx of [-32, -16, 0, 16]) {
      const ceil = new THREE.Mesh(new THREE.BoxGeometry(16, 0.15, 32), ceilMat);
      ceil.position.set(cx, floorY + WALL_HEIGHT, 24);
      group.add(ceil);
    }
    const ceil5 = new THREE.Mesh(new THREE.BoxGeometry(24, 0.15, 24), ceilMat);
    ceil5.position.set(28, floorY + WALL_HEIGHT, -4);
    group.add(ceil5);

  } else if (index === 5) {
    // ── LIBRARY ─────────────────────────────────────────────────────────────
    // Archive room west wall (N-S at x=16) with door gap z=-4..4
    addWallSegment(group, wallY, 16, -40, 16, -4, mat);
    addWallSegment(group, wallY, 16, 4, 16, 24, mat);
    // Reading nook east divider (N-S at x=-16, from south wall to z=-8)
    addWallSegment(group, wallY, -16, -40, -16, -8, mat);
    // Art area north wall (E-W at z=-24, x=0 to x=16) with gap x=4..8
    addWallSegment(group, wallY, 0, -24, 4, -24, mat);
    addWallSegment(group, wallY, 8, -24, 16, -24, mat);
    // Art stable/station divider (N-S at x=8, from z=-40 to z=-24)
    addWallSegment(group, wallY, 8, -40, 8, -24, mat);
  }
}
