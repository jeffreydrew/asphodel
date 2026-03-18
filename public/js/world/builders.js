// ─── Asphodel Tower — Static Geometry Builders ───────────────────────────────
// Constructs floor slabs, perimeter walls, elevator shaft, ground, and scene lights.
// Exports: buildTower(scene, floorGroups), setupLights(scene)

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { FLOORS, FLOOR_SIZE, WALL_HEIGHT, ELEV_X, ELEV_Z } from './constants.js';

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildTower(scene, floorGroups) {
  FLOORS.forEach((floor, i) => buildFloor(scene, floorGroups, floor, i));

  buildElevator(scene);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshLambertMaterial({ color: 0x040410 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  scene.add(ground);

  const grid = new THREE.GridHelper(100, 100, 0x0f0f28, 0x08081a);
  grid.position.y = -0.48;
  scene.add(grid);
}

export function setupLights(scene) {
  scene.add(new THREE.AmbientLight(0x303060, 2.5));
  const moon = new THREE.DirectionalLight(0x8090c0, 1.2);
  moon.position.set(-15, 40, -20);
  scene.add(moon);
  scene.add(new THREE.HemisphereLight(0x2030a0, 0x0a0820, 0.8));
  const baseGlow = new THREE.PointLight(0x2050ff, 40, 30, 1.5);
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
  const slabMat = new THREE.MeshLambertMaterial({ color: floor.floorColor });
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

  // Ceiling light fixture
  const fix = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.1, 1.6),
    new THREE.MeshBasicMaterial({ color: floor.lightColor }),
  );
  fix.position.set(0, floor.y + WALL_HEIGHT - 0.05, 0);
  group.add(fix);

  // Corner accent panels
  for (const [cx, cz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.08, 0.4),
      new THREE.MeshBasicMaterial({ color: floor.lightColor }),
    );
    accent.position.set(cx, floor.y + WALL_HEIGHT - 0.05, cz);
    group.add(accent);
  }

  // Point lights
  const mainLight = new THREE.PointLight(floor.lightColor, floor.lightIntensity, 30, 1.5);
  mainLight.position.set(0, floor.y + WALL_HEIGHT * 0.75, 0);
  group.add(mainLight);

  for (const [fx, fz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    const fill = new THREE.PointLight(floor.lightColor, floor.lightIntensity * 0.4, 20, 1.5);
    fill.position.set(fx, floor.y + WALL_HEIGHT * 0.5, fz);
    group.add(fill);
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
  const wallColors = [0x14143a, 0x14243c, 0x10203a, 0x14282c, 0x1c1030, 0x201408];

  const mat = new THREE.MeshLambertMaterial({
    color:       wallColors[index] ?? 0x14143a,
    transparent: true,
    opacity:     0.50,
    side:        THREE.DoubleSide,
    depthWrite:  false,
  });

  const addWall = (w, h, d, x, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, wallY, z);
    group.add(mesh);
  };

  addWall(FLOOR_SIZE, WALL_HEIGHT, 0.2,  0,     -half); // south
  addWall(0.2, WALL_HEIGHT, FLOOR_SIZE, -half,   0);    // west
}

// ─── Elevator ─────────────────────────────────────────────────────────────────

function buildElevator(scene) {
  const topY    = FLOORS[FLOORS.length - 1].y + WALL_HEIGHT;
  const shaftH  = topY + 0.5;
  const shaftMid = shaftH / 2 - 0.25;

  const shaftMat = new THREE.MeshLambertMaterial({ color: 0x18183a });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.1, shaftH, 1.1), shaftMat);
  shaft.position.set(ELEV_X, shaftMid, ELEV_Z);
  scene.add(shaft);

  const trimMat = new THREE.MeshBasicMaterial({ color: 0x4466ff, transparent: true, opacity: 0.7 });
  for (const [ox, oz] of [[-0.55, 0], [0.55, 0], [0, -0.55], [0, 0.55]]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.04, shaftH, 0.04), trimMat);
    trim.position.set(ELEV_X + ox, shaftMid, ELEV_Z + oz);
    scene.add(trim);
  }

  const doorMat = new THREE.MeshBasicMaterial({ color: 0x88aaff, transparent: true, opacity: 0.5 });
  for (const floor of FLOORS) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.06), doorMat);
    door.position.set(ELEV_X - 0.58, floor.y + 1.0, ELEV_Z);
    door.userData.isElevDoor = true;
    scene.add(door);
  }

  const glow = new THREE.PointLight(0x4466ff, 25, 8, 2);
  glow.position.set(ELEV_X, 1.0, ELEV_Z);
  scene.add(glow);
}
