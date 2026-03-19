// ─── Asphodel Tower — Furniture Loader ───────────────────────────────────────
// Loads all GLTF furniture models and places them on their floor groups.
// Positions match the blueprint floor plan images.
// Exports: loadFurniture(floorGroups, gltfLoader, furnitureMeshes)
//          saveFurniturePiece(furnitureId, model, floorIndex, glbFile)
//          deleteFurniturePiece(furnitureId, model, floorIndex, glbFile)
//
// Coord system: left=-x, right=+x, top(north)=+z, bottom(south)=-z
// Elevator shaft at +x,+z corner (~x=28..40, z=28..40)
//
// Persistence: each piece gets a stable ID like "f0_loungeSofaLong_0".
// On load, GET /furniture-layout fetches saved transforms; pieces added via
// editMode (IDs starting with "em_") are re-created from the DB record.

import * as THREE from 'three';
import { FLOORS, KIT } from './constants.js';

// ─── HTTP port (same origin for relative fetch) ───────────────────────────────

const HTTP_PORT = new URLSearchParams(window.location.search).get('http') ?? '3000';
const BASE_URL  = `${window.location.protocol}//${window.location.hostname}:${HTTP_PORT}`;

// ─── Per-piece persistence ────────────────────────────────────────────────────

/** Upsert a furniture piece's transform in the DB. */
export async function saveFurniturePiece(furnitureId, model, floorIndex, glbFile) {
  try {
    await fetch(`${BASE_URL}/furniture-layout/${encodeURIComponent(furnitureId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        floor:      floorIndex,
        glb_file:   glbFile,
        x:          model.position.x,
        y:          model.position.y,
        z:          model.position.z,
        rotation_y: model.rotation.y,
        scale:      model.scale.x,
        deleted:    false,
      }),
    });
  } catch (err) {
    console.warn('[furniture] save failed:', err);
  }
}

/** Mark a furniture piece as deleted in the DB. */
export async function deleteFurniturePiece(furnitureId, model, floorIndex, glbFile) {
  try {
    await fetch(`${BASE_URL}/furniture-layout/${encodeURIComponent(furnitureId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        floor:      floorIndex,
        glb_file:   glbFile,
        x:          model.position.x,
        y:          model.position.y,
        z:          model.position.z,
        rotation_y: model.rotation.y,
        scale:      model.scale.x,
        deleted:    true,
      }),
    });
  } catch (err) {
    console.warn('[furniture] delete failed:', err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function loadFurniture(floorGroups, gltfLoader, furnitureMeshes) {
  // Fetch saved layout first — keyed by furniture_id
  let savedLayout = {};
  try {
    const resp = await fetch(`${BASE_URL}/furniture-layout`);
    if (resp.ok) {
      const rows = await resp.json();
      for (const row of rows) {
        savedLayout[row.furniture_id] = row;
      }
    }
  } catch (err) {
    console.warn('[furniture] Could not fetch saved layout:', err);
  }

  // Counters for stable ID generation — reset per loadFurniture call
  const _counters = {};

  /**
   * Generates a stable deterministic ID for a piece placed via the
   * hardcoded default layout.  Format: "f{floor}_{baseName}_{n}"
   */
  function nextId(floorIndex, path) {
    const base = path.replace(/.*\//, '').replace('.glb', '');
    const key  = `${floorIndex}:${base}`;
    const n    = _counters[key] ?? 0;
    _counters[key] = n + 1;
    return `f${floorIndex}_${base}_${n}`;
  }

  // ─── Re-create furniture-editor-added pieces from DB ────────────────────
  for (const [fid, row] of Object.entries(savedLayout)) {
    if (!fid.startsWith('em_')) continue; // only edit-mode-added pieces
    const path = `${KIT}${row.glb_file}`;
    glbWithId(fid, path, row.x, row.y, row.z, row.rotation_y, row.scale,
      floorGroups[row.floor], row.floor, gltfLoader, furnitureMeshes, savedLayout);
  }
  const k = KIT;
  // s = standard furniture scale (Kenney kit is ~1 unit = 1m at scale 1.0)
  const s = 3.75;
  // Desk-top y-offset for items placed ON a desk/counter at scale 3.75
  const deskY = 3.125;
  // Upper-cabinet y-offset
  const upperY = 6.45;

  // ── LOBBY ─────────────────────────────────────────────────────────────────
  const g0 = floorGroups[0], L = FLOORS[0].y;

  // West Lounge — sofas facing each other with coffee tables (z=2..38 area, x=-38..-10)
  // Row 1: sofas against west wall facing east
  glbWithId(nextId(0,`${k}loungeSofaLong.glb`), `${k}loungeSofaLong.glb`, -37, L,  28, Math.PI * 0.5, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}loungeSofa.glb`),     `${k}loungeSofa.glb`,     -37, L,  20, Math.PI * 0.5, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}loungeSofa.glb`),     `${k}loungeSofa.glb`,     -37, L,  12, Math.PI * 0.5, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  // Coffee tables between
  glbWithId(nextId(0,`${k}tableCoffee.glb`),    `${k}tableCoffee.glb`,    -28, L,  26, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}tableCoffee.glb`),    `${k}tableCoffee.glb`,    -28, L,  16, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}rugRectangle.glb`),   `${k}rugRectangle.glb`,   -28, L,  26, Math.PI * 0.5, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}rugRectangle.glb`),   `${k}rugRectangle.glb`,   -28, L,  16, Math.PI * 0.5, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  // Row 2: sofas facing west
  glbWithId(nextId(0,`${k}loungeSofa.glb`),     `${k}loungeSofa.glb`,     -20, L,  28, Math.PI * -0.5, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}loungeSofa.glb`),     `${k}loungeSofa.glb`,     -20, L,  20, Math.PI * -0.5, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}loungeSofaCorner.glb`),`${k}loungeSofaCorner.glb`,-20, L,  12, Math.PI * -0.5, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  // Small tables/rugs in lounge
  glbWithId(nextId(0,`${k}rugRectangle.glb`),   `${k}rugRectangle.glb`,   -28, L,   6, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}tableCoffeeSquare.glb`),`${k}tableCoffeeSquare.glb`,-28, L,   6, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);

  // Reception desk — center
  glbWithId(nextId(0,`${k}desk.glb`),           `${k}desk.glb`,              0, L,   8, Math.PI, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}computerScreen.glb`), `${k}computerScreen.glb`,    0, L + deskY, 8, Math.PI, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}chairDesk.glb`),      `${k}chairDesk.glb`,         0, L,  12, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);

  // East Meeting — round table with chairs (x=8..22, z=-14..-2)
  glbWithId(nextId(0,`${k}tableRound.glb`),     `${k}tableRound.glb`,       17, L,  -6, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}rugRound.glb`),       `${k}rugRound.glb`,         17, L,  -6, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}loungeChair.glb`),    `${k}loungeChair.glb`,      11, L,  -6, Math.PI * 0.5, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}loungeChair.glb`),    `${k}loungeChair.glb`,      23, L,  -6, Math.PI * -0.5, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}loungeChair.glb`),    `${k}loungeChair.glb`,      17, L,   0, Math.PI, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}loungeChair.glb`),    `${k}loungeChair.glb`,      17, L, -12, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);

  // Waiting area — benches along south wall
  glbWithId(nextId(0,`${k}benchCushion.glb`),   `${k}benchCushion.glb`,     10, L, -36, Math.PI, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}benchCushion.glb`),   `${k}benchCushion.glb`,     18, L, -36, Math.PI, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}loungeSofa.glb`),     `${k}loungeSofa.glb`,       14, L, -28, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);

  // Decorations
  glbWithId(nextId(0,`${k}pottedPlant.glb`),    `${k}pottedPlant.glb`,     -37, L,  36, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}pottedPlant.glb`),    `${k}pottedPlant.glb`,      22, L, -36, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}lampSquareFloor.glb`),`${k}lampSquareFloor.glb`, -37, L,   2, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(0,`${k}coatRackStanding.glb`),`${k}coatRackStanding.glb`,-37, L, -36, 0, s, g0, 0, gltfLoader, furnitureMeshes, savedLayout);

  // ── KITCHEN ───────────────────────────────────────────────────────────────
  const g1 = floorGroups[1], Ki = FLOORS[1].y;

  // Kitchen Prep — west wall appliances (x≈-37, z=18..36)
  glbWithId(nextId(1,`${k}kitchenCabinet.glb`),           `${k}kitchenCabinet.glb`,           -37, Ki,  34, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}kitchenCabinet.glb`),           `${k}kitchenCabinet.glb`,           -37, Ki,  30, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}kitchenFridge.glb`),            `${k}kitchenFridge.glb`,            -37, Ki,  26, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}kitchenStove.glb`),             `${k}kitchenStove.glb`,             -37, Ki,  22, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}hoodModern.glb`),               `${k}hoodModern.glb`,               -37, Ki + upperY, 22, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}kitchenSink.glb`),              `${k}kitchenSink.glb`,              -30, Ki,  37, Math.PI, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  // Upper cabinets
  glbWithId(nextId(1,`${k}kitchenCabinetUpperDouble.glb`),`${k}kitchenCabinetUpperDouble.glb`,-37, Ki + upperY, 32, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}kitchenCabinetUpper.glb`),      `${k}kitchenCabinetUpper.glb`,      -37, Ki + upperY, 26, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  // Countertop appliances
  glbWithId(nextId(1,`${k}kitchenMicrowave.glb`),         `${k}kitchenMicrowave.glb`,         -34, Ki + deskY, 34, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}kitchenCoffeeMachine.glb`),     `${k}kitchenCoffeeMachine.glb`,     -34, Ki + deskY, 30, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}toaster.glb`),                  `${k}toaster.glb`,                  -24, Ki + deskY, 37, Math.PI, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);

  // Bar counter island + stools (center of kitchen area)
  glbWithId(nextId(1,`${k}kitchenBar.glb`),   `${k}kitchenBar.glb`,   -10, Ki,  -4, 0, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}kitchenBar.glb`),   `${k}kitchenBar.glb`,    -4, Ki,  -4, 0, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}kitchenBarEnd.glb`),`${k}kitchenBarEnd.glb`,  2, Ki,  -4, 0, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}stoolBar.glb`),     `${k}stoolBar.glb`,     -10, Ki,  -8, Math.PI, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}stoolBar.glb`),     `${k}stoolBar.glb`,      -4, Ki,  -8, Math.PI, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}stoolBar.glb`),     `${k}stoolBar.glb`,       2, Ki,  -8, Math.PI, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);

  // Dining Area — rectangular table with chairs (center-right)
  glbWithId(nextId(1,`${k}table.glb`),        `${k}table.glb`,         0, Ki,   6, 0, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}tableCloth.glb`),   `${k}tableCloth.glb`,    0, Ki,   6, 0, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}chairDesk.glb`),    `${k}chairDesk.glb`,    -4, Ki,   6, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}chairDesk.glb`),    `${k}chairDesk.glb`,     4, Ki,   6, Math.PI * -0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}chairDesk.glb`),    `${k}chairDesk.glb`,     0, Ki,  10, 0, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}chairDesk.glb`),    `${k}chairDesk.glb`,     0, Ki,   2, Math.PI, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}rugRectangle.glb`), `${k}rugRectangle.glb`,  0, Ki,   6, 0, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);

  // Pantry (SE, x=10..38, z=-38..-18)
  glbWithId(nextId(1,`${k}kitchenCabinet.glb`),  `${k}kitchenCabinet.glb`,   20, Ki, -30, Math.PI * -0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}kitchenCabinet.glb`),  `${k}kitchenCabinet.glb`,   20, Ki, -36, Math.PI * -0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}kitchenFridgeSmall.glb`),`${k}kitchenFridgeSmall.glb`,36, Ki, -34, Math.PI * -0.5, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);

  // Decorations
  glbWithId(nextId(1,`${k}pottedPlant.glb`), `${k}pottedPlant.glb`, -37, Ki,  37, 0, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(1,`${k}pottedPlant.glb`), `${k}pottedPlant.glb`,  22, Ki, -37, 0, s, g1, 1, gltfLoader, furnitureMeshes, savedLayout);

  // ── OFFICE ────────────────────────────────────────────────────────────────
  const g2 = floorGroups[2], O = FLOORS[2].y;

  // Open Workspace — north wall desks with computers (4 stations, z≈36)
  for (let i = 0; i < 4; i++) {
    const dx = -24 + i * 12;
    glbWithId(nextId(2,`${k}desk.glb`),           `${k}desk.glb`,           dx,     O,         36, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
    glbWithId(nextId(2,`${k}computerScreen.glb`), `${k}computerScreen.glb`, dx,     O + deskY, 36, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
    glbWithId(nextId(2,`${k}computerKeyboard.glb`),`${k}computerKeyboard.glb`,dx+1, O + deskY, 37, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
    glbWithId(nextId(2,`${k}chairDesk.glb`),      `${k}chairDesk.glb`,      dx,     O,         32, Math.PI, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  }
  // Second row chairs
  for (let i = 0; i < 4; i++) {
    const dx = -24 + i * 12;
    glbWithId(nextId(2,`${k}chairDesk.glb`), `${k}chairDesk.glb`, dx, O, 26, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  }

  // Meeting Room (west, x=-38..-10, z=10..22)
  glbWithId(nextId(2,`${k}table.glb`),       `${k}table.glb`,       -24, O,  14, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}chairDesk.glb`),   `${k}chairDesk.glb`,   -30, O,  14, Math.PI * 0.5, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}chairDesk.glb`),   `${k}chairDesk.glb`,   -18, O,  14, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}chairDesk.glb`),   `${k}chairDesk.glb`,   -24, O,  18, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}chairDesk.glb`),   `${k}chairDesk.glb`,   -24, O,  10, Math.PI, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}rugRectangle.glb`),`${k}rugRectangle.glb`,-24, O,  14, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);

  // Reception desk (center)
  glbWithId(nextId(2,`${k}desk.glb`),          `${k}desk.glb`,           4, O,   0, Math.PI, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}computerScreen.glb`),`${k}computerScreen.glb`, 4, O + deskY, 0, Math.PI, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}chairDesk.glb`),     `${k}chairDesk.glb`,      4, O,   4, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);

  // Library Wall bookcases (along x=18, east side of library wall)
  glbWithId(nextId(2,`${k}bookcaseOpen.glb`),       `${k}bookcaseOpen.glb`,       18, O,  -8, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}bookcaseOpen.glb`),       `${k}bookcaseOpen.glb`,       18, O,  -2, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}bookcaseClosed.glb`),     `${k}bookcaseClosed.glb`,     18, O,   6, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}bookcaseClosedWide.glb`), `${k}bookcaseClosedWide.glb`, 18, O,  14, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}books.glb`),              `${k}books.glb`,              18, O + 10.0, 10, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);

  // Lounge Area (SW, x=-38..-14, z=-38..-18)
  glbWithId(nextId(2,`${k}loungeSofa.glb`),    `${k}loungeSofa.glb`,    -34, O, -28, Math.PI * 0.5, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}loungeSofaLong.glb`),`${k}loungeSofaLong.glb`,-26, O, -36, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}tableCoffee.glb`),   `${k}tableCoffee.glb`,   -28, O, -28, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}rugRectangle.glb`),  `${k}rugRectangle.glb`,  -28, O, -30, Math.PI * 0.5, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}loungeChair.glb`),   `${k}loungeChair.glb`,   -22, O, -24, Math.PI, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);

  // Break Room (SE, x=6..14, z=-38..-18)
  glbWithId(nextId(2,`${k}loungeSofa.glb`),      `${k}loungeSofa.glb`,       10, O, -28, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}tableCoffeeGlass.glb`),`${k}tableCoffeeGlass.glb`, 12, O, -32, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}stoolBar.glb`),        `${k}stoolBar.glb`,         10, O, -36, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);

  // Plants & decor
  glbWithId(nextId(2,`${k}pottedPlant.glb`),    `${k}pottedPlant.glb`,    -37, O, -37, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}pottedPlant.glb`),    `${k}pottedPlant.glb`,     22, O,  37, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}lampSquareFloor.glb`),`${k}lampSquareFloor.glb`,-37, O,  37, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(2,`${k}trashcan.glb`),        `${k}trashcan.glb`,       -12, O, -37, 0, s, g2, 2, gltfLoader, furnitureMeshes, savedLayout);

  // ── GYM ───────────────────────────────────────────────────────────────────
  const g3 = floorGroups[3], G = FLOORS[3].y;

  // Yoga Zone — mats (NW, z>16)
  glbWithId(nextId(3,`${k}rugRectangle.glb`),  `${k}rugRectangle.glb`,   -8, G,  30, 0, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(3,`${k}rugRectangle.glb`),  `${k}rugRectangle.glb`,    4, G,  30, 0, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(3,`${k}rugRectangle.glb`),  `${k}rugRectangle.glb`,   16, G,  30, 0, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);

  // Main Gym Floor — weight benches along west wall
  glbWithId(nextId(3,`${k}benchCushionLow.glb`),`${k}benchCushionLow.glb`,-36, G,  -4, Math.PI * 0.5, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(3,`${k}benchCushionLow.glb`),`${k}benchCushionLow.glb`,-36, G, -12, Math.PI * 0.5, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(3,`${k}benchCushionLow.glb`),`${k}benchCushionLow.glb`,-36, G, -20, Math.PI * 0.5, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);
  // Equipment mats on gym floor
  glbWithId(nextId(3,`${k}rugRectangle.glb`),  `${k}rugRectangle.glb`,    0, G,  -4, 0, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(3,`${k}rugRectangle.glb`),  `${k}rugRectangle.glb`,    0, G, -20, 0, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);
  // East wall water station
  glbWithId(nextId(3,`${k}sideTable.glb`),     `${k}sideTable.glb`,      22, G,   8, Math.PI * -0.5, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(3,`${k}sideTable.glb`),     `${k}sideTable.glb`,      22, G,  -8, Math.PI * -0.5, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);

  // Locker Room (SE, x=18..38, z=-38..-18)
  glbWithId(nextId(3,`${k}benchCushion.glb`),     `${k}benchCushion.glb`,     24, G, -28, Math.PI * -0.5, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(3,`${k}benchCushion.glb`),     `${k}benchCushion.glb`,     24, G, -34, Math.PI * -0.5, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(3,`${k}coatRackStanding.glb`), `${k}coatRackStanding.glb`, 34, G, -22, 0, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);

  // Decorations
  glbWithId(nextId(3,`${k}pottedPlant.glb`), `${k}pottedPlant.glb`, -37, G,  37, 0, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(3,`${k}pottedPlant.glb`), `${k}pottedPlant.glb`,  22, G,  37, 0, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(3,`${k}radio.glb`),       `${k}radio.glb`,       -37, G, -37, Math.PI * 0.5, s, g3, 3, gltfLoader, furnitureMeshes, savedLayout);

  // ── BEDROOM ───────────────────────────────────────────────────────────────
  const g4 = floorGroups[4], Be = FLOORS[4].y;

  // Apt 1 (x=-40..-24, z=8..40)
  glbWithId(nextId(4,`${k}bedDouble.glb`),      `${k}bedDouble.glb`,      -32, Be,  30, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}cabinetBed.glb`),     `${k}cabinetBed.glb`,     -28, Be,  36, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}lampRoundTable.glb`), `${k}lampRoundTable.glb`, -28, Be + 2.5, 36, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}coatRack.glb`),       `${k}coatRack.glb`,       -37, Be,  12, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}rugRounded.glb`),     `${k}rugRounded.glb`,     -32, Be,  22, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);

  // Apt 2 (x=-24..-8, z=8..40)
  glbWithId(nextId(4,`${k}bedDouble.glb`),      `${k}bedDouble.glb`,      -16, Be,  30, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}cabinetBed.glb`),     `${k}cabinetBed.glb`,     -12, Be,  36, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}lampRoundTable.glb`), `${k}lampRoundTable.glb`, -12, Be + 2.5, 36, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}rugRounded.glb`),     `${k}rugRounded.glb`,     -16, Be,  22, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);

  // Apt 3 (x=-8..8, z=8..40)
  glbWithId(nextId(4,`${k}bedSingle.glb`),      `${k}bedSingle.glb`,        0, Be,  30, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}cabinetBed.glb`),     `${k}cabinetBed.glb`,       4, Be,  36, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}lampRoundTable.glb`), `${k}lampRoundTable.glb`,   4, Be + 2.5, 36, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}rugRounded.glb`),     `${k}rugRounded.glb`,       0, Be,  22, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);

  // Apt 4 (x=8..24, z=8..40)
  glbWithId(nextId(4,`${k}bedSingle.glb`),      `${k}bedSingle.glb`,       16, Be,  30, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}cabinetBed.glb`),     `${k}cabinetBed.glb`,      20, Be,  36, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}lampRoundTable.glb`), `${k}lampRoundTable.glb`,  20, Be + 2.5, 36, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}rugRounded.glb`),     `${k}rugRounded.glb`,      16, Be,  22, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);

  // Apt 5 (east, x=16..40, z=-16..8)
  glbWithId(nextId(4,`${k}bedDouble.glb`),         `${k}bedDouble.glb`,         30, Be,  -4, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}cabinetBed.glb`),        `${k}cabinetBed.glb`,        36, Be,   2, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}lampRoundTable.glb`),    `${k}lampRoundTable.glb`,    36, Be + 2.5, 2, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}sideTableDrawers.glb`),  `${k}sideTableDrawers.glb`,  36, Be, -10, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}bookcaseClosedWide.glb`),`${k}bookcaseClosedWide.glb`,36, Be, -14, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);

  // Common Area (south, z < 8)
  glbWithId(nextId(4,`${k}loungeSofa.glb`),     `${k}loungeSofa.glb`,      -8, Be,  -2, Math.PI * 0.5, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}loungeSofaLong.glb`), `${k}loungeSofaLong.glb`,   0, Be,  -8, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}tableCoffee.glb`),    `${k}tableCoffee.glb`,      -2, Be,  -2, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}rugRectangle.glb`),   `${k}rugRectangle.glb`,     -2, Be,  -4, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}lampRoundFloor.glb`), `${k}lampRoundFloor.glb`,  -37, Be,  -8, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}lampRoundFloor.glb`), `${k}lampRoundFloor.glb`,   12, Be,  -8, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);

  // Decorations
  glbWithId(nextId(4,`${k}pottedPlant.glb`), `${k}pottedPlant.glb`, -37, Be,  37, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(4,`${k}pottedPlant.glb`), `${k}pottedPlant.glb`,  22, Be, -14, 0, s, g4, 4, gltfLoader, furnitureMeshes, savedLayout);

  // ── LIBRARY ───────────────────────────────────────────────────────────────
  const g5 = floorGroups[5], Li = FLOORS[5].y;

  // Writing Desks — north wall, 4 desks with computers
  for (let i = 0; i < 4; i++) {
    const dx = -24 + i * 12;
    glbWithId(nextId(5,`${k}desk.glb`),          `${k}desk.glb`,          dx, Li,         36, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
    glbWithId(nextId(5,`${k}computerScreen.glb`),`${k}computerScreen.glb`,dx, Li + deskY, 36, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
    glbWithId(nextId(5,`${k}chairDesk.glb`),     `${k}chairDesk.glb`,     dx, Li,         32, Math.PI, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  }

  // Display Table — center of main floor
  glbWithId(nextId(5,`${k}tableRound.glb`), `${k}tableRound.glb`,  0, Li,          4, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}books.glb`),      `${k}books.glb`,        0, Li + deskY, 4, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}rugRound.glb`),   `${k}rugRound.glb`,     0, Li,          4, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}chairDesk.glb`),  `${k}chairDesk.glb`,   -4, Li,          4, Math.PI * 0.5, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}chairDesk.glb`),  `${k}chairDesk.glb`,    4, Li,          4, Math.PI * -0.5, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}chairDesk.glb`),  `${k}chairDesk.glb`,    0, Li,          8, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}chairDesk.glb`),  `${k}chairDesk.glb`,    0, Li,          0, Math.PI, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);

  // Reading Nook (SW, x < -16)
  glbWithId(nextId(5,`${k}loungeChairRelax.glb`),`${k}loungeChairRelax.glb`,-30, Li, -18, Math.PI * 0.5, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}loungeChairRelax.glb`),`${k}loungeChairRelax.glb`,-24, Li, -28, Math.PI * 0.75, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}loungeSofa.glb`),      `${k}loungeSofa.glb`,      -32, Li, -32, Math.PI * 0.5, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}tableCoffee.glb`),     `${k}tableCoffee.glb`,     -24, Li, -22, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}rugRound.glb`),        `${k}rugRound.glb`,        -26, Li, -24, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}lampRoundFloor.glb`),  `${k}lampRoundFloor.glb`,  -37, Li, -37, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);

  // West wall bookcases
  glbWithId(nextId(5,`${k}bookcaseClosedWide.glb`),`${k}bookcaseClosedWide.glb`,-37, Li,   4, Math.PI * 0.5, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}bookcaseOpen.glb`),     `${k}bookcaseOpen.glb`,     -37, Li,  12, Math.PI * 0.5, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);

  // Archive Room (east, x > 16)
  glbWithId(nextId(5,`${k}bookcaseOpen.glb`),      `${k}bookcaseOpen.glb`,       37, Li, -22, Math.PI * -0.5, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}bookcaseOpen.glb`),      `${k}bookcaseOpen.glb`,       37, Li, -12, Math.PI * -0.5, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}bookcaseClosed.glb`),    `${k}bookcaseClosed.glb`,     37, Li,  -2, Math.PI * -0.5, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}bookcaseClosedWide.glb`),`${k}bookcaseClosedWide.glb`, 37, Li,   8, Math.PI * -0.5, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}bookcaseOpen.glb`),      `${k}bookcaseOpen.glb`,       37, Li,  18, Math.PI * -0.5, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);

  // Art Stable (x=0..8, z=-40..-24)
  glbWithId(nextId(5,`${k}table.glb`),    `${k}table.glb`,     4, Li, -32, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}chairDesk.glb`),`${k}chairDesk.glb`, 4, Li, -28, Math.PI, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);

  // Art Station (x=8..16, z=-40..-24)
  glbWithId(nextId(5,`${k}desk.glb`),          `${k}desk.glb`,          12, Li, -32, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}computerScreen.glb`),`${k}computerScreen.glb`,12, Li + deskY, -32, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}chairDesk.glb`),     `${k}chairDesk.glb`,     12, Li, -28, Math.PI, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);

  // Decorations
  glbWithId(nextId(5,`${k}pottedPlant.glb`), `${k}pottedPlant.glb`, -37, Li,  37, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}pottedPlant.glb`), `${k}pottedPlant.glb`,  22, Li,  37, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}plantSmall1.glb`), `${k}plantSmall1.glb`,  -8, Li, -37, 0, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
  glbWithId(nextId(5,`${k}speaker.glb`),     `${k}speaker.glb`,     -37, Li,  24, Math.PI * 0.5, s, g5, 5, gltfLoader, furnitureMeshes, savedLayout);
}

