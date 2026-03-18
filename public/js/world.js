// ─── Asphodel Tower — World Orchestrator ─────────────────────────────────────
// Entry point for the 3D scene. Owns shared state, wires all modules together,
// handles camera/controls/events, and runs the animation loop.
//
// Module map (read these instead of this file for specific concerns):
//   world/constants.js  — FLOORS, FLOOR_SIZE, ACTION_TASK_MAP, spot arrays
//   world/builders.js   — floor slabs, walls, elevator, lights, ground
//   world/furniture.js  — all GLTF furniture placement per floor
//   world/avatar.js     — SoulAvatar class, wander/task state machine

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader }    from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { onWorldUpdate, connect } from './api.js';
import { initHUD, updateHUD, openSoulPanel, populateSoulSelect } from './hud.js';

import { FLOORS, WALL_HEIGHT, FLOOR_SIZE } from './world/constants.js';
import { buildTower, setupLights }         from './world/builders.js';
import { loadFurniture }                   from './world/furniture.js';
import { SoulAvatar }                      from './world/avatar.js';
import { EditMode }                        from './world/editMode.js';

// ─── Shared Scene State ───────────────────────────────────────────────────────

let scene, camera, renderer, labelRenderer, controls, raycaster, mouse;

const floorGroups         = [];
const furnitureMeshes     = [];
const furnitureAnimations = [];
const avatars             = [];
const renderedObjects     = new Map(); // id → THREE.Mesh

let worldData   = null;
let selectedId  = null;
let activeFloor = -1;
let cameraTargetY = 10;
let dragTarget  = null;
let didDrag     = false;
let editMode    = null;

const gltfLoader   = new GLTFLoader();
const _dragPlane   = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _dragIntersect = new THREE.Vector3();

// ─── Entry Point ──────────────────────────────────────────────────────────────

export function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc8e0f0);
  scene.fog = new THREE.FogExp2(0xc8e0f0, 0.004);

  buildTower(scene, floorGroups);
  setupLights(scene);
  loadFurniture(floorGroups, gltfLoader, furnitureMeshes);

  setupCamera();
  setupRenderers();
  setupControls();

  raycaster = new THREE.Raycaster();
  mouse     = new THREE.Vector2();

  window.addEventListener('resize',      onResize);
  window.addEventListener('click',       onClick);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup',   onPointerUp);

  onWorldUpdate(handleUpdate);
  connect();
  initHUD();
  initFloorFilter();

  editMode = new EditMode({
    scene,
    camera,
    renderer,
    controls,
    floorGroups,
    furnitureMeshes,
    gltfLoader,
    getActiveFloor: () => activeFloor,
  });

  animate();

  // Expose zoom for hud.js directive handling
  window.__zoomToSoul = zoomToSoul;
  window.__getAvatars = () => avatars;
}

// ─── Camera & Controls ────────────────────────────────────────────────────────

function setupCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  const d = 26;
  camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, -200, 600);
  camera.position.set(34, 30, 34);
  camera.lookAt(0, 10, 0);
}

function setupRenderers() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.cssText = 'position:absolute;top:0;pointer-events:none;';
  document.getElementById('canvas-container').appendChild(labelRenderer.domElement);
}

function setupControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 10, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance   = 12;
  controls.maxDistance   = 100;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.update();
}

function onResize() {
  const aspect = window.innerWidth / window.innerHeight;
  const d      = Math.abs(camera.top);
  camera.left  = -d * aspect;
  camera.right =  d * aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  controls.update();
}

// ─── Floor Filter UI ──────────────────────────────────────────────────────────

