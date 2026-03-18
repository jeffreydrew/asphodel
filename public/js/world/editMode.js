// ─── Asphodel Tower — Edit Mode ─────────────────────────────────────────────
// Provides an interactive editor for the 3D world: add/move/rotate furniture,
// add/move walls, and cut doorways. Toggled via the edit-mode button.
// Exports: EditMode class

import * as THREE from 'three';
import { FLOORS, FLOOR_SIZE, WALL_HEIGHT, KIT } from './constants.js';
import { invalidateAllNavGrids } from './pathfinding.js';

// ─── Furniture catalogue (subset of Kenney kit) ─────────────────────────────

const FURNITURE_CATALOGUE = [
  { id: 'loungeSofa',        label: 'Sofa',            file: 'loungeSofa.glb' },
  { id: 'loungeSofaLong',    label: 'Long Sofa',       file: 'loungeSofaLong.glb' },
  { id: 'loungeSofaCorner',  label: 'Corner Sofa',     file: 'loungeSofaCorner.glb' },
  { id: 'loungeChair',       label: 'Lounge Chair',    file: 'loungeChair.glb' },
  { id: 'loungeChairRelax',  label: 'Relax Chair',     file: 'loungeChairRelax.glb' },
  { id: 'chairDesk',         label: 'Desk Chair',      file: 'chairDesk.glb' },
  { id: 'chairRounded',      label: 'Rounded Chair',   file: 'chairRounded.glb' },
  { id: 'stoolBar',          label: 'Bar Stool',       file: 'stoolBar.glb' },
  { id: 'desk',              label: 'Desk',            file: 'desk.glb' },
  { id: 'deskCorner',        label: 'Corner Desk',     file: 'deskCorner.glb' },
  { id: 'table',             label: 'Table',           file: 'table.glb' },
  { id: 'tableRound',        label: 'Round Table',     file: 'tableRound.glb' },
  { id: 'tableCoffee',       label: 'Coffee Table',    file: 'tableCoffee.glb' },
  { id: 'tableCoffeeGlass',  label: 'Glass Coffee Tbl',file: 'tableCoffeeGlass.glb' },
  { id: 'bedDouble',         label: 'Double Bed',      file: 'bedDouble.glb' },
  { id: 'bedSingle',         label: 'Single Bed',      file: 'bedSingle.glb' },
  { id: 'bookcaseOpen',      label: 'Bookcase Open',   file: 'bookcaseOpen.glb' },
  { id: 'bookcaseClosed',    label: 'Bookcase Closed',  file: 'bookcaseClosed.glb' },
  { id: 'bookcaseClosedWide',label: 'Wide Bookcase',   file: 'bookcaseClosedWide.glb' },
  { id: 'kitchenCabinet',    label: 'Kitchen Cabinet',  file: 'kitchenCabinet.glb' },
  { id: 'kitchenFridge',     label: 'Fridge',          file: 'kitchenFridge.glb' },
  { id: 'kitchenStove',      label: 'Stove',           file: 'kitchenStove.glb' },
  { id: 'kitchenSink',       label: 'Sink',            file: 'kitchenSink.glb' },
  { id: 'computerScreen',    label: 'Monitor',         file: 'computerScreen.glb' },
  { id: 'laptop',            label: 'Laptop',          file: 'laptop.glb' },
  { id: 'benchCushion',      label: 'Bench',           file: 'benchCushion.glb' },
  { id: 'pottedPlant',       label: 'Plant',           file: 'pottedPlant.glb' },
  { id: 'lampSquareFloor',   label: 'Floor Lamp',      file: 'lampSquareFloor.glb' },
  { id: 'lampRoundFloor',    label: 'Round Lamp',      file: 'lampRoundFloor.glb' },
  { id: 'rugRectangle',      label: 'Rug Rect',        file: 'rugRectangle.glb' },
  { id: 'rugRound',          label: 'Rug Round',       file: 'rugRound.glb' },
  { id: 'trashcan',          label: 'Trashcan',        file: 'trashcan.glb' },
  { id: 'coatRackStanding',  label: 'Coat Rack',       file: 'coatRackStanding.glb' },
  { id: 'televisionModern',  label: 'TV',              file: 'televisionModern.glb' },
  { id: 'cabinetTelevision', label: 'TV Cabinet',      file: 'cabinetTelevision.glb' },
];

// ─── Edit Mode Tools ─────────────────────────────────────────────────────────

const TOOLS = {
  SELECT:  'select',
  ADD_FURNITURE: 'add-furniture',
  WALL:    'wall',
  DOORWAY: 'doorway',
};

// ─── EditMode Class ──────────────────────────────────────────────────────────