// ─── GLB loader helper ────────────────────────────────────────────────────────

/**
 * Load a GLTF model, apply saved transform if one exists in savedLayout,
 * otherwise use the supplied defaults.  Skips loading if the piece is
 * marked deleted in the DB.
 *
 * @param {string}  furnitureId  - Stable ID like "f0_loungeSofa_2" or "em_abc"
 * @param {string}  path         - URL/path to the .glb file
 * @param {number}  x, y, z      - Default world position
 * @param {number}  ry           - Default Y rotation (radians)
 * @param {number}  scale        - Default uniform scale
 * @param {Object}  group        - THREE.Group to add the model to
 * @param {number}  floorIndex   - Which floor (0-based)
 * @param {Object}  gltfLoader   - GLTFLoader instance
 * @param {Array}   furnitureMeshes - Shared array to register in
 * @param {Object}  savedLayout  - Map of furniture_id → DB row
 */
function glbWithId(furnitureId, path, x, y, z, ry = 0, scale = 0.9, group = null, floorIndex = -1, gltfLoader, furnitureMeshes, savedLayout = {}) {
  const saved = savedLayout[furnitureId];

  // If DB says deleted, skip entirely
  if (saved && saved.deleted) return;

  // Use saved transforms if available, otherwise fall back to defaults
  const fx  = saved ? saved.x          : x;
  const fy  = saved ? saved.y          : y;
  const fz  = saved ? saved.z          : z;
  const fry = saved ? saved.rotation_y : ry;
  const fsc = saved ? saved.scale      : scale;

  // Derive the bare filename for userData (e.g. "loungeSofa.glb")
  const glbFile = path.replace(/.*\//, '');

  gltfLoader.load(path, (gltf) => {
    const model = gltf.scene;
    model.position.set(fx, fy, fz);
    model.rotation.y = fry;
    model.scale.setScalar(fsc);
    model.userData.isFurniture  = true;
    model.userData.furnitureId  = furnitureId;
    model.userData.glbFile      = glbFile;
    model.userData.floorIndex   = floorIndex;
    model.userData.floorY       = floorIndex >= 0 ? FLOORS[floorIndex].y : fy;

    model.traverse(child => {
      if (child.isMesh && child.material) {
        const m = child.material;
        child.material = new THREE.MeshLambertMaterial({
          color: m.color ?? 0xcccccc,
          map:   m.map  ?? null,
        });
        child.userData.isFurniture   = true;
        child.userData.furnitureRoot = model;
      }
    });

    if (group) group.add(model);

    if (floorIndex >= 0) {
      furnitureMeshes.push({ model, floorIndex, floorY: model.userData.floorY });
    }
  }, undefined, () => {});
}
