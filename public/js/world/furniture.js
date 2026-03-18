// ─── Asphodel Tower — Furniture Loader ───────────────────────────────────────
// Loads all GLTF furniture models and places them on their floor groups.
// Exports: loadFurniture(floorGroups, gltfLoader, furnitureMeshes)
//
// Room layout per floor (all coords relative to floor centre, half = FLOOR_SIZE/2 = 8):
//   LOBBY   — sofas west, chairs east, benches south wall, plants at corners
//   KITCHEN — cabinets/appliances west wall, bar counter south, dining table centre-east
//   OFFICE  — 5 desks north row, lounge sofa south, bookcases east wall
//   GYM     — benches west, mats centre, stools/side-table east
//   BEDROOM — 2 doubles + 3 singles west/east, nightstands, bookcases
//   LIBRARY — reading nook SW, writing desks N-wall, art station SE, research terminal N-centre

import * as THREE from 'three';
import { FLOORS, KIT } from './constants.js';

// ─── Public API ───────────────────────────────────────────────────────────────

export function loadFurniture(floorGroups, gltfLoader, furnitureMeshes) {
  const k = KIT;

  // ── LOBBY ─────────────────────────────────────────────────────────────────
  const g0 = floorGroups[0], L = FLOORS[0].y;
  glb(`${k}loungeSofa.glb`,           -5.5, L,  -4.5, Math.PI * 0.5,  0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeSofaLong.glb`,       -5.5, L,  -1.0, Math.PI * 0.5,  0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeSofaCorner.glb`,     -5.5, L,   2.5, Math.PI * 0.5,  0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}tableCoffee.glb`,          -4.0, L,  -2.5, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}tableCoffee.glb`,          -4.0, L,   1.5, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,         -4.8, L,  -2.5, Math.PI * 0.5,  0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,         -4.8, L,   1.5, Math.PI * 0.5,  0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}televisionModern.glb`,     -7.2, L,  -3.5, Math.PI * 0.5,  0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}cabinetTelevision.glb`,    -7.2, L,  -3.5, Math.PI * 0.5,  0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChair.glb`,           5.0, L,  -5.5, Math.PI * 1.25, 0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChair.glb`,           6.5, L,  -3.5, Math.PI * 1.0,  0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChairRelax.glb`,      6.5, L,  -1.0, Math.PI * 1.0,  0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}tableRound.glb`,            5.5, L,  -4.5, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}rugRound.glb`,              5.5, L,  -4.5, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}benchCushion.glb`,          0.0, L,  -7.2, Math.PI,        0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}benchCushion.glb`,          3.5, L,  -7.2, Math.PI,        0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}benchCushion.glb`,         -3.5, L,  -7.2, Math.PI,        0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,          -7.0, L,  -7.0, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,           7.0, L,  -7.0, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,          -7.0, L,   7.0, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,           7.0, L,   7.0, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}plantSmall1.glb`,          -3.0, L,   7.0, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}plantSmall2.glb`,           3.0, L,   7.0, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}lampSquareFloor.glb`,      -7.0, L,  -1.0, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}lampSquareFloor.glb`,       7.0, L,   2.0, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}coatRackStanding.glb`,      6.5, L,   6.5, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}speaker.glb`,             -7.2, L,  -4.5, Math.PI * 0.5,  0.9, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}rugSquare.glb`,             0.0, L,   4.0, 0,              0.9, g0, 0, gltfLoader, furnitureMeshes);

  // ── KITCHEN ───────────────────────────────────────────────────────────────
  const g1 = floorGroups[1], Ki = FLOORS[1].y;
  glb(`${k}kitchenCabinet.glb`,       -7.0, Ki, -6.0, Math.PI * 0.5,  0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenCabinet.glb`,       -7.0, Ki, -4.5, Math.PI * 0.5,  0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenCabinet.glb`,       -7.0, Ki, -3.0, Math.PI * 0.5,  0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenFridge.glb`,        -7.0, Ki, -1.0, Math.PI * 0.5,  0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenStove.glb`,         -7.0, Ki,  1.5, Math.PI * 0.5,  0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}hoodModern.glb`,           -7.0, Ki + 1.5,  1.5, Math.PI * 0.5, 0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenSink.glb`,          -7.0, Ki,  4.0, Math.PI * 0.5,  0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenCabinetUpperDouble.glb`, -7.0, Ki + 1.55, -5.3, Math.PI * 0.5, 0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenCabinetUpperDouble.glb`, -7.0, Ki + 1.55, -3.0, Math.PI * 0.5, 0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenCabinetUpper.glb`,  -7.0, Ki + 1.55,  4.0, Math.PI * 0.5, 0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenMicrowave.glb`,     -6.2, Ki + 0.95, -6.0, Math.PI * 0.5, 0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenCoffeeMachine.glb`, -6.2, Ki + 0.95, -4.5, Math.PI * 0.5, 0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}toaster.glb`,              -6.2, Ki + 0.95, -3.0, Math.PI * 0.5, 0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenBlender.glb`,       -6.2, Ki + 0.95, -1.5, Math.PI * 0.5, 0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenBarEnd.glb`,         0.0, Ki, -6.5, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenBar.glb`,            1.5, Ki, -6.5, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenBar.glb`,            3.0, Ki, -6.5, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenBar.glb`,            4.5, Ki, -6.5, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}stoolBar.glb`,              1.5, Ki, -5.5, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}stoolBar.glb`,              3.0, Ki, -5.5, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}stoolBar.glb`,             4.5,  Ki, -5.5, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}table.glb`,                 3.0, Ki,  1.5, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}tableCloth.glb`,            3.0, Ki,  1.5, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,             1.5, Ki,  1.5, Math.PI * 0.5,   0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,             4.5, Ki,  1.5, Math.PI * -0.5,  0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,             3.0, Ki,  3.0, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,             3.0, Ki,  0.0, Math.PI,         0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,          3.0, Ki,  1.5, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,           7.0, Ki,  7.0, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,          -7.0, Ki,  7.0, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundTable.glb`,        6.0, Ki,  6.0, 0,               0.9, g1, 1, gltfLoader, furnitureMeshes);

  // ── OFFICE ────────────────────────────────────────────────────────────────
  const g2 = floorGroups[2], O = FLOORS[2].y;
  for (let i = 0; i < 5; i++) {
    const dx = -6.0 + i * 3.0;
    glb(`${k}desk.glb`,               dx,       O,          -5.5, 0,         0.9, g2, 2, gltfLoader, furnitureMeshes);
    glb(`${k}computerScreen.glb`,     dx,       O + 0.75,   -5.5, 0,         0.9, g2, 2, gltfLoader, furnitureMeshes);
    glb(`${k}computerKeyboard.glb`,   dx + 0.4, O + 0.75,   -4.8, 0,         0.9, g2, 2, gltfLoader, furnitureMeshes);
    glb(`${k}chairDesk.glb`,          dx,       O,          -4.0, Math.PI,    0.9, g2, 2, gltfLoader, furnitureMeshes);
  }
  glb(`${k}bookcaseOpen.glb`,          7.2, O, -4.5, Math.PI * -0.5, 0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseOpen.glb`,          7.2, O, -2.5, Math.PI * -0.5, 0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseClosed.glb`,        7.2, O, -0.5, Math.PI * -0.5, 0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseClosedWide.glb`,    7.2, O,  2.0, Math.PI * -0.5, 0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}books.glb`,                 7.2, O + 1.2, -3.5, Math.PI * -0.5, 0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}loungeSofa.glb`,            0.0, O,  5.5, Math.PI,         0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChair.glb`,          -2.5, O,  4.0, Math.PI * 1.25,  0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChair.glb`,           2.5, O,  4.0, Math.PI * 0.75,  0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}tableCoffeeGlass.glb`,      0.0, O,  3.5, 0,               0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,          0.0, O,  4.8, 0,               0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}lampSquareFloor.glb`,       7.0, O,  6.5, 0,               0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}lampSquareFloor.glb`,      -7.0, O,  6.5, 0,               0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}speaker.glb`,             -7.2, O, -6.5, Math.PI * 0.5,   0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}trashcan.glb`,            -6.0, O,  7.0, 0,               0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,           7.0, O,  7.0, 0,               0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,          -7.0, O,  7.0, 0,               0.9, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}laptop.glb`,              -6.0, O + 0.75, -5.5, Math.PI,   0.7, g2, 2, gltfLoader, furnitureMeshes);

  // ── GYM ───────────────────────────────────────────────────────────────────
  const g3 = floorGroups[3], G = FLOORS[3].y;
  glb(`${k}benchCushionLow.glb`,      -5.5, G, -5.5, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}benchCushionLow.glb`,      -5.5, G, -2.5, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}benchCushionLow.glb`,      -5.5, G,  0.5, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}benchCushionLow.glb`,      -5.5, G,  3.5, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,          1.0, G, -2.5, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,          1.0, G,  2.0, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,          4.5, G, -0.5, Math.PI * 0.5,  0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,          4.5, G, -4.5, Math.PI * 0.5,  0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}stoolBar.glb`,              6.5, G, -5.5, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}stoolBar.glb`,              6.5, G, -3.5, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}sideTable.glb`,             6.5, G, -4.5, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}radio.glb`,               -7.2, G,  3.0, Math.PI * 0.5,  0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}benchCushion.glb`,          0.0, G, -7.2, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}benchCushion.glb`,          3.5, G, -7.2, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}lampSquareFloor.glb`,       7.0, G, -7.0, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}lampSquareFloor.glb`,      -7.0, G, -7.0, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,           7.0, G,  7.0, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,          -7.0, G,  7.0, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}trashcan.glb`,             -6.0, G,  7.0, 0,              0.9, g3, 3, gltfLoader, furnitureMeshes);

  // ── BEDROOM ───────────────────────────────────────────────────────────────
  const g4 = floorGroups[4], Be = FLOORS[4].y;
  glb(`${k}bedDouble.glb`,            -5.5, Be, -5.0, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}bedDouble.glb`,             5.5, Be, -5.0, Math.PI,        0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}bedSingle.glb`,            -5.5, Be, -0.5, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}bedSingle.glb`,             5.5, Be, -0.5, Math.PI,        0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}bedSingle.glb`,            -5.5, Be,  3.0, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}cabinetBed.glb`,           -4.0, Be, -6.2, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}cabinetBed.glb`,            4.0, Be, -6.2, Math.PI,        0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}cabinetBedDrawerTable.glb`,-4.0, Be,  1.2, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundTable.glb`,       -3.8, Be + 0.6, -6.2, 0,        0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundTable.glb`,        3.8, Be + 0.6, -6.2, 0,        0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundFloor.glb`,       -7.0, Be,  5.0, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundFloor.glb`,        7.0, Be,  5.0, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseClosedWide.glb`,    7.2, Be,  4.0, Math.PI * -0.5, 0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}sideTableDrawers.glb`,      7.2, Be, -6.5, Math.PI * -0.5, 0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}sideTableDrawers.glb`,     -7.2, Be,  5.0, Math.PI *  0.5, 0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}coatRack.glb`,             -7.0, Be, -6.5, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}rugRounded.glb`,           -5.5, Be, -5.0, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}rugRounded.glb`,            5.5, Be, -5.0, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,          0.0, Be,  3.5, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}pillow.glb`,               -5.5, Be + 0.5, -5.8, 0,        0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}pillow.glb`,                5.5, Be + 0.5, -5.8, Math.PI,  0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}pillowLong.glb`,           -5.5, Be + 0.5, -4.2, 0,        0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,           7.0, Be,  7.0, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,          -7.0, Be,  7.0, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}plantSmall1.glb`,          -5.5, Be,  5.5, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}plantSmall2.glb`,           5.5, Be,  5.5, 0,              0.9, g4, 4, gltfLoader, furnitureMeshes);

  // ── LIBRARY ───────────────────────────────────────────────────────────────
  const g5 = floorGroups[5], Li = FLOORS[5].y;
  // Archive wall (east)
  glb(`${k}bookcaseOpen.glb`,          7.2, Li,  -6.0, Math.PI * -0.5, 0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseOpen.glb`,          7.2, Li,  -4.0, Math.PI * -0.5, 0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseClosed.glb`,        7.2, Li,  -2.0, Math.PI * -0.5, 0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseClosedWide.glb`,    7.2, Li,   0.5, Math.PI * -0.5, 0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseOpen.glb`,          7.2, Li,   2.8, Math.PI * -0.5, 0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}books.glb`,                 7.2, Li + 1.2, -5.0, Math.PI * -0.5, 0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}books.glb`,                 7.2, Li + 1.2,  1.5, Math.PI * -0.5, 0.9, g5, 5, gltfLoader, furnitureMeshes);
  // Reading nook (SW)
  glb(`${k}loungeChairRelax.glb`,     -6.5, Li,   5.0, Math.PI * 0.5,  0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChairRelax.glb`,     -5.0, Li,   5.5, Math.PI * 0.75, 0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChair.glb`,          -6.5, Li,   2.5, Math.PI * 0.5,  0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}tableCoffee.glb`,          -5.0, Li,   4.0, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}rugRound.glb`,             -5.5, Li,   4.2, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundFloor.glb`,       -7.0, Li,   6.5, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  // Writing desks (N wall)
  glb(`${k}desk.glb`,                 -6.0, Li,  -5.5, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}desk.glb`,                 -3.5, Li,  -5.5, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}desk.glb`,                 -1.0, Li,  -5.5, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,            -6.0, Li,  -4.0, Math.PI,        0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,            -3.5, Li,  -4.0, Math.PI,        0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,            -1.0, Li,  -4.0, Math.PI,        0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundTable.glb`,       -6.0, Li + 0.75, -5.8, 0,        0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundTable.glb`,       -3.5, Li + 0.75, -5.8, 0,        0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,         -3.5, Li,  -4.8, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  // Art station (SE)
  glb(`${k}table.glb`,                 3.5, Li,   5.0, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}tableCloth.glb`,            3.5, Li,   5.0, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,             2.0, Li,   5.0, Math.PI * 0.5,  0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,             5.0, Li,   5.0, Math.PI * -0.5, 0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}table.glb`,                 3.5, Li,   2.5, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,          3.5, Li,   4.0, Math.PI * 0.5,  0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}lampSquareFloor.glb`,       6.5, Li,   6.5, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  // Web research terminal (N, centre-east)
  glb(`${k}desk.glb`,                  2.5, Li,  -5.5, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}computerScreen.glb`,        2.5, Li + 0.75, -5.5, 0,        0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}computerKeyboard.glb`,      2.9, Li + 0.75, -4.8, 0,        0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,             2.5, Li,  -4.0, Math.PI,        0.9, g5, 5, gltfLoader, furnitureMeshes);
  // Central display table
  glb(`${k}tableRound.glb`,            0.0, Li,   0.5, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}books.glb`,                 0.0, Li + 0.75, 0.5, 0,         0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}rugRound.glb`,              0.0, Li,   0.5, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,            -1.5, Li,   0.5, Math.PI * 0.5,  0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,             1.5, Li,   0.5, Math.PI * -0.5, 0.9, g5, 5, gltfLoader, furnitureMeshes);
  // West wall bookcases
  glb(`${k}bookcaseClosedWide.glb`,   -7.2, Li,  -5.5, Math.PI * 0.5,  0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseOpen.glb`,         -7.2, Li,  -3.0, Math.PI * 0.5,  0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}books.glb`,               -7.2, Li + 1.2, -4.0, Math.PI * 0.5, 0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,           7.0, Li,   7.0, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,          -7.0, Li,   7.0, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}plantSmall1.glb`,          -2.5, Li,   7.0, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}plantSmall2.glb`,           1.5, Li,   7.0, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}lampSquareFloor.glb`,      -7.0, Li,   2.0, 0,              0.9, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}speaker.glb`,             -7.2, Li,   6.5, Math.PI * 0.5,  0.9, g5, 5, gltfLoader, furnitureMeshes);
}

// ─── GLB loader helper ────────────────────────────────────────────────────────

function glb(path, x, y, z, ry = 0, scale = 0.9, group = null, floorIndex = -1, gltfLoader, furnitureMeshes) {
  gltfLoader.load(path, (gltf) => {
    const model = gltf.scene;
    model.position.set(x, y, z);
    model.rotation.y = ry;
    model.scale.setScalar(scale);
    model.userData.isFurniture = true;
    model.userData.floorIndex  = floorIndex;
    model.userData.floorY      = floorIndex >= 0 ? FLOORS[floorIndex].y : y;

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
