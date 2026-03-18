// ─── Asphodel Tower — Furniture Loader ───────────────────────────────────────
// Loads all GLTF furniture models and places them on their floor groups.
// Positions match the blueprint floor plan images.
// Exports: loadFurniture(floorGroups, gltfLoader, furnitureMeshes)
//
// Coord system: left=-x, right=+x, top(north)=+z, bottom(south)=-z
// Elevator shaft at +x,+z corner (~x=28..40, z=28..40)

import * as THREE from 'three';
import { FLOORS, KIT } from './constants.js';

// ─── Public API ───────────────────────────────────────────────────────────────

export function loadFurniture(floorGroups, gltfLoader, furnitureMeshes) {
  const k = KIT;
  // s = standard furniture scale (Kenney kit is ~1 unit = 1m at scale 1.0)
  const s = 7.5;
  // Desk-top y-offset for items placed ON a desk/counter at scale 7.5
  const deskY = 6.25;
  // Upper-cabinet y-offset
  const upperY = 12.9;

  // ── LOBBY ─────────────────────────────────────────────────────────────────
  const g0 = floorGroups[0], L = FLOORS[0].y;

  // West Lounge — sofas facing each other with coffee tables (z=2..38 area, x=-38..-10)
  // Row 1: sofas against west wall facing east
  glb(`${k}loungeSofaLong.glb`,      -37, L,  28, Math.PI * 0.5, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeSofa.glb`,          -37, L,  20, Math.PI * 0.5, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeSofa.glb`,          -37, L,  12, Math.PI * 0.5, s, g0, 0, gltfLoader, furnitureMeshes);
  // Coffee tables between
  glb(`${k}tableCoffee.glb`,         -28, L,  26, 0, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}tableCoffee.glb`,         -28, L,  16, 0, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,        -28, L,  26, Math.PI * 0.5, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,        -28, L,  16, Math.PI * 0.5, s, g0, 0, gltfLoader, furnitureMeshes);
  // Row 2: sofas facing west
  glb(`${k}loungeSofa.glb`,          -20, L,  28, Math.PI * -0.5, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeSofa.glb`,          -20, L,  20, Math.PI * -0.5, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeSofaCorner.glb`,    -20, L,  12, Math.PI * -0.5, s, g0, 0, gltfLoader, furnitureMeshes);
  // Small tables/rugs in lounge
  glb(`${k}rugRectangle.glb`,        -28, L,   6, 0, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}tableCoffeeSquare.glb`,   -28, L,   6, 0, s, g0, 0, gltfLoader, furnitureMeshes);

  // Reception desk — center
  glb(`${k}desk.glb`,                  0, L,   8, Math.PI, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}computerScreen.glb`,        0, L + deskY, 8, Math.PI, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,             0, L,  12, 0, s, g0, 0, gltfLoader, furnitureMeshes);

  // East Meeting — round table with chairs (x=8..22, z=-14..-2)
  glb(`${k}tableRound.glb`,           17, L,  -6, 0, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}rugRound.glb`,             17, L,  -6, 0, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChair.glb`,          11, L,  -6, Math.PI * 0.5, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChair.glb`,          23, L,  -6, Math.PI * -0.5, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChair.glb`,          17, L,   0, Math.PI, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChair.glb`,          17, L, -12, 0, s, g0, 0, gltfLoader, furnitureMeshes);

  // Waiting area — benches along south wall
  glb(`${k}benchCushion.glb`,         10, L, -36, Math.PI, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}benchCushion.glb`,         18, L, -36, Math.PI, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}loungeSofa.glb`,           14, L, -28, 0, s, g0, 0, gltfLoader, furnitureMeshes);

  // Decorations
  glb(`${k}pottedPlant.glb`,         -37, L,  36, 0, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,          22, L, -36, 0, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}lampSquareFloor.glb`,     -37, L,   2, 0, s, g0, 0, gltfLoader, furnitureMeshes);
  glb(`${k}coatRackStanding.glb`,    -37, L, -36, 0, s, g0, 0, gltfLoader, furnitureMeshes);

  // ── KITCHEN ───────────────────────────────────────────────────────────────
  const g1 = floorGroups[1], Ki = FLOORS[1].y;

  // Kitchen Prep — west wall appliances (x≈-37, z=18..36)
  glb(`${k}kitchenCabinet.glb`,      -37, Ki,  34, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenCabinet.glb`,      -37, Ki,  30, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenFridge.glb`,       -37, Ki,  26, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenStove.glb`,        -37, Ki,  22, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}hoodModern.glb`,          -37, Ki + upperY, 22, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenSink.glb`,         -30, Ki,  37, Math.PI, s, g1, 1, gltfLoader, furnitureMeshes);
  // Upper cabinets
  glb(`${k}kitchenCabinetUpperDouble.glb`, -37, Ki + upperY, 32, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenCabinetUpper.glb`, -37, Ki + upperY, 26, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  // Countertop appliances
  glb(`${k}kitchenMicrowave.glb`,    -34, Ki + deskY, 34, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenCoffeeMachine.glb`,-34, Ki + deskY, 30, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}toaster.glb`,             -24, Ki + deskY, 37, Math.PI, s, g1, 1, gltfLoader, furnitureMeshes);

  // Bar counter island + stools (center of kitchen area)
  glb(`${k}kitchenBar.glb`,          -10, Ki,  -4, 0, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenBar.glb`,           -4, Ki,  -4, 0, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenBarEnd.glb`,         2, Ki,  -4, 0, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}stoolBar.glb`,            -10, Ki,  -8, Math.PI, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}stoolBar.glb`,             -4, Ki,  -8, Math.PI, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}stoolBar.glb`,              2, Ki,  -8, Math.PI, s, g1, 1, gltfLoader, furnitureMeshes);

  // Dining Area — rectangular table with chairs (center-right)
  glb(`${k}table.glb`,                 0, Ki,   6, 0, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}tableCloth.glb`,            0, Ki,   6, 0, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,            -4, Ki,   6, Math.PI * 0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,             4, Ki,   6, Math.PI * -0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,             0, Ki,  10, 0, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,             0, Ki,   2, Math.PI, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,          0, Ki,   6, 0, s, g1, 1, gltfLoader, furnitureMeshes);

  // Pantry (SE, x=10..38, z=-38..-18)
  glb(`${k}kitchenCabinet.glb`,       20, Ki, -30, Math.PI * -0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenCabinet.glb`,       20, Ki, -36, Math.PI * -0.5, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}kitchenFridgeSmall.glb`,   36, Ki, -34, Math.PI * -0.5, s, g1, 1, gltfLoader, furnitureMeshes);

  // Decorations
  glb(`${k}pottedPlant.glb`,         -37, Ki,  37, 0, s, g1, 1, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,          22, Ki, -37, 0, s, g1, 1, gltfLoader, furnitureMeshes);

  // ── OFFICE ────────────────────────────────────────────────────────────────
  const g2 = floorGroups[2], O = FLOORS[2].y;

  // Open Workspace — north wall desks with computers (4 stations, z≈36)
  for (let i = 0; i < 4; i++) {
    const dx = -24 + i * 12;
    glb(`${k}desk.glb`,              dx, O, 36, 0, s, g2, 2, gltfLoader, furnitureMeshes);
    glb(`${k}computerScreen.glb`,    dx, O + deskY, 36, 0, s, g2, 2, gltfLoader, furnitureMeshes);
    glb(`${k}computerKeyboard.glb`,  dx + 1, O + deskY, 37, 0, s, g2, 2, gltfLoader, furnitureMeshes);
    glb(`${k}chairDesk.glb`,         dx, O, 32, Math.PI, s, g2, 2, gltfLoader, furnitureMeshes);
  }
  // Second row chairs
  for (let i = 0; i < 4; i++) {
    const dx = -24 + i * 12;
    glb(`${k}chairDesk.glb`,         dx, O, 26, 0, s, g2, 2, gltfLoader, furnitureMeshes);
  }

  // Meeting Room (west, x=-38..-10, z=10..22)
  glb(`${k}table.glb`,              -24, O,  14, 0, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,          -30, O,  14, Math.PI * 0.5, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,          -18, O,  14, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,          -24, O,  18, 0, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,          -24, O,  10, Math.PI, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,       -24, O,  14, 0, s, g2, 2, gltfLoader, furnitureMeshes);

  // Reception desk (center)
  glb(`${k}desk.glb`,                 4, O,   0, Math.PI, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}computerScreen.glb`,       4, O + deskY, 0, Math.PI, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,            4, O,   4, 0, s, g2, 2, gltfLoader, furnitureMeshes);

  // Library Wall bookcases (along x=18, east side of library wall)
  glb(`${k}bookcaseOpen.glb`,        18, O,  -8, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseOpen.glb`,        18, O,  -2, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseClosed.glb`,      18, O,   6, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseClosedWide.glb`,  18, O,  14, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}books.glb`,               18, O + 10.0, 10, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes);

  // Lounge Area (SW, x=-38..-14, z=-38..-18)
  glb(`${k}loungeSofa.glb`,         -34, O, -28, Math.PI * 0.5, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}loungeSofaLong.glb`,     -26, O, -36, 0, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}tableCoffee.glb`,        -28, O, -28, 0, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,       -28, O, -30, Math.PI * 0.5, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChair.glb`,        -22, O, -24, Math.PI, s, g2, 2, gltfLoader, furnitureMeshes);

  // Break Room (SE, x=6..14, z=-38..-18)
  glb(`${k}loungeSofa.glb`,          10, O, -28, Math.PI * -0.5, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}tableCoffeeGlass.glb`,    12, O, -32, 0, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}stoolBar.glb`,            10, O, -36, 0, s, g2, 2, gltfLoader, furnitureMeshes);

  // Plants & decor
  glb(`${k}pottedPlant.glb`,        -37, O, -37, 0, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,         22, O,  37, 0, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}lampSquareFloor.glb`,    -37, O,  37, 0, s, g2, 2, gltfLoader, furnitureMeshes);
  glb(`${k}trashcan.glb`,           -12, O, -37, 0, s, g2, 2, gltfLoader, furnitureMeshes);

  // ── GYM ───────────────────────────────────────────────────────────────────
  const g3 = floorGroups[3], G = FLOORS[3].y;

  // Yoga Zone — mats (NW, z>16)
  glb(`${k}rugRectangle.glb`,        -8, G,  30, 0, s, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,         4, G,  30, 0, s, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,        16, G,  30, 0, s, g3, 3, gltfLoader, furnitureMeshes);

  // Main Gym Floor — weight benches along west wall
  glb(`${k}benchCushionLow.glb`,    -36, G,  -4, Math.PI * 0.5, s, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}benchCushionLow.glb`,    -36, G, -12, Math.PI * 0.5, s, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}benchCushionLow.glb`,    -36, G, -20, Math.PI * 0.5, s, g3, 3, gltfLoader, furnitureMeshes);
  // Equipment mats on gym floor
  glb(`${k}rugRectangle.glb`,         0, G,  -4, 0, s, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,         0, G, -20, 0, s, g3, 3, gltfLoader, furnitureMeshes);
  // East wall water station
  glb(`${k}sideTable.glb`,           22, G,   8, Math.PI * -0.5, s, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}sideTable.glb`,           22, G,  -8, Math.PI * -0.5, s, g3, 3, gltfLoader, furnitureMeshes);

  // Locker Room (SE, x=18..38, z=-38..-18)
  glb(`${k}benchCushion.glb`,        24, G, -28, Math.PI * -0.5, s, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}benchCushion.glb`,        24, G, -34, Math.PI * -0.5, s, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}coatRackStanding.glb`,    34, G, -22, 0, s, g3, 3, gltfLoader, furnitureMeshes);

  // Decorations
  glb(`${k}pottedPlant.glb`,        -37, G,  37, 0, s, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,         22, G,  37, 0, s, g3, 3, gltfLoader, furnitureMeshes);
  glb(`${k}radio.glb`,              -37, G, -37, Math.PI * 0.5, s, g3, 3, gltfLoader, furnitureMeshes);

  // ── BEDROOM ───────────────────────────────────────────────────────────────
  const g4 = floorGroups[4], Be = FLOORS[4].y;

  // Apt 1 (x=-40..-24, z=8..40)
  glb(`${k}bedDouble.glb`,          -32, Be,  30, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}cabinetBed.glb`,         -28, Be,  36, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundTable.glb`,     -28, Be + 5.0, 36, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}coatRack.glb`,           -37, Be,  12, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}rugRounded.glb`,         -32, Be,  22, 0, s, g4, 4, gltfLoader, furnitureMeshes);

  // Apt 2 (x=-24..-8, z=8..40)
  glb(`${k}bedDouble.glb`,          -16, Be,  30, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}cabinetBed.glb`,         -12, Be,  36, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundTable.glb`,     -12, Be + 5.0, 36, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}rugRounded.glb`,         -16, Be,  22, 0, s, g4, 4, gltfLoader, furnitureMeshes);

  // Apt 3 (x=-8..8, z=8..40)
  glb(`${k}bedSingle.glb`,            0, Be,  30, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}cabinetBed.glb`,           4, Be,  36, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundTable.glb`,       4, Be + 5.0, 36, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}rugRounded.glb`,           0, Be,  22, 0, s, g4, 4, gltfLoader, furnitureMeshes);

  // Apt 4 (x=8..24, z=8..40)
  glb(`${k}bedSingle.glb`,           16, Be,  30, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}cabinetBed.glb`,          20, Be,  36, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundTable.glb`,      20, Be + 5.0, 36, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}rugRounded.glb`,          16, Be,  22, 0, s, g4, 4, gltfLoader, furnitureMeshes);

  // Apt 5 (east, x=16..40, z=-16..8)
  glb(`${k}bedDouble.glb`,           30, Be,  -4, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}cabinetBed.glb`,          36, Be,   2, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundTable.glb`,      36, Be + 5.0, 2, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}sideTableDrawers.glb`,    36, Be, -10, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseClosedWide.glb`,  36, Be, -14, Math.PI * -0.5, s, g4, 4, gltfLoader, furnitureMeshes);

  // Common Area (south, z < 8)
  glb(`${k}loungeSofa.glb`,          -8, Be,  -2, Math.PI * 0.5, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}loungeSofaLong.glb`,       0, Be,  -8, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}tableCoffee.glb`,         -2, Be,  -2, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}rugRectangle.glb`,        -2, Be,  -4, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundFloor.glb`,     -37, Be,  -8, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundFloor.glb`,      12, Be,  -8, 0, s, g4, 4, gltfLoader, furnitureMeshes);

  // Decorations
  glb(`${k}pottedPlant.glb`,        -37, Be,  37, 0, s, g4, 4, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,         22, Be, -14, 0, s, g4, 4, gltfLoader, furnitureMeshes);

  // ── LIBRARY ───────────────────────────────────────────────────────────────
  const g5 = floorGroups[5], Li = FLOORS[5].y;

  // Writing Desks — north wall, 4 desks with computers
  for (let i = 0; i < 4; i++) {
    const dx = -24 + i * 12;
    glb(`${k}desk.glb`,              dx, Li, 36, 0, s, g5, 5, gltfLoader, furnitureMeshes);
    glb(`${k}computerScreen.glb`,    dx, Li + deskY, 36, 0, s, g5, 5, gltfLoader, furnitureMeshes);
    glb(`${k}chairDesk.glb`,         dx, Li, 32, Math.PI, s, g5, 5, gltfLoader, furnitureMeshes);
  }

  // Display Table — center of main floor
  glb(`${k}tableRound.glb`,           0, Li,   4, 0, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}books.glb`,                0, Li + deskY, 4, 0, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}rugRound.glb`,             0, Li,   4, 0, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,           -4, Li,   4, Math.PI * 0.5, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,            4, Li,   4, Math.PI * -0.5, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,            0, Li,   8, 0, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,            0, Li,   0, Math.PI, s, g5, 5, gltfLoader, furnitureMeshes);

  // Reading Nook (SW, x < -16)
  glb(`${k}loungeChairRelax.glb`,   -30, Li, -18, Math.PI * 0.5, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}loungeChairRelax.glb`,   -24, Li, -28, Math.PI * 0.75, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}loungeSofa.glb`,         -32, Li, -32, Math.PI * 0.5, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}tableCoffee.glb`,        -24, Li, -22, 0, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}rugRound.glb`,           -26, Li, -24, 0, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}lampRoundFloor.glb`,     -37, Li, -37, 0, s, g5, 5, gltfLoader, furnitureMeshes);

  // West wall bookcases
  glb(`${k}bookcaseClosedWide.glb`, -37, Li,   4, Math.PI * 0.5, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseOpen.glb`,       -37, Li,  12, Math.PI * 0.5, s, g5, 5, gltfLoader, furnitureMeshes);

  // Archive Room (east, x > 16)
  glb(`${k}bookcaseOpen.glb`,        37, Li, -22, Math.PI * -0.5, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseOpen.glb`,        37, Li, -12, Math.PI * -0.5, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseClosed.glb`,      37, Li,  -2, Math.PI * -0.5, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseClosedWide.glb`,  37, Li,   8, Math.PI * -0.5, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}bookcaseOpen.glb`,        37, Li,  18, Math.PI * -0.5, s, g5, 5, gltfLoader, furnitureMeshes);

  // Art Stable (x=0..8, z=-40..-24)
  glb(`${k}table.glb`,                4, Li, -32, 0, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,            4, Li, -28, Math.PI, s, g5, 5, gltfLoader, furnitureMeshes);

  // Art Station (x=8..16, z=-40..-24)
  glb(`${k}desk.glb`,                12, Li, -32, 0, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}computerScreen.glb`,      12, Li + deskY, -32, 0, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}chairDesk.glb`,           12, Li, -28, Math.PI, s, g5, 5, gltfLoader, furnitureMeshes);

  // Decorations
  glb(`${k}pottedPlant.glb`,        -37, Li,  37, 0, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}pottedPlant.glb`,         22, Li,  37, 0, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}plantSmall1.glb`,         -8, Li, -37, 0, s, g5, 5, gltfLoader, furnitureMeshes);
  glb(`${k}speaker.glb`,            -37, Li,  24, Math.PI * 0.5, s, g5, 5, gltfLoader, furnitureMeshes);
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
