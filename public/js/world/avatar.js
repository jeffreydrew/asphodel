// ─── Asphodel Tower — SoulAvatar ─────────────────────────────────────────────
// Manages the 3D avatar for one soul: GLB character model, walking state machine,
// task spots, sitting/computer poses, furniture rearrangement, and name label.
//
// State machine: WANDER → WALKING_TO_TASK → DOING_TASK → WANDER
// Exports: SoulAvatar, randomWanderPoint(floorY)

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { FLOORS, FLOOR_SIZE, SOUL_COLORS, ACTION_TASK_MAP, ELEV_X, ELEV_Z, FLOOR_WALLS, WANDER_ZONES } from './constants.js';
import { findPath } from './pathfinding.js';

// ─── Wander helper ────────────────────────────────────────────────────────────

export function randomWanderPoint(floorY, floorIndex = -1) {
  const zones = WANDER_ZONES[floorIndex];
  if (!zones || zones.length === 0) {
    let x, z;
    do {
      x = Math.random() * 70 - 35;
      z = Math.random() * 70 - 35;
    } while (Math.sqrt((x - ELEV_X) ** 2 + (z - ELEV_Z) ** 2) < 1.8);
    return new THREE.Vector3(x, floorY, z);
  }
  const zone = zones[Math.floor(Math.random() * zones.length)];
  const [x1, z1, x2, z2] = zone;
  let x, z, attempts = 0;
  do {
    x = x1 + Math.random() * (x2 - x1);
    z = z1 + Math.random() * (z2 - z1);
    if (++attempts > 20) { x = (x1 + x2) / 2; z = (z1 + z2) / 2; break; }
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
    this.wanderTarget   = randomWanderPoint(0, 0);
    this.wanderTimer    = Math.random() * 4000;
    this.wanderDelay    = 3000 + Math.random() * 5000;
    this.isMoving       = false;
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
    this._taskSeatY    = 0;
    this._walkTimer    = 0;

    // A* pathfinding waypoints
    this._path         = [];    // array of {x, z} waypoints
    this._pathIdx      = 0;     // current waypoint index

    this.group = new THREE.Group();
    scene.add(this.group);

    // Invisible hitbox for raycasting
    this.torso = new THREE.Mesh(
      new THREE.BoxGeometry(1.125, 3.125, 0.875),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.torso.position.y = 1.70;
    this.torso.visible    = false;
    this.torso.userData.soulId = soul.id;
    this.group.add(this.torso);
    this._torsoY = this.torso.position.y;
    this._headY  = this.torso.position.y;

    // Ground ring
    const ringMat = new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.45 });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.50, 0.0625, 6, 20), ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.01;
    this.group.add(this.ring);

    // Task ring (pulsing green when DOING_TASK)
    const taskRingMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0 });
    this.taskRing = new THREE.Mesh(new THREE.TorusGeometry(0.70, 0.0875, 6, 24), taskRingMat);
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
    this.label.position.y = 3.875;
    this.group.add(this.label);

    // Speech bubble
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'speech-bubble';
    bubbleDiv.id        = `bubble-${soul.id}`;
    bubbleDiv.style.display = 'none';
    this.bubbleEl = bubbleDiv;
    this.bubble = new CSS2DObject(bubbleDiv);
    this.bubble.position.y = 4.6;
    this.group.add(this.bubble);
    this._bubbleTimer = null;

    this.group.position.copy(this.wanderTarget);

    this._buildRobloxChar(soul);
  }

  // ─── Roblox-style blocky character ────────────────────────────────────────

  _buildRobloxChar(soul) {
    const mat = new THREE.MeshLambertMaterial({
      color:    this.color,
      emissive: new THREE.Color(this.color).multiplyScalar(0.1),
    });
    const darkMat = new THREE.MeshLambertMaterial({
      color:    new THREE.Color(this.color).multiplyScalar(0.50),
      emissive: new THREE.Color(this.color).multiplyScalar(0.05),
    });

    // Dimensions (×2.5 from original)
    const LEG_H   = 0.75;
    const TORSO_H = 0.95;
    const HEAD_S  = 0.70;
    const ARM_H   = 0.75;

    // Legs — pivot group at hip, mesh offset down
    this.legLPivot = new THREE.Group();
    this.legLPivot.position.set(-0.225, LEG_H, 0);
    const legLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, LEG_H, 0.35), darkMat.clone());
    legLMesh.position.y = -LEG_H / 2;
    this.legLPivot.add(legLMesh);
    this.group.add(this.legLPivot);

    this.legRPivot = new THREE.Group();
    this.legRPivot.position.set( 0.225, LEG_H, 0);
    const legRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, LEG_H, 0.35), darkMat.clone());
    legRMesh.position.y = -LEG_H / 2;
    this.legRPivot.add(legRMesh);
    this.group.add(this.legRPivot);

    // Torso
    this.torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.80, TORSO_H, 0.45), mat.clone());
    this.torsoMesh.position.y = LEG_H + TORSO_H / 2;
    this.torsoMesh.userData.soulId = soul.id;
    this.group.add(this.torsoMesh);

    // Arms — pivot group at shoulder, mesh offset down
    this.armLPivot = new THREE.Group();
    this.armLPivot.position.set(-0.55, LEG_H + TORSO_H, 0);
    const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.30, ARM_H, 0.30), darkMat.clone());
    armLMesh.position.y = -ARM_H / 2;
    this.armLPivot.add(armLMesh);
    this.group.add(this.armLPivot);

    this.armRPivot = new THREE.Group();
    this.armRPivot.position.set( 0.55, LEG_H + TORSO_H, 0);
    const armRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.30, ARM_H, 0.30), darkMat.clone());
    armRMesh.position.y = -ARM_H / 2;
    this.armRPivot.add(armRMesh);
    this.group.add(this.armRPivot);

    // Head
    this.headMesh = new THREE.Mesh(new THREE.BoxGeometry(HEAD_S, HEAD_S, HEAD_S), mat.clone());
    this.headMesh.position.y = LEG_H + TORSO_H + HEAD_S / 2 + 0.075;
    this.headMesh.userData.soulId = soul.id;
    this.group.add(this.headMesh);

    this._torsoY = this.torsoMesh.position.y;
    this._headY  = this.headMesh.position.y;

    this._glbMeshes = [this.torsoMesh, this.headMesh,
      ...this.armLPivot.children, ...this.armRPivot.children,
      ...this.legLPivot.children, ...this.legRPivot.children];
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
      this.wanderTarget     = randomWanderPoint(newFloorY, newIndex);
      this.wanderTimer      = 0;
      this.state            = 'WANDER';
      this.taskRing.visible = false;
      this.ring.visible     = true;
      this.torsoMesh.position.y = this._torsoY;
      this.headMesh.position.y  = this._headY;
      this.legLPivot.rotation.x = this.legRPivot.rotation.x = 0;
      this.armLPivot.rotation.x = this.armRPivot.rotation.x = 0;
      this._computePath(this.wanderTarget.x, this.wanderTarget.z);
    }

    if (this.state !== 'WANDER') return;

    const lookupAction = (isWorkHours && action === 'meet_soul') ? 'meet_soul_office' : action;
    let taskDef = ACTION_TASK_MAP[lookupAction] ?? ACTION_TASK_MAP[action];
    if (!taskDef && isWorkHours) taskDef = ACTION_TASK_MAP['browse_jobs'];

    if (!taskDef) {
      // Keyword floor fallback for novel action labels
      const l = action.toLowerCase();
      let inferredFloorIndex = 0; // lobby default
      if (/rest|sleep|nap/.test(l))      inferredFloorIndex = 4; // BEDROOM
      else if (/eat|cook|food/.test(l))  inferredFloorIndex = 1; // KITCHEN
      else if (/work|job|apply/.test(l)) inferredFloorIndex = 2; // OFFICE
      else if (/exercise|gym|yoga/.test(l)) inferredFloorIndex = 3; // GYM
      else if (/read|write|book|art|journal|research/.test(l)) inferredFloorIndex = 5; // LIBRARY

      const inferredFloor = FLOORS[inferredFloorIndex];
      if (inferredFloor && inferredFloorIndex !== this.floorIndex) {
        this.floorIndex       = inferredFloorIndex;
        this.floorY           = inferredFloor.y;
        this.group.position.y = inferredFloor.y;
        this.wanderTarget     = randomWanderPoint(inferredFloor.y, inferredFloorIndex);
        this.wanderTimer      = 0;
        this.state            = 'WANDER';
        this.taskRing.visible = false;
        this.ring.visible     = true;
        this.torsoMesh.position.y = this._torsoY;
        this.headMesh.position.y  = this._headY;
        this.legLPivot.rotation.x = this.legRPivot.rotation.x = 0;
        this.armLPivot.rotation.x = this.armRPivot.rotation.x = 0;
        this._computePath(this.wanderTarget.x, this.wanderTarget.z);
      }
      return;
    }

    if (taskDef) {
      const xz = taskDef.spots[this.index % taskDef.spots.length];
      this.taskTarget   = new THREE.Vector3(xz[0], this.floorY, xz[1]);
      this.taskDuration = taskDef.ms;
      this.taskTimer    = 0;
      this.isSitting    = taskDef.sit      ?? false;
      this.isAtComputer = taskDef.computer ?? false;
      this._taskSeatY   = taskDef.seatY    ?? 0;
      this._walkTimer   = 0;
      this.state        = 'WALKING_TO_TASK';
      this._computePath(xz[0], xz[1]);
    }
  }

  // ─── Pathfinding helper ───────────────────────────────────────────────────

  _computePath(targetX, targetZ) {
    const path = findPath(
      this.floorIndex,
      this.group.position.x, this.group.position.z,
      targetX, targetZ,
    );
    this._path    = path ?? [{ x: targetX, z: targetZ }];
    this._pathIdx = 0;
  }

  _currentWaypoint() {
    if (this._pathIdx < this._path.length) return this._path[this._pathIdx];
    return null;
  }

  // ─── Per-frame update ─────────────────────────────────────────────────────

  update(delta, ts) {
    const WALK_SPEED = 6.0;

    if (this.state === 'WANDER') {
      this.wanderTimer += delta * 1000;
      if (this.wanderTimer >= this.wanderDelay) {
        this.wanderTarget = randomWanderPoint(this.floorY, this.floorIndex);
        this.wanderTimer  = 0;
        this.wanderDelay  = 3000 + Math.random() * 5000;
        this._computePath(this.wanderTarget.x, this.wanderTarget.z);
      }

      const wp = this._currentWaypoint();
      if (wp) {
        const dx = wp.x - this.group.position.x;
        const dz = wp.z - this.group.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.3) {
          this.isMoving = true;
          const step = Math.min(WALK_SPEED * delta, dist);
          this.group.position.x += (dx / dist) * step;
          this.group.position.z += (dz / dist) * step;
        } else {
          this._pathIdx++;
          if (this._pathIdx >= this._path.length) {
            this.isMoving = false;
          }
        }
      } else {
        this.isMoving = false;
      }
      this.group.position.y = this.floorY;

    } else if (this.state === 'WALKING_TO_TASK') {
      this._walkTimer += delta * 1000;
      if (this._walkTimer > 30_000) {
        // Stuck — give up and wander
        this.state            = 'WANDER';
        this.taskRing.visible = false;
        this.ring.visible     = true;
        this.wanderTarget     = randomWanderPoint(this.floorY, this.floorIndex);
        this.wanderTimer      = 0;
        this.wanderDelay      = 3000 + Math.random() * 5000;
        this._walkTimer       = 0;
        this._path            = [];
        this._pathIdx         = 0;
      } else {
        const wp = this._currentWaypoint();
        if (wp) {
          const dx = wp.x - this.group.position.x;
          const dz = wp.z - this.group.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);

          if (dist > 0.3) {
            this.isMoving = true;
            const step = Math.min(WALK_SPEED * delta, dist);
            this.group.position.x += (dx / dist) * step;
            this.group.position.z += (dz / dist) * step;
            this.group.position.y = this.floorY;
          } else {
            this._pathIdx++;
            if (this._pathIdx >= this._path.length) {
              // Arrived at task target
              this.group.position.set(this.taskTarget.x, this.floorY + this._taskSeatY, this.taskTarget.z);
              this.state            = 'DOING_TASK';
              this.taskTimer        = 0;
              this.isMoving         = false;
              this.taskRing.visible = true;
              this.ring.visible     = false;
            }
          }
        } else {
          // No path — snap directly
          this.group.position.set(this.taskTarget.x, this.floorY + this._taskSeatY, this.taskTarget.z);
          this.state            = 'DOING_TASK';
          this.taskTimer        = 0;
          this.isMoving         = false;
          this.taskRing.visible = true;
          this.ring.visible     = false;
        }
      }

    } else if (this.state === 'DOING_TASK') {
      this.isMoving   = false;
      this.taskTimer += delta * 1000;
      this.taskRing.material.opacity = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(ts * 0.004));

      if (this.isSitting || this.isAtComputer) {
        // Sitting pose — legs bent, lowered position
        this.legLPivot.rotation.x = -Math.PI / 2;
        this.legRPivot.rotation.x = -Math.PI / 2;
        if (this.isAtComputer) {
          this.armLPivot.rotation.x = -0.45;
          this.armRPivot.rotation.x = -0.45;
        } else {
          this.armLPivot.rotation.x = 0;
          this.armRPivot.rotation.x = 0;
        }
        const breathe = Math.sin(ts * 0.0012 + this.index * 1.5) * 0.006;
        this.torsoMesh.position.y = this._torsoY - 0.08 + breathe;
        this.headMesh.position.y  = this._headY  - 0.08 + breathe;
      } else {
        // Standing task (exercise, art, etc.)
        this.legLPivot.rotation.x = 0;
        this.legRPivot.rotation.x = 0;
        this.armLPivot.rotation.x = 0;
        this.armRPivot.rotation.x = 0;
        const bob = Math.abs(Math.sin(ts * 0.003)) * 0.04;
        this.torsoMesh.position.y = this._torsoY + bob;
        this.headMesh.position.y  = this._headY  + bob;
      }

      if (this.taskTimer >= this.taskDuration) {
        this.state            = 'WANDER';
        this.taskRing.visible = false;
        this.ring.visible     = true;
        this.wanderTarget     = randomWanderPoint(this.floorY, this.floorIndex);
        this.wanderTimer      = 0;
        this.wanderDelay      = 8000 + Math.random() * 10000;
        this.group.position.y = this.floorY;
        this.torsoMesh.position.y = this._torsoY;
        this.headMesh.position.y  = this._headY;
        this.legLPivot.rotation.x = this.legRPivot.rotation.x = 0;
        this.armLPivot.rotation.x = this.armRPivot.rotation.x = 0;
        this._computePath(this.wanderTarget.x, this.wanderTarget.z);
      }
      return;
    }

    // Face direction of travel — use current waypoint for smooth turning
    if (this.isMoving) {
      const wp = this._currentWaypoint();
      if (wp) {
        const dx = wp.x - this.group.position.x;
        const dz = wp.z - this.group.position.z;
        if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
          const targetAngle = Math.atan2(dx, dz);
          // Smooth rotation interpolation
          let diff = targetAngle - this.group.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.group.rotation.y += diff * 0.15;
        }
      }
    }

    // Walk / idle animation
    if (this.isMoving) {
      const walk = ts * 0.007;
      const bob  = Math.abs(Math.sin(walk)) * 0.03;
      this.legLPivot.rotation.x  =  Math.sin(walk) * 0.65;
      this.legRPivot.rotation.x  = -Math.sin(walk) * 0.65;
      this.armLPivot.rotation.x  = -Math.sin(walk) * 0.45;
      this.armRPivot.rotation.x  =  Math.sin(walk) * 0.45;
      this.torsoMesh.position.y  = this._torsoY + bob;
      this.headMesh.position.y   = this._headY  + bob;
      this.group.rotation.x = 0.04;
    } else {
      const breathe = Math.sin(ts * 0.0014 + this.index * 1.5) * 0.006;
      this.legLPivot.rotation.x = 0;
      this.legRPivot.rotation.x = 0;
      this.armLPivot.rotation.x = 0;
      this.armRPivot.rotation.x = 0;
      this.torsoMesh.position.y = this._torsoY + breathe;
      this.headMesh.position.y  = this._headY  + breathe;
      this.group.rotation.x = 0;
    }
  }

  // ─── Wall collision ────────────────────────────────────────────────────────

  _applyWallCollision(prevX, prevZ) {
    const r     = 0.6;
    const walls = FLOOR_WALLS[this.floorIndex];
    if (!walls) return;
    const pos   = this.group.position;

    for (const wall of walls) {
      if (wall.axis === 'x') {
        if (pos.z >= wall.min - r && pos.z <= wall.max + r) {
          if (Math.abs(pos.x - wall.value) < r) {
            const side = prevX >= wall.value ? 1 : -1;
            pos.x = wall.value + side * r;
          }
        }
      } else {
        if (pos.x >= wall.min - r && pos.x <= wall.max + r) {
          if (Math.abs(pos.z - wall.value) < r) {
            const side = prevZ >= wall.value ? 1 : -1;
            pos.z = wall.value + side * r;
          }
        }
      }
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

  // ─── Speech bubble ──────────────────────────────────────────────────────────

  showSpeechBubble(text, durationMs = 6000) {
    if (!this.bubbleEl) return;

    // Truncate long text
    const display = text.length > 100 ? text.substring(0, 97) + '…' : text;
    this.bubbleEl.textContent = display;
    this.bubbleEl.style.display = '';
    this.bubbleEl.classList.remove('fade-out');
    this.bubbleEl.classList.add('fade-in');

    // Clear any existing timer
    if (this._bubbleTimer) clearTimeout(this._bubbleTimer);

    // Start fade-out before hiding
    this._bubbleTimer = setTimeout(() => {
      this.bubbleEl.classList.remove('fade-in');
      this.bubbleEl.classList.add('fade-out');
      setTimeout(() => {
        this.bubbleEl.style.display = 'none';
        this.bubbleEl.classList.remove('fade-out');
      }, 400);
    }, durationMs);
  }
}