function initFloorFilter() {
  document.querySelectorAll('.floor-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = parseInt(btn.dataset.floor, 10);
      setActiveFloor(f);
      document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function setActiveFloor(floorIdx) {
  activeFloor = floorIdx;
  floorGroups.forEach((group, i) => {
    group.visible = floorIdx === -1 || i === floorIdx;
  });
  cameraTargetY = floorIdx === -1 ? 10 : FLOORS[floorIdx].y + WALL_HEIGHT / 2;
  editMode?.updateGrid();
  avatars.forEach(a => {
    if (!a) return;
    a.group.visible = floorIdx === -1 || a.floorIndex === floorIdx;
  });
}

// ─── World Update Handler ─────────────────────────────────────────────────────

let prevLogIds = new Set();

function handleUpdate(data) {
  worldData = data;

  // Context passed to each SoulAvatar so it can rearrange furniture + respect drags
  const worldCtx = {
    furnitureMeshes,
    furnitureAnimations,
    getDragTarget: () => dragTarget,
  };

  data.souls.forEach((soul, i) => {
    if (!avatars[i]) avatars[i] = new SoulAvatar(soul, i, scene, gltfLoader, worldCtx);
    avatars[i].setFloor(soul.last_action ?? 'idle');
    avatars[i].group.visible = activeFloor === -1 || avatars[i].floorIndex === activeFloor;

    const hasSig = data.recent_log.some(e =>
      e.soul_id === soul.id && e.significance === 'SIGNIFICANT' && !prevLogIds.has(e.id),
    );
    if (hasSig) avatars[i].pulse();
  });

  data.recent_log.forEach(e => prevLogIds.add(e.id));
  if (prevLogIds.size > 200) prevLogIds = new Set([...prevLogIds].slice(-100));

  renderWorldObjects(data.world_objects ?? []);

  populateSoulSelect(data.souls);
  updateHUD(data);
}

// ─── World Objects Renderer ───────────────────────────────────────────────────

function renderWorldObjects(objects) {
  const incomingIds = new Set(objects.map(o => o.id));

  // Remove objects that no longer exist
  for (const [id, mesh] of renderedObjects) {
    if (!incomingIds.has(id)) {
      mesh.parent?.remove(mesh);
      mesh.geometry?.dispose();
      renderedObjects.delete(id);
    }
  }

  // Add new objects
  for (const obj of objects) {
    if (renderedObjects.has(obj.id)) continue;

    const color = obj.properties?.color ?? '#88aaff';
    const geometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color) });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(obj.position_x, obj.position_y + 0.2, obj.position_z);
    mesh.castShadow = true;

    const floorGroup = floorGroups[obj.floor];
    if (floorGroup) {
      floorGroup.add(mesh);
    } else {
      scene.add(mesh);
    }

    renderedObjects.set(obj.id, mesh);
  }
}

// ─── Pointer / Drag Interaction ───────────────────────────────────────────────

function getNDC(e) {
  return new THREE.Vector2(
    (e.clientX / window.innerWidth)  * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1,
  );
}

function collectFurnMeshes() {
  const result = [];
  furnitureMeshes.forEach(f => {
    if (f.model.parent && f.model.parent.visible === false) return;
    f.model.traverse(c => { if (c.isMesh) result.push(c); });
  });
  return result;
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  if (editMode?.enabled) return; // edit mode handles its own pointer events
  didDrag = false;
}

function onPointerMove(e) {
  if (editMode?.enabled) return;
}

function onPointerUp() {
  if (dragTarget) {
    controls.enabled = true;
    dragTarget = null;
    renderer.domElement.style.cursor = '';
  }
}

function onClick(event) {
  if (editMode?.enabled) return;
  if (didDrag) { didDrag = false; return; }

  mouse.set(
    (event.clientX / window.innerWidth)  * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(mouse, camera);

  const meshes = avatars.filter(Boolean).flatMap(a => [a.torso, a.head].filter(Boolean));
  const hits   = raycaster.intersectObjects(meshes);
  if (hits.length > 0) {
    let obj = hits[0].object, soulId = null;
    while (obj && !soulId) { soulId = obj.userData.soulId; obj = obj.parent; }
    if (soulId) {
      selectedId = soulId;
      avatars.forEach(a => a?.setSelected(a.id === soulId));
      openSoulPanel(soulId);
    }
  }
}

// ─── Zoom to Soul ─────────────────────────────────────────────────────────────

export function zoomToSoul(soulId) {
  const avatar = avatars.find(a => a?.id === soulId);
  if (!avatar) return;

  // Switch floor filter to show this soul's floor
  const floorIdx = avatar.floorIndex;
  setActiveFloor(floorIdx);
  document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.floor-btn[data-floor="${floorIdx}"]`);
  if (btn) btn.classList.add('active');

  // Zoom camera target to the avatar's XZ position
  const pos = avatar.group.position;
  controls.target.set(pos.x, pos.y + 1, pos.z);
  cameraTargetY = pos.y + 1;

  // Zoom in by reducing orthographic frustum size
  const targetD = 14;
  const currentD = Math.abs(camera.top);
  if (currentD > targetD) {
    const aspect = window.innerWidth / window.innerHeight;
    camera.top    =  targetD;
    camera.bottom = -targetD;
    camera.left   = -targetD * aspect;
    camera.right  =  targetD * aspect;
    camera.updateProjectionMatrix();
  }

  controls.update();
}

// ─── Animation Loop ───────────────────────────────────────────────────────────

let lastTime = 0;

function animate(ts = 0) {
  requestAnimationFrame(animate);
  const delta = Math.min((ts - lastTime) / 1000, 0.1);
  lastTime = ts;

  controls.target.y += (cameraTargetY - controls.target.y) * 0.05;
  controls.update();

  avatars.forEach(a => a?.update(delta, ts));

  for (let i = furnitureAnimations.length - 1; i >= 0; i--) {
    const anim = furnitureAnimations[i];
    anim.model.position.lerp(anim.target, delta * 1.5);
    if (anim.model.position.distanceTo(anim.target) < 0.05) {
      anim.model.position.copy(anim.target);
      furnitureAnimations.splice(i, 1);
    }
  }

  scene.traverse(obj => {
    if (obj.userData.isBlink) {
      obj.material.opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(ts * 0.003));
      obj.material.transparent = true;
    }
  });

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