export class EditMode {
  constructor({ scene, camera, renderer, controls, floorGroups, furnitureMeshes, gltfLoader, getActiveFloor }) {
    this._scene          = scene;
    this._camera         = camera;
    this._renderer       = renderer;
    this._controls       = controls;
    this._floorGroups    = floorGroups;
    this._furnitureMeshes = furnitureMeshes;
    this._gltfLoader     = gltfLoader;
    this._getActiveFloor = getActiveFloor;

    this.enabled      = false;
    this._tool        = TOOLS.SELECT;
    this._selected    = null;       // selected furniture root or wall mesh
    this._isDragging  = false;
    this._dragOffset  = { x: 0, z: 0 };
    this._ghostMesh   = null;       // preview mesh for add-furniture
    this._selectedFurnitureId = null;

    // Wall drawing state (click-drag)
    this._wallDrawing = false;      // true while mouse is held for wall draw
    this._wallStart   = null;       // {x, z} snapped world coords
    this._wallPreview = null;       // preview mesh
    this._editWalls   = [];         // array of { mesh, floorIndex, x1, z1, x2, z2 }

    // Undo / redo stacks — each entry is { type, data }
    this._undoStack = [];
    this._redoStack = [];
    this._MAX_UNDO  = 80;

    // Grid overlay
    this._gridMesh  = null;
    this._gridFloor = -1;           // which floor index the grid is showing for

    // Raycasting
    this._raycaster   = new THREE.Raycaster();
    this._mouse       = new THREE.Vector2();
    this._dragPlane   = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._planeHit    = new THREE.Vector3();

    // Selection highlight
    this._highlightBox = null;

    // Bind handlers
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp   = this._handlePointerUp.bind(this);
    this._onKeyDown     = this._handleKeyDown.bind(this);

    this._buildUI();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  toggle() {
    this.enabled = !this.enabled;
    const panel = document.getElementById('edit-panel');
    const btn   = document.getElementById('edit-toggle-btn');
    if (this.enabled) {
      panel.classList.add('open');
      btn.classList.add('active');
      window.addEventListener('pointerdown', this._onPointerDown, true);
      window.addEventListener('pointermove', this._onPointerMove, true);
      window.addEventListener('pointerup',   this._onPointerUp, true);
      window.addEventListener('keydown',     this._onKeyDown);
      this._showGrid();
    } else {
      panel.classList.remove('open');
      btn.classList.remove('active');
      window.removeEventListener('pointerdown', this._onPointerDown, true);
      window.removeEventListener('pointermove', this._onPointerMove, true);
      window.removeEventListener('pointerup',   this._onPointerUp, true);
      window.removeEventListener('keydown',     this._onKeyDown);
      this._clearSelection();
      this._clearGhost();
      this._clearWallPreview();
      this._hideGrid();
      this._wallDrawing = false;
      this._wallStart = null;
    }
  }

  /** Call each frame (or on floor change) to keep the grid on the right floor */
  updateGrid() {
    if (!this.enabled) return;
    const fi = this._activeFloorIndex();
    if (fi !== this._gridFloor) this._showGrid();
  }

  // ─── UI Construction ──────────────────────────────────────────────────────

  _buildUI() {
    // Toggle button
    const toggleBtn = document.getElementById('edit-toggle-btn');
    toggleBtn.addEventListener('click', () => this.toggle());

    // Tool buttons
    document.querySelectorAll('.edit-tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._setTool(btn.dataset.tool);
      });
    });

    // Furniture catalogue
    this._buildCatalogue();

    // Delete button
    document.getElementById('edit-delete-btn').addEventListener('click', () => {
      this._deleteSelected();
    });

    // Undo / redo buttons
    document.getElementById('edit-undo-btn').addEventListener('click', () => this.undo());
    document.getElementById('edit-redo-btn').addEventListener('click', () => this.redo());

    // Scale controls
    const slider   = document.getElementById('edit-scale-slider');
    const scaleVal = document.getElementById('edit-scale-value');
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      scaleVal.textContent = v.toFixed(2);
      this._scaleSelected(v, false); // live preview — no undo entry yet
    });
    slider.addEventListener('change', () => {
      const v = parseFloat(slider.value);
      this._scaleSelected(v, true); // commit with undo on release
    });
    document.getElementById('edit-scale-down').addEventListener('click', () => {
      const cur = this._selected ? this._selected.scale.x : parseFloat(slider.value);
      const next = Math.max(0.5, parseFloat((cur - 0.25).toFixed(2)));
      this._applyScaleUI(next, true);
    });
    document.getElementById('edit-scale-up').addEventListener('click', () => {
      const cur = this._selected ? this._selected.scale.x : parseFloat(slider.value);
      const next = Math.min(15, parseFloat((cur + 0.25).toFixed(2)));
      this._applyScaleUI(next, true);
    });

    // Rotate buttons
    document.getElementById('edit-rot-left').addEventListener('click', () => {
      this._rotateSelected(Math.PI / 4);
    });
    document.getElementById('edit-rot-right').addEventListener('click', () => {
      this._rotateSelected(-Math.PI / 4);
    });
  }

  _buildCatalogue() {
    const list = document.getElementById('edit-furniture-list');
    for (const item of FURNITURE_CATALOGUE) {
      const el = document.createElement('div');
      el.className = 'edit-catalogue-item';
      el.textContent = item.label;
      el.dataset.furnitureId = item.id;
      el.addEventListener('click', () => {
        document.querySelectorAll('.edit-catalogue-item').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        this._selectedFurnitureId = item.id;
        this._setTool(TOOLS.ADD_FURNITURE);
      });
      list.appendChild(el);
    }
  }

  _setTool(tool) {
    this._tool = tool;
    document.querySelectorAll('.edit-tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    this._clearGhost();
    this._clearWallPreview();
    this._wallStart = null;

    const catPanel = document.getElementById('edit-furniture-catalogue');
    catPanel.style.display = tool === TOOLS.ADD_FURNITURE ? 'block' : 'none';

    this._renderer.domElement.style.cursor =
      tool === TOOLS.ADD_FURNITURE ? 'crosshair' :
      tool === TOOLS.WALL ? 'crosshair' :
      tool === TOOLS.DOORWAY ? 'crosshair' : '';
  }

  // ─── Floor helpers ────────────────────────────────────────────────────────

  _activeFloorIndex() {
    const f = this._getActiveFloor();
    return f === -1 ? 0 : f;
  }

  _activeFloorY() {
    return FLOORS[this._activeFloorIndex()]?.y ?? 0;
  }

  _activeGroup() {
    return this._floorGroups[this._activeFloorIndex()];
  }

  // ─── Raycasting helpers ───────────────────────────────────────────────────

  _updateMouse(e) {
    this._mouse.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
  }

  _hitFloorPlane(e) {
    this._updateMouse(e);
    this._raycaster.setFromCamera(this._mouse, this._camera);
    this._dragPlane.constant = -this._activeFloorY();
    if (this._raycaster.ray.intersectPlane(this._dragPlane, this._planeHit)) {
      return this._planeHit.clone();
    }
    return null;
  }

  _snapToGrid(v, gridSize = 2) {
    return Math.round(v / gridSize) * gridSize;
  }

  _hitFurniture(e) {
    this._updateMouse(e);
    this._raycaster.setFromCamera(this._mouse, this._camera);
    const meshes = [];
    this._furnitureMeshes.forEach(f => {
      if (f.model.parent && f.model.parent.visible === false) return;
      f.model.traverse(c => { if (c.isMesh) meshes.push(c); });
    });
    const hits = this._raycaster.intersectObjects(meshes);
    if (hits.length > 0) {
      return hits[0].object.userData.furnitureRoot ?? null;
    }
    return null;
  }

  _hitWall(e) {
    this._updateMouse(e);
    this._raycaster.setFromCamera(this._mouse, this._camera);
    const wallMeshes = [];
    this._editWalls.forEach(w => {
      if (w.floorIndex === this._activeFloorIndex()) wallMeshes.push(w.mesh);
    });
    // Also check built-in wall meshes in the active floor group
    const group = this._activeGroup();
    if (group) {
      group.traverse(c => {
        if (c.isMesh && c.userData.isEditableWall) wallMeshes.push(c);
      });
    }
    const hits = this._raycaster.intersectObjects(wallMeshes);
    if (hits.length > 0) return hits[0];
    return null;
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  _selectObject(obj) {
    this._clearSelection();
    this._selected = obj;
    if (!obj) return;

    // Add highlight box
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const hlGeo = new THREE.BoxGeometry(size.x + 0.4, size.y + 0.4, size.z + 0.4);
    const hlMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.2,
      depthTest: false,
    });
    this._highlightBox = new THREE.Mesh(hlGeo, hlMat);
    this._highlightBox.position.copy(center);
    this._highlightBox.renderOrder = 999;
    this._scene.add(this._highlightBox);

    // Show props panel
    document.getElementById('edit-props').style.display = 'block';
    this._syncScaleUI();
  }

  _clearSelection() {
    this._selected = null;
    if (this._highlightBox) {
      this._scene.remove(this._highlightBox);
      this._highlightBox.geometry.dispose();
      this._highlightBox.material.dispose();
      this._highlightBox = null;
    }
    document.getElementById('edit-props').style.display = 'none';
  }

  _deleteSelected() {
    if (!this._selected) return;
    const obj = this._selected;
    const parentGroup = obj.parent;
    this._clearSelection();

    // Determine type for undo
    const fIdx = this._furnitureMeshes.findIndex(f => f.model === obj);
    if (fIdx >= 0) {
      const entry = this._furnitureMeshes[fIdx];
      this._pushUndo({
        type: 'delete-furniture',
        data: { model: obj, floorIndex: entry.floorIndex, floorY: entry.floorY, parentGroup },
      });
      obj.parent?.remove(obj);
      this._furnitureMeshes.splice(fIdx, 1);
      return;
    }

    // Check if it's a wall
    if (obj.userData?.isEditableWall) {
      this._pushUndo({
        type: 'delete-wall',
        data: { mesh: obj, parentGroup, floorIndex: obj.userData.floorIndex ?? this._activeFloorIndex() },
      });
      obj.parent?.remove(obj);
      const wIdx = this._editWalls.findIndex(w => w.mesh === obj);
      if (wIdx >= 0) this._editWalls.splice(wIdx, 1);
      invalidateAllNavGrids();
    }
  }

  _rotateSelected(angle) {
    if (!this._selected) return;
    const oldRotY = this._selected.rotation.y;
    this._selected.rotation.y += angle;
    this._pushUndo({
      type: 'rotate',
      data: { obj: this._selected, oldRotY, newRotY: this._selected.rotation.y },
    });
    this._updateHighlight();
  }

  _scaleSelected(newScale, pushUndo) {
    if (!this._selected) return;
    if (!this._selected.userData?.isFurniture) return; // only scale furniture
    const oldScale = this._selected.scale.x;
    this._selected.scale.setScalar(newScale);
    this._updateHighlight();
    if (pushUndo && Math.abs(newScale - oldScale) > 0.001) {
      // If the last undo entry was also a scale on the same object (slider drag),
      // collapse it instead of stacking many tiny entries.
      const last = this._undoStack[this._undoStack.length - 1];
      if (last && last.type === 'scale' && last.data.obj === this._selected) {
        last.data.newScale = newScale;
      } else {
        this._pushUndo({ type: 'scale', data: { obj: this._selected, oldScale, newScale } });
      }
    }
  }

  _applyScaleUI(value, pushUndo) {
    const slider   = document.getElementById('edit-scale-slider');
    const scaleVal = document.getElementById('edit-scale-value');
    slider.value = value;
    scaleVal.textContent = value.toFixed(2);
    this._scaleSelected(value, pushUndo);
  }

  _syncScaleUI() {
    if (!this._selected) return;
    const v = this._selected.scale.x;
    const slider   = document.getElementById('edit-scale-slider');
    const scaleVal = document.getElementById('edit-scale-value');
    slider.value = Math.min(15, Math.max(0.5, v));
    scaleVal.textContent = v.toFixed(2);
  }

  _updateHighlight() {
    if (!this._selected || !this._highlightBox) return;
    const box = new THREE.Box3().setFromObject(this._selected);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    this._highlightBox.position.copy(center);
    this._highlightBox.scale.set(
      (size.x + 0.4) / 1, (size.y + 0.4) / 1, (size.z + 0.4) / 1,
    );
  }

  // ─── Ghost (furniture placement preview) ──────────────────────────────────

  _clearGhost() {
    if (this._ghostMesh) {
      this._scene.remove(this._ghostMesh);
      this._ghostMesh.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      this._ghostMesh = null;
    }
  }

  // ─── Grid overlay ───────────────────────────────────────────────────────────

  _showGrid() {
    this._hideGrid();
    const fi = this._activeFloorIndex();
    const y  = this._activeFloorY() + 0.02; // just above the slab
    const half = FLOOR_SIZE / 2;
    const step = 8; // matches the 8-unit grid squares

    const points = [];
    // Lines along X (east-west)
    for (let z = -half; z <= half; z += step) {
      points.push(new THREE.Vector3(-half, y, z), new THREE.Vector3(half, y, z));
    }
    // Lines along Z (north-south)
    for (let x = -half; x <= half; x += step) {
      points.push(new THREE.Vector3(x, y, -half), new THREE.Vector3(x, y, half));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.18, depthTest: false });
    this._gridMesh = new THREE.LineSegments(geo, mat);
    this._gridMesh.renderOrder = 1;
    this._scene.add(this._gridMesh);
    this._gridFloor = fi;
  }

  _hideGrid() {
    if (this._gridMesh) {
      this._scene.remove(this._gridMesh);
      this._gridMesh.geometry.dispose();
      this._gridMesh.material.dispose();
      this._gridMesh = null;
      this._gridFloor = -1;
    }
  }

  // ─── Undo / Redo ──────────────────────────────────────────────────────────

  _pushUndo(entry) {
    this._undoStack.push(entry);
    if (this._undoStack.length > this._MAX_UNDO) this._undoStack.shift();
    this._redoStack.length = 0; // clear redo on new action
    this._updateUndoButtons();
  }

  _updateUndoButtons() {
    const uBtn = document.getElementById('edit-undo-btn');
    const rBtn = document.getElementById('edit-redo-btn');
    if (uBtn) uBtn.disabled = this._undoStack.length === 0;
    if (rBtn) rBtn.disabled = this._redoStack.length === 0;
  }

  undo() {
    if (this._undoStack.length === 0) return;
    const entry = this._undoStack.pop();
    this._applyUndo(entry);
    this._redoStack.push(entry);
    this._updateUndoButtons();
    this._clearSelection();
  }

  redo() {
    if (this._redoStack.length === 0) return;
    const entry = this._redoStack.pop();
    this._applyRedo(entry);
    this._undoStack.push(entry);
    this._updateUndoButtons();
    this._clearSelection();
  }

  _applyUndo(entry) {
    switch (entry.type) {
      case 'add-furniture': {
        // Undo add → remove it
        const { model, floorIndex } = entry.data;
        model.parent?.remove(model);
        const idx = this._furnitureMeshes.findIndex(f => f.model === model);
        if (idx >= 0) this._furnitureMeshes.splice(idx, 1);
        break;
      }
      case 'delete-furniture': {
        // Undo delete → re-add it
        const { model, floorIndex, floorY, parentGroup } = entry.data;
        (parentGroup ?? this._floorGroups[floorIndex])?.add(model);
        this._furnitureMeshes.push({ model, floorIndex, floorY });
        break;
      }
      case 'move': {
        // Undo move → restore old position
        const { obj, oldPos } = entry.data;
        obj.position.set(oldPos.x, oldPos.y, oldPos.z);
        break;
      }
      case 'rotate': {
        const { obj, oldRotY } = entry.data;
        obj.rotation.y = oldRotY;
        break;
      }
      case 'add-wall': {
        const { mesh } = entry.data;
        mesh.parent?.remove(mesh);
        const wIdx = this._editWalls.findIndex(w => w.mesh === mesh);
        if (wIdx >= 0) this._editWalls.splice(wIdx, 1);
        invalidateAllNavGrids();
        break;
      }
      case 'delete-wall': {
        const { mesh, parentGroup, floorIndex } = entry.data;
        (parentGroup ?? this._floorGroups[floorIndex])?.add(mesh);
        invalidateAllNavGrids();
        break;
      }
      case 'scale': {
        const { obj, oldScale } = entry.data;
        obj.scale.setScalar(oldScale);
        this._syncScaleUI();
        break;
      }
      case 'cut-doorway': {
        // Undo doorway → remove new segments, restore original mesh
        const { originalMesh, newMeshes, parentGroup } = entry.data;
        for (const m of newMeshes) parentGroup?.remove(m);
        parentGroup?.add(originalMesh);
        invalidateAllNavGrids();
        break;
      }
    }
  }

  _applyRedo(entry) {
    switch (entry.type) {
      case 'add-furniture': {
        const { model, floorIndex, floorY, parentGroup } = entry.data;
        (parentGroup ?? this._floorGroups[floorIndex])?.add(model);
        this._furnitureMeshes.push({ model, floorIndex, floorY });
        break;
      }
      case 'delete-furniture': {
        const { model } = entry.data;
        model.parent?.remove(model);
        const idx = this._furnitureMeshes.findIndex(f => f.model === model);
        if (idx >= 0) this._furnitureMeshes.splice(idx, 1);
        break;
      }
      case 'move': {
        const { obj, newPos } = entry.data;
        obj.position.set(newPos.x, newPos.y, newPos.z);
        break;
      }
      case 'rotate': {
        const { obj, newRotY } = entry.data;
        obj.rotation.y = newRotY;
        break;
      }
      case 'add-wall': {
        const { mesh, parentGroup, floorIndex } = entry.data;
        (parentGroup ?? this._floorGroups[floorIndex])?.add(mesh);
        this._editWalls.push(entry.data);
        invalidateAllNavGrids();
        break;
      }
      case 'delete-wall': {
        const { mesh } = entry.data;
        mesh.parent?.remove(mesh);
        invalidateAllNavGrids();
        break;
      }
      case 'scale': {
        const { obj, newScale } = entry.data;
        obj.scale.setScalar(newScale);
        this._syncScaleUI();
        break;
      }
      case 'cut-doorway': {
        const { originalMesh, newMeshes, parentGroup } = entry.data;
        parentGroup?.remove(originalMesh);
        for (const m of newMeshes) parentGroup?.add(m);
        invalidateAllNavGrids();
        break;
      }
    }
  }

  // ─── Wall preview ─────────────────────────────────────────────────────────

  _clearWallPreview() {
    if (this._wallPreview) {
      this._scene.remove(this._wallPreview);
      this._wallPreview.geometry.dispose();
      this._wallPreview.material.dispose();
      this._wallPreview = null;
    }
  }

  _updateWallPreview(endX, endZ) {
    this._clearWallPreview();
    if (!this._wallStart) return;

    const sx = this._wallStart.x, sz = this._wallStart.z;
    const ex = this._snapToGrid(endX), ez = this._snapToGrid(endZ);

    // Snap to axis-aligned: pick the dominant axis
    let fx = ex, fz = ez;
    if (Math.abs(ex - sx) > Math.abs(ez - sz)) {
      fz = sz; // horizontal wall
    } else {
      fx = sx; // vertical wall
    }

    const len = Math.sqrt((fx - sx) ** 2 + (fz - sz) ** 2);
    if (len < 0.5) return;

    const wallY = this._activeFloorY() + WALL_HEIGHT / 2;
    const isHoriz = Math.abs(fz - sz) < 0.1;
    const geo = isHoriz
      ? new THREE.BoxGeometry(Math.abs(fx - sx), WALL_HEIGHT, 0.3)
      : new THREE.BoxGeometry(0.3, WALL_HEIGHT, Math.abs(fz - sz));
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.5 });
    this._wallPreview = new THREE.Mesh(geo, mat);
    this._wallPreview.position.set((sx + fx) / 2, wallY, (sz + fz) / 2);
    this._scene.add(this._wallPreview);
  }

  _placeWall(endX, endZ) {
    if (!this._wallStart) return;

    const sx = this._wallStart.x, sz = this._wallStart.z;
    const ex = this._snapToGrid(endX), ez = this._snapToGrid(endZ);

    let fx = ex, fz = ez;
    if (Math.abs(ex - sx) > Math.abs(ez - sz)) {
      fz = sz;
    } else {
      fx = sx;
    }

    const len = Math.sqrt((fx - sx) ** 2 + (fz - sz) ** 2);
    if (len < 1) { this._wallStart = null; this._clearWallPreview(); return; }

    const floorIndex = this._activeFloorIndex();
    const wallY = this._activeFloorY() + WALL_HEIGHT / 2;
    const isHoriz = Math.abs(fz - sz) < 0.1;
    const geo = isHoriz
      ? new THREE.BoxGeometry(Math.abs(fx - sx), WALL_HEIGHT, 0.2)
      : new THREE.BoxGeometry(0.2, WALL_HEIGHT, Math.abs(fz - sz));

    const wallColors = [0x5858c0, 0x4080b8, 0x3868b8, 0x389870, 0x8050b8, 0xc09050];
    const mat = new THREE.MeshLambertMaterial({
      color: wallColors[floorIndex] ?? 0x14143a,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((sx + fx) / 2, wallY, (sz + fz) / 2);
    mesh.userData.isEditableWall = true;
    mesh.userData.floorIndex = floorIndex;

    const parentGroup = this._activeGroup();
    parentGroup.add(mesh);
    const wallEntry = {
      mesh,
      floorIndex,
      x1: Math.min(sx, fx), z1: Math.min(sz, fz),
      x2: Math.max(sx, fx), z2: Math.max(sz, fz),
    };
    this._editWalls.push(wallEntry);

    this._pushUndo({
      type: 'add-wall',
      data: { mesh, parentGroup, floorIndex },
    });

    invalidateAllNavGrids();
    this._wallStart = null;
    this._wallDrawing = false;
    this._clearWallPreview();
  }

  // ─── Doorway cutting ──────────────────────────────────────────────────────

  _cutDoorway(hitResult) {
    const mesh = hitResult.object;
    const point = hitResult.point;
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);

    const sizeX = bb.max.x - bb.min.x;
    const sizeZ = bb.max.z - bb.min.z;
    const isHoriz = sizeX > sizeZ;

    const doorWidth = 8;
    const parentGroup = mesh.parent;
    const wallY = mesh.position.y;
    const mat = mesh.material.clone();
    const newMeshes = [];

    if (isHoriz) {
      const localX = point.x - worldPos.x;
      const halfDoor = doorWidth / 2;
      const leftEnd  = bb.min.x;
      const rightEnd = bb.max.x;
      const cutLeft  = localX - halfDoor;
      const cutRight = localX + halfDoor;

      parentGroup.remove(mesh);

      if (cutLeft > leftEnd + 0.5) {
        const lLen = cutLeft - leftEnd;
        const lGeo = new THREE.BoxGeometry(lLen, WALL_HEIGHT, sizeZ);
        const lMesh = new THREE.Mesh(lGeo, mat);
        lMesh.position.set(
          mesh.position.x + (leftEnd + cutLeft) / 2 - (leftEnd + rightEnd) / 2,
          wallY, mesh.position.z,
        );
        lMesh.userData.isEditableWall = true;
        parentGroup.add(lMesh);
        newMeshes.push(lMesh);
      }

      if (cutRight < rightEnd - 0.5) {
        const rLen = rightEnd - cutRight;
        const rGeo = new THREE.BoxGeometry(rLen, WALL_HEIGHT, sizeZ);
        const rMesh = new THREE.Mesh(rGeo, mat);
        rMesh.position.set(
          mesh.position.x + (cutRight + rightEnd) / 2 - (leftEnd + rightEnd) / 2,
          wallY, mesh.position.z,
        );
        rMesh.userData.isEditableWall = true;
        parentGroup.add(rMesh);
        newMeshes.push(rMesh);
      }
    } else {
      const localZ = point.z - worldPos.z;
      const halfDoor = doorWidth / 2;
      const botEnd = bb.min.z;
      const topEnd = bb.max.z;
      const cutBot = localZ - halfDoor;
      const cutTop = localZ + halfDoor;

      parentGroup.remove(mesh);

      if (cutBot > botEnd + 0.5) {
        const bLen = cutBot - botEnd;
        const bGeo = new THREE.BoxGeometry(sizeX, WALL_HEIGHT, bLen);
        const bMesh = new THREE.Mesh(bGeo, mat);
        bMesh.position.set(
          mesh.position.x, wallY,
          mesh.position.z + (botEnd + cutBot) / 2 - (botEnd + topEnd) / 2,
        );
        bMesh.userData.isEditableWall = true;
        parentGroup.add(bMesh);
        newMeshes.push(bMesh);
      }

      if (cutTop < topEnd - 0.5) {
        const tLen = topEnd - cutTop;
        const tGeo = new THREE.BoxGeometry(sizeX, WALL_HEIGHT, tLen);
        const tMesh = new THREE.Mesh(tGeo, mat);
        tMesh.position.set(
          mesh.position.x, wallY,
          mesh.position.z + (cutTop + topEnd) / 2 - (botEnd + topEnd) / 2,
        );
        tMesh.userData.isEditableWall = true;
        parentGroup.add(tMesh);
        newMeshes.push(tMesh);
      }
    }

    // Remove from edit walls tracking
    const wIdx = this._editWalls.findIndex(w => w.mesh === mesh);
    if (wIdx >= 0) this._editWalls.splice(wIdx, 1);

    this._pushUndo({
      type: 'cut-doorway',
      data: { originalMesh: mesh, newMeshes, parentGroup },
    });

    invalidateAllNavGrids();
  }

  // ─── Pointer Event Handlers ───────────────────────────────────────────────

  _handlePointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('#edit-panel, #edit-toggle-btn, #floor-filter, #world-log, #world-clock, #chat-bar, #soul-panel, #archive-panel, #log-panel')) return;

    if (this._tool === TOOLS.SELECT) {
      // Try furniture
      const furn = this._hitFurniture(e);
      if (furn) {
        e.stopPropagation();
        this._selectObject(furn);
        this._isDragging = true;
        this._dragOldPos = furn.position.clone();
        this._controls.enabled = false;
        this._dragPlane.constant = -this._activeFloorY();
        const hit = this._hitFloorPlane(e);
        if (hit) {
          this._dragOffset.x = hit.x - furn.position.x;
          this._dragOffset.z = hit.z - furn.position.z;
        }
        this._renderer.domElement.style.cursor = 'grabbing';
        return;
      }
      // Try walls
      const wallHit = this._hitWall(e);
      if (wallHit) {
        e.stopPropagation();
        this._selectObject(wallHit.object);
        this._isDragging = true;
        this._dragOldPos = wallHit.object.position.clone();
        this._controls.enabled = false;
        this._dragPlane.constant = -this._activeFloorY();
        const hit = this._hitFloorPlane(e);
        if (hit) {
          this._dragOffset.x = hit.x - wallHit.object.position.x;
          this._dragOffset.z = hit.z - wallHit.object.position.z;
        }
        this._renderer.domElement.style.cursor = 'grabbing';
        return;
      }
      this._clearSelection();

    } else if (this._tool === TOOLS.ADD_FURNITURE) {
      e.stopPropagation();
      const hit = this._hitFloorPlane(e);
      if (hit && this._selectedFurnitureId) {
        this._placeFurniture(hit.x, hit.z);
      }

    } else if (this._tool === TOOLS.WALL) {
      // Click-drag to draw wall: start on pointerdown
      e.stopPropagation();
      const hit = this._hitFloorPlane(e);
      if (!hit) return;
      this._wallStart = { x: this._snapToGrid(hit.x), z: this._snapToGrid(hit.z) };
      this._wallDrawing = true;
      this._controls.enabled = false;

    } else if (this._tool === TOOLS.DOORWAY) {
      e.stopPropagation();
      const wallHit = this._hitWall(e);
      if (wallHit) this._cutDoorway(wallHit);
    }
  }

  _handlePointerMove(e) {
    // Select-tool drag (furniture / wall move)
    if (this._isDragging && this._selected) {
      const hit = this._hitFloorPlane(e);
      if (hit) {
        const half = FLOOR_SIZE / 2 - 0.8;
        this._selected.position.x = Math.max(-half, Math.min(half, hit.x - this._dragOffset.x));
        this._selected.position.z = Math.max(-half, Math.min(half, hit.z - this._dragOffset.z));
        this._updateHighlight();
      }
      return;
    }

    // Wall-tool drag preview
    if (this._tool === TOOLS.WALL && this._wallDrawing && this._wallStart) {
      const hit = this._hitFloorPlane(e);
      if (hit) this._updateWallPreview(hit.x, hit.z);
    }
  }

  _handlePointerUp(e) {
    // Finish select-tool drag → push undo for the move
    if (this._isDragging && this._selected) {
      const newPos = this._selected.position.clone();
      const oldPos = this._dragOldPos;
      if (oldPos && (Math.abs(newPos.x - oldPos.x) > 0.1 || Math.abs(newPos.z - oldPos.z) > 0.1)) {
        this._pushUndo({
          type: 'move',
          data: { obj: this._selected, oldPos, newPos },
        });
      }
      if (this._selected.userData?.isEditableWall) invalidateAllNavGrids();
      this._isDragging = false;
      this._dragOldPos = null;
      this._controls.enabled = true;
      this._renderer.domElement.style.cursor = '';
      return;
    }

    // Finish wall-tool drag → place wall
    if (this._tool === TOOLS.WALL && this._wallDrawing && this._wallStart) {
      const hit = this._hitFloorPlane(e);
      if (hit) {
        this._placeWall(hit.x, hit.z);
      } else {
        this._wallStart = null;
        this._wallDrawing = false;
        this._clearWallPreview();
      }
      this._controls.enabled = true;
    }
  }

  _handleKeyDown(e) {
    if (!this.enabled) return;

    // Ctrl+Z / Ctrl+Shift+Z for undo/redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) { this.redo(); } else { this.undo(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }

    if (e.key === 'Escape') {
      this._clearSelection();
      this._clearGhost();
      this._wallStart = null;
      this._wallDrawing = false;
      this._clearWallPreview();
      this._setTool(TOOLS.SELECT);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this._selected) {
        e.preventDefault();
        this._deleteSelected();
      }
    } else if (e.key === 'q' || e.key === 'Q') {
      this._rotateSelected(Math.PI / 4);
    } else if (e.key === 'e' || e.key === 'E') {
      this._rotateSelected(-Math.PI / 4);
    } else if (e.key === '[') {
      if (this._selected?.userData?.isFurniture) {
        const next = Math.max(0.5, parseFloat((this._selected.scale.x - 0.25).toFixed(2)));
        this._applyScaleUI(next, true);
      }
    } else if (e.key === ']') {
      if (this._selected?.userData?.isFurniture) {
        const next = Math.min(15, parseFloat((this._selected.scale.x + 0.25).toFixed(2)));
        this._applyScaleUI(next, true);
      }
    }
  }

  // ─── Place furniture from catalogue ───────────────────────────────────────

  _placeFurniture(x, z) {
    const item = FURNITURE_CATALOGUE.find(f => f.id === this._selectedFurnitureId);
    if (!item) return;

    const floorIndex = this._activeFloorIndex();
    const floorY = this._activeFloorY();
    const path = KIT + item.file;
    const scale = 3.75;
    const parentGroup = this._activeGroup();

    this._gltfLoader.load(path, (gltf) => {
      const model = gltf.scene;
      model.position.set(x, floorY, z);
      model.scale.setScalar(scale);
      model.userData.isFurniture = true;
      model.userData.floorIndex = floorIndex;
      model.userData.floorY = floorY;

      model.traverse(child => {
        if (child.isMesh && child.material) {
          const m = child.material;
          child.material = new THREE.MeshLambertMaterial({
            color: m.color ?? 0xcccccc,
            map: m.map ?? null,
          });
          child.userData.isFurniture = true;
          child.userData.furnitureRoot = model;
        }
      });

      parentGroup.add(model);
      this._furnitureMeshes.push({ model, floorIndex, floorY });

      this._pushUndo({
        type: 'add-furniture',
        data: { model, floorIndex, floorY, parentGroup },
      });

      this._selectObject(model);
    }, undefined, () => {});
  }
}
