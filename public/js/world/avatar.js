// ─── Asphodel Tower — SoulAvatar ─────────────────────────────────────────────
// Manages the 3D avatar for one soul: GLB character model, walking state machine,
// task spots, sitting/computer poses, furniture rearrangement, and name label.
//
// State machine: WANDER → WALKING_TO_TASK → DOING_TASK → WANDER
// Exports: SoulAvatar, randomWanderPoint(floorY)

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { FLOORS, FLOOR_SIZE, SOUL_COLORS, ACTION_TASK_MAP, ELEV_X, ELEV_Z } from './constants.js';

// ─── Wander helper ────────────────────────────────────────────────────────────

export function randomWanderPoint(floorY) {
  let x, z;
  do {
    x = (Math.random() - 0.5) * 12;
    z = (Math.random() - 0.5) * 12;
  } while (Math.sqrt((x - ELEV_X) ** 2 + (z - ELEV_Z) ** 2) < 1.8);
  return new THREE.Vector3(x, floorY, z);
}

// ─── SoulAvatar ───────────────────────────────────────────────────────────────

export class SoulAvatar {
  /**
   * @param {object} soul           - soul data object { id, name }
   * @param {number} index          - soul index (0–4)
   * @param {THREE.Scene} scene     - shared scene
   * @param {GLTFLoader} gltfLoader - shared loader
   * @param {object} worldCtx       - { furnitureMeshes, furnitureAnimations, getDragTarget }
   */
  constructor(soul, index, scene, gltfLoader, worldCtx) {
    this.id             = soul.id;
    this.name           = soul.name;
    this.index          = index;
    this.color          = SOUL_COLORS[index] ?? 0xffffff;
    this.floorY         = 0;
    this.floorIndex     = 0;
    this.wanderTarget   = randomWanderPoint(0);
    this.wanderTimer    = Math.random() * 4000;
    this.wanderDelay    = 3000 + Math.random() * 5000;
    this.isMoving       = false;
    this.rearrangeTimer = 20000 + Math.random() * 20000;
    this._glbMeshes     = [];
    this._ctx           = worldCtx;

    // Task state machine
    this.state         = 'WANDER';
    this.taskTarget    = null;
    this.taskDuration  = 0;
    this.taskTimer     = 0;
    this.currentAction = 'idle';
    this.isSitting     = false;
    this.isAtComputer  = false;

    this.modelRoot = null;
    this.legL      = null;
    this.legR      = null;

    this.group = new THREE.Group();
    scene.add(this.group);

    // Invisible hitbox for raycasting
    this.torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 1.25, 0.35),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.torso.position.y = 0.62;
    this.torso.visible    = false;
    this.torso.userData.soulId = soul.id;
    this.group.add(this.torso);
    this.head    = this.torso;
    this.body    = this.torso;
    this._torsoY = this.torso.position.y;
    this._headY  = this.torso.position.y;

    // Ground ring
    const ringMat = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.45 });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.025, 6, 20), ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.01;
    this.group.add(this.ring);

    // Task ring (pulsing green when DOING_TASK)
    const taskRingMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0 });
    this.taskRing = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 24), taskRingMat);
    this.taskRing.rotation.x = Math.PI / 2;
    this.taskRing.position.y = 0.01;
    this.taskRing.visible    = false;
    this.group.add(this.taskRing);

    // Name label
    const labelDiv = document.createElement('div');
    labelDiv.className   = 'soul-label';
    labelDiv.textContent = soul.name.split(' ')[0];
    labelDiv.id          = `lbl-${soul.id}`;
    this.label = new CSS2DObject(labelDiv);
    this.label.position.y = 1.45;
    this.group.add(this.label);

    this.group.position.copy(this.wanderTarget);

    // Load GLB character
    gltfLoader.load('/models/characters/sim_base.glb', (gltf) => {
      this.modelRoot = gltf.scene;
      this.modelRoot.scale.setScalar(0.55);
      this.modelRoot.userData.soulId = soul.id;

      const mat = new THREE.MeshLambertMaterial({
        color:    this.color,
        emissive: new THREE.Color(this.color).multiplyScalar(0.1),
      });
      this.modelRoot.traverse(child => {
        if (child.isMesh) {
          child.material = mat.clone();
          child.userData.soulId = soul.id;
          this._glbMeshes.push(child);
        }
      });
      this.group.add(this.modelRoot);
    }, undefined, () => { this._buildFallback(soul); });
  }

  // ─── Fallback procedural geometry ─────────────────────────────────────────

  _buildFallback(soul) {
    const mat = new THREE.MeshLambertMaterial({
      color:    this.color,
      emissive: new THREE.Color(this.color).multiplyScalar(0.1),
    });
    const legMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(this.color).multiplyScalar(0.55),
    });

    const LEG_H = 0.28, TORSO_H = 0.36, HEAD_R = 0.13;

    this.legL = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, LEG_H, 6), legMat);
    this.legR = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, LEG_H, 6), legMat);
    this.legL.position.set(-0.062, LEG_H / 2, 0);
    this.legR.position.set( 0.062, LEG_H / 2, 0);
    this.group.add(this.legL);
    this.group.add(this.legR);

    const torsoMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.13, TORSO_H, 7), mat);
    torsoMesh.position.y = LEG_H + TORSO_H / 2;
    torsoMesh.userData.soulId = soul.id;
    this.group.add(torsoMesh);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 8, 7), mat.clone());
    headMesh.position.y = LEG_H + TORSO_H + HEAD_R;
    headMesh.userData.soulId = soul.id;
    this.group.add(headMesh);

    this._torsoY = torsoMesh.position.y;
    this._headY  = headMesh.position.y;
    this._glbMeshes = [torsoMesh, headMesh];
  }

  // ─── Floor / task assignment ───────────────────────────────────────────────

  setFloor(action) {
    this.currentAction = action;
    const hour = new Date().getHours();
    const isWorkHours = hour >= 9 && hour < 17;

    const targetFloor = isWorkHours
      ? FLOORS.find(f => f.label === 'OFFICE')
      : (FLOORS.find(f => f.actions.includes(action)) ?? FLOORS[0]);

    const newIndex  = FLOORS.indexOf(targetFloor);
    const newFloorY = targetFloor.y;

    if (newIndex !== this.floorIndex) {
      this.floorIndex       = newIndex;
      this.floorY           = newFloorY;
      this.group.position.y = newFloorY;
      this.wanderTarget     = randomWanderPoint(newFloorY);
      this.wanderTimer      = 0;
      this.state            = 'WANDER';
      this.taskRing.visible = false;
      this.ring.visible     = true;
      if (this.modelRoot) { this.modelRoot.position.y = 0; this.modelRoot.rotation.x = 0; }
    }

    if (this.state !== 'WANDER') return;

    const lookupAction = (isWorkHours && action === 'meet_soul') ? 'meet_soul_office' : action;
    let taskDef = ACTION_TASK_MAP[lookupAction] ?? ACTION_TASK_MAP[action];
    if (!taskDef && isWorkHours) taskDef = ACTION_TASK_MAP['browse_jobs'];

    if (taskDef) {
      const xz = taskDef.spots[this.index % taskDef.spots.length];
      this.taskTarget   = new THREE.Vector3(xz[0], this.floorY, xz[1]);
      this.taskDuration = taskDef.ms;
      this.taskTimer    = 0;
      this.isSitting    = taskDef.sit    ?? false;
      this.isAtComputer = taskDef.computer ?? false;
      this.state        = 'WALKING_TO_TASK';
    }
  }

  // ─── Furniture rearrangement ───────────────────────────────────────────────

  tryRearrangeFurniture() {
    const { furnitureMeshes, furnitureAnimations, getDragTarget } = this._ctx;
    const myItems = furnitureMeshes.filter(f => f.floorIndex === this.floorIndex);
    if (myItems.length === 0) return;

    const item = myItems[Math.floor(Math.random() * myItems.length)];
    if (furnitureAnimations.some(a => a.model === item.model)) return;
    if (getDragTarget() === item.model) return;

    const half = FLOOR_SIZE / 2 - 1.5;
    let nx = (Math.random() - 0.5) * half * 2;
    let nz = (Math.random() - 0.5) * half * 2;
    if (Math.abs(nx) < 2.6 && Math.abs(nz) < 2.6) nx = nx < 0 ? -3.5 : 3.5;

    furnitureAnimations.push({
      model:  item.model,
      target: new THREE.Vector3(nx, item.model.position.y, nz),
    });
  }

  // ─── Per-frame update ─────────────────────────────────────────────────────

  update(delta, ts) {
    const WALK_SPEED = 1.8;

    if (this.state === 'WANDER') {
      this.wanderTimer += delta * 1000;
      if (this.wanderTimer >= this.wanderDelay) {
        this.wanderTarget = randomWanderPoint(this.floorY);
        this.wanderTimer  = 0;
        this.wanderDelay  = 3000 + Math.random() * 5000;
      }

      const to   = new THREE.Vector3().subVectors(this.wanderTarget, this.group.position);
      to.y       = 0;
      const dist = to.length();

      if (dist > 0.15) {
        this.isMoving = true;
        this.group.position.addScaledVector(to.normalize(), Math.min(WALK_SPEED * delta, dist));
      } else {
        this.isMoving = false;
        this.rearrangeTimer -= delta * 1000;
        if (this.rearrangeTimer <= 0) {
          this.rearrangeTimer = 20000 + Math.random() * 20000;
          this.tryRearrangeFurniture();
        }
      }
      this.group.position.y = this.floorY;

    } else if (this.state === 'WALKING_TO_TASK') {
      const to   = new THREE.Vector3().subVectors(this.taskTarget, this.group.position);
      to.y       = 0;
      const dist = to.length();

      if (dist < 0.15) {
        this.group.position.set(this.taskTarget.x, this.floorY, this.taskTarget.z);
        this.state            = 'DOING_TASK';
        this.taskTimer        = 0;
        this.isMoving         = false;
        this.taskRing.visible = true;
        this.ring.visible     = false;
      } else {
        this.isMoving = true;
        this.group.position.addScaledVector(to.normalize(), Math.min(WALK_SPEED * delta, dist));
        this.group.position.y = this.floorY;
      }

    } else if (this.state === 'DOING_TASK') {
      this.isMoving   = false;
      this.taskTimer += delta * 1000;
      this.taskRing.material.opacity = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(ts * 0.004));

      if (this.isSitting) {
        const breathe = Math.sin(ts * 0.0012 + this.index * 1.5) * 0.006;
        if (this.modelRoot) { this.modelRoot.position.y = -0.08 + breathe; this.modelRoot.rotation.x = 0.08; }
      } else if (this.isAtComputer) {
        if (this.modelRoot) { this.modelRoot.position.y = Math.sin(ts * 0.0008 + this.index) * 0.006; this.modelRoot.rotation.x = -0.10; }
      } else {
        if (this.modelRoot) { this.modelRoot.position.y = Math.abs(Math.sin(ts * 0.003)) * 0.04; this.modelRoot.rotation.x = 0; }
      }

      if (this.taskTimer >= this.taskDuration) {
        this.state            = 'WANDER';
        this.taskRing.visible = false;
        this.ring.visible     = true;
        this.wanderTarget     = randomWanderPoint(this.floorY);
        this.wanderTimer      = 0;
        this.wanderDelay      = 8000 + Math.random() * 10000;
        if (this.modelRoot) { this.modelRoot.position.y = 0; this.modelRoot.rotation.x = 0; }
      }
      return;
    }

    // Face direction of travel
    if (this.isMoving) {
      const tgt = (this.state === 'WALKING_TO_TASK') ? this.taskTarget : this.wanderTarget;
      const dx  = tgt.x - this.group.position.x;
      const dz  = tgt.z - this.group.position.z;
      this.group.rotation.y += (Math.atan2(dx, dz) - this.group.rotation.y) * 0.10;
    }

    // Walk animation
    if (this.isMoving) {
      const walk = ts * 0.006;
      const bob  = Math.abs(Math.sin(walk)) * 0.022;
      this.torso.position.y = this._torsoY + bob;
      if (this.legL) this.legL.rotation.x  =  Math.sin(walk) * 0.55;
      if (this.legR) this.legR.rotation.x  = -Math.sin(walk) * 0.55;
      if (this.modelRoot) { this.modelRoot.position.y = bob; this.modelRoot.rotation.x = 0; }
      this.group.rotation.x = 0.05;
    } else {
      const breathe = Math.sin(ts * 0.0014 + this.index * 1.5) * 0.007;
      this.torso.position.y = this._torsoY + breathe;
      if (this.legL) this.legL.rotation.x = 0;
      if (this.legR) this.legR.rotation.x = 0;
      if (this.modelRoot) { this.modelRoot.position.y = breathe; this.modelRoot.rotation.x = 0; }
      this.group.rotation.x = 0;
    }
  }

  // ─── Selection / pulse ────────────────────────────────────────────────────

  setSelected(selected) {
    const div = document.getElementById(`lbl-${this.id}`);
    if (div) div.className = `soul-label${selected ? ' selected' : ''}`;
    for (const m of this._glbMeshes) {
      if (m.material?.emissive) m.material.emissive.setScalar(selected ? 0.35 : 0.1);
    }
  }

  pulse() {
    if (this._glbMeshes.length === 0) return;
    const origColors = this._glbMeshes.map(m => m.material?.color?.clone());
    this._glbMeshes.forEach(m => m.material?.color?.set(0xffffff));
    setTimeout(() => {
      this._glbMeshes.forEach((m, i) => {
        if (origColors[i]) m.material?.color?.copy(origColors[i]);
      });
    }, 300);
  }
}
