// ─── Asphodel Tower — World Constants ────────────────────────────────────────
// All static configuration: dimensions, floor defs, soul spot arrays, action map.
// No Three.js imports — pure data. Safe to read without context from other modules.

export const FLOOR_SPACING = 4.5;
export const FLOOR_SIZE    = 80;
export const WALL_HEIGHT   = 3.8;
export const ELEV_X        = 28;
export const ELEV_Z        = 28;

export const SOUL_COLORS = [0xff6b9d, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xc77dff];

export const KIT = '/models/furniture/kenney_furniture-kit/Models/GLTF%20format/';

export const FLOORS = [
  { y: 0,                  label: 'LOBBY',   lightColor: 0xfff8f0, lightIntensity: 22,  floorColor: 0x6868b0, actions: ['idle','meet_soul','social_post'] },
  { y: FLOOR_SPACING,      label: 'KITCHEN', lightColor: 0xf0f8ff, lightIntensity: 24,  floorColor: 0x5090b0, actions: ['eat'] },
  { y: FLOOR_SPACING * 2,  label: 'OFFICE',  lightColor: 0xf0f4ff, lightIntensity: 26,  floorColor: 0x4878a8, actions: ['browse_jobs','submit_application','create_content'] },
  { y: FLOOR_SPACING * 3,  label: 'GYM',     lightColor: 0xf0fff8, lightIntensity: 22,  floorColor: 0x409878, actions: ['exercise'] },
  { y: FLOOR_SPACING * 4,  label: 'BEDROOM', lightColor: 0xfff0f8, lightIntensity: 18,  floorColor: 0x9060a8, actions: ['rest'] },
  { y: FLOOR_SPACING * 5,  label: 'LIBRARY', lightColor: 0xfff8e8, lightIntensity: 20,  floorColor: 0xa08040, actions: ['read_book','write_book','create_art','browse_web'] },
];

// ─── Soul task spots — [x, z] per soul index ─────────────────────────────────
// Blueprint coord system: left=-x, right=+x, top(north)=+z, bottom(south)=-z
// Elevator shaft: x=[24,32], z=[24,32]

// LOBBY — West Lounge sofas, East Meeting table chairs
const LOBBY_COUCH_XZ   = [[-28,12], [-28,20], [-18,12], [-18,20], [-28,6]];
const LOBBY_MEETING_XZ = [[14,-6],  [20,-6],  [17,-10], [17,-2],  [11,-6]];

// KITCHEN — Dining chairs and bar stools
const KITCHEN_SPOT_XZ  = [[-4,6], [4,6], [0,12], [0,0], [-8,-4]];

// OFFICE — Open workspace desks (north) and meeting room
const OFFICE_DESK_XZ   = [[-24,30], [-12,30], [0,30], [12,30], [-24,22]];
const OFFICE_MTG_XZ    = [[-30,0], [-24,0], [-18,0], [-24,4], [-24,-4]];

// GYM — Yoga zone mats and bench spots on main floor
const GYM_SPOT_XZ      = [[-24,28], [-8,28], [4,28], [-30,-4], [-30,-14]];

// BEDROOM — Bed positions inside each apartment
const BED_XZ           = [[-32,24], [-16,24], [0,24], [16,24], [28,-4]];

// LIBRARY — Writing desks, reading nook, art station
const LIB_DESK_XZ      = [[-24,30], [-12,30], [0,30], [12,30], [-24,22]];
const LIB_READING_XZ   = [[-30,-18], [-22,-18], [-30,-28], [-22,-28], [-26,-24]];
const LIB_ART_XZ       = [[4,-32], [12,-32], [4,-36], [12,-36], [8,-34]];

// ─── action → { spots, ms, sit?, computer?, seatY? } ─────────────────────────

export const ACTION_TASK_MAP = {
  'idle':               { spots: LOBBY_COUCH_XZ,   ms: 25_000, sit: true,      seatY: 0.45 },
  'social_post':        { spots: LOBBY_COUCH_XZ,   ms: 20_000, sit: true,      seatY: 0.45 },
  'meet_soul':          { spots: LOBBY_MEETING_XZ, ms: 25_000, sit: true,      seatY: 0.45 },
  'meet_soul_office':   { spots: OFFICE_MTG_XZ,    ms: 25_000, sit: true,      seatY: 0.45 },
  'eat':                { spots: KITCHEN_SPOT_XZ,  ms: 20_000, sit: true,      seatY: 0.50 },
  'browse_jobs':        { spots: OFFICE_DESK_XZ,   ms: 45_000, computer: true, seatY: 0.45 },
  'submit_application': { spots: OFFICE_DESK_XZ,   ms: 35_000, computer: true, seatY: 0.45 },
  'create_content':     { spots: OFFICE_DESK_XZ,   ms: 45_000, computer: true, seatY: 0.45 },
  'exercise':           { spots: GYM_SPOT_XZ,      ms: 30_000 },
  'rest':               { spots: BED_XZ,            ms: 60_000, sit: true,      seatY: 0.50 },
  'read_book':          { spots: LIB_READING_XZ,   ms: 40_000, sit: true,      seatY: 0.45 },
  'write_book':         { spots: LIB_DESK_XZ,      ms: 45_000, computer: true, seatY: 0.45 },
  'create_art':         { spots: LIB_ART_XZ,       ms: 35_000 },
  'browse_web':         { spots: LIB_DESK_XZ,      ms: 35_000, computer: true, seatY: 0.45 },
  'cook':              { spots: KITCHEN_SPOT_XZ,   ms: 25_000, sit: true,      seatY: 0.50 },
  'nap':               { spots: BED_XZ,            ms: 40_000, sit: true,      seatY: 0.50 },
  'meditate':          { spots: GYM_SPOT_XZ,       ms: 20_000 },
  'journal':           { spots: LIB_DESK_XZ,       ms: 25_000, computer: true, seatY: 0.45 },
  'walk':              { spots: LOBBY_COUCH_XZ,    ms: 15_000 },
  'work':              { spots: OFFICE_DESK_XZ,    ms: 45_000, computer: true, seatY: 0.45 },
  'socialize':         { spots: LOBBY_MEETING_XZ,  ms: 25_000, sit: true,      seatY: 0.45 },
};

// ─── Wall collision segments — { axis:'x'|'z', value, min, max } ─────────────
// axis:'x' = wall perpendicular to x-axis (vertical wall at x=value, spans z=[min,max])
// axis:'z' = wall perpendicular to z-axis (horizontal wall at z=value, spans x=[min,max])

const _PERIMETER = [
  { axis: 'x', value: -40, min: -40, max: 40 },
  { axis: 'x', value:  40, min: -40, max: 40 },
  { axis: 'z', value: -40, min: -40, max: 40 },
  { axis: 'z', value:  40, min: -40, max: 40 },
];

// Elevator shaft walls: x=[24,32], z=[24,32]
const _ELEVATOR = [
  { axis: 'x', value: 24, min: 24, max: 32 },
  { axis: 'z', value: 24, min: 24, max: 32 },
];

export const FLOOR_WALLS = [
  // 0: LOBBY
  [
    ..._PERIMETER, ..._ELEVATOR,
    { axis: 'z', value: 0,   min: -32, max: -8 },   // partial divider E-W
    { axis: 'z', value: -16, min: 8,   max: 24 },    // east meeting divider E-W
  ],
  // 1: KITCHEN
  [
    ..._PERIMETER, ..._ELEVATOR,
    { axis: 'z', value: 16,  min: -40, max: -16 },   // kitchen prep south wall
    { axis: 'x', value: -16, min: 8,   max: 16 },    // kitchen prep east wall
    { axis: 'z', value: -16, min: 16,  max: 40 },    // pantry north wall
    { axis: 'x', value: 8,   min: -40, max: -24 },   // pantry west wall (door gap z=-24..-16)
  ],
  // 2: OFFICE
  [
    ..._PERIMETER, ..._ELEVATOR,
    { axis: 'z', value: 8,   min: -40, max: -8 },    // meeting room south wall
    { axis: 'x', value: -8,  min: 8,   max: 20 },    // meeting room east wall (solid+glass, door gap z=20..24)
    { axis: 'x', value: 16,  min: -16, max: -4 },    // library wall below gap
    { axis: 'x', value: 16,  min: 4,   max: 24 },    // library wall above gap
    { axis: 'z', value: -16, min: -40, max: -12 },   // lounge/break divider left
    { axis: 'z', value: -16, min: -4,  max: 4 },     // lounge/break divider center
    { axis: 'z', value: -16, min: 12,  max: 16 },    // lounge/break divider right
  ],
  // 3: GYM
  [
    ..._PERIMETER, ..._ELEVATOR,
    { axis: 'z', value: 16,  min: -40, max: -8 },    // yoga zone divider (door gap x=-8..0)
    { axis: 'z', value: -16, min: 16,  max: 40 },    // locker room north wall
    { axis: 'x', value: 16,  min: -40, max: -24 },   // locker room west wall (door gap z=-24..-16)
  ],
  // 4: BEDROOM
  [
    ..._PERIMETER, ..._ELEVATOR,
    // Apt dividing walls N-S
    { axis: 'x', value: -24, min: 8,  max: 40 },
    { axis: 'x', value:  -8, min: 8,  max: 40 },
    { axis: 'x', value:   8, min: 8,  max: 40 },
    // Hallway wall E-W at z=8, with door gaps per apt
    { axis: 'z', value: 8, min: -40, max: -36 },     // apt1 left
    { axis: 'z', value: 8, min: -28, max: -24 },     // apt1 right
    { axis: 'z', value: 8, min: -24, max: -20 },     // apt2 left
    { axis: 'z', value: 8, min: -12, max:  -8 },     // apt2 right
    { axis: 'z', value: 8, min:  -8, max:  -4 },     // apt3 left
    { axis: 'z', value: 8, min:   4, max:   8 },     // apt3 right
    { axis: 'z', value: 8, min:   8, max:  12 },     // apt4 left
    { axis: 'z', value: 8, min:  20, max:  24 },     // apt4 right
    // Apt 5 west wall (door gap z=-4..4)
    { axis: 'x', value: 16, min: -16, max: -4 },
    { axis: 'x', value: 16, min: 4,   max: 8 },
    // Apt 5 north wall
    { axis: 'z', value: 8, min: 16, max: 24 },
  ],
  // 5: LIBRARY
  [
    ..._PERIMETER, ..._ELEVATOR,
    // Archive room west wall (door gap z=-4..4)
    { axis: 'x', value: 16, min: -40, max: -4 },
    { axis: 'x', value: 16, min: 4,   max: 24 },
    // Reading nook east divider
    { axis: 'x', value: -16, min: -40, max: -8 },
    // Art area north wall (gap x=4..8)
    { axis: 'z', value: -24, min: 0,  max: 4 },
    { axis: 'z', value: -24, min: 8,  max: 16 },
    // Art stable/station divider
    { axis: 'x', value: 8, min: -40, max: -24 },
  ],
];

// ─── Wander zones — navigable rectangles [x1,z1,x2,z2] per floor ─────────────

export const WANDER_ZONES = [
  // 0: LOBBY
  [
    [-38,  2, -10,  38],  // west lounge (north of divider)
    [-38,-38,  23,   0],  // south half (reception south + waiting)
    [ -6,  2,  23,  23],  // reception + east meeting area
  ],
  // 1: KITCHEN
  [
    [-38, -14,  6,  14],  // main kitchen + dining area
    [-38,  18, -18,  38], // kitchen prep
    [ 10, -38,  38, -18], // pantry
  ],
  // 2: OFFICE
  [
    [-38,  10,  14,  38],  // open workspace (north)
    [-38,  10, -10,   6],  // meeting room
    [-6,  -14,  14,   8],  // reception area
    [-38, -38, -14, -18],  // lounge area (SW)
    [  6, -38,  14, -18],  // break room (SE)
  ],
  // 3: GYM
  [
    [-38,  18,  -10, 38],  // yoga zone
    [-38, -14,  14,  14],  // main gym floor
    [ 18, -38,  38, -18],  // locker room
  ],
  // 4: BEDROOM
  [
    [-38,-14,  14,   6],   // common area
    [-38, 10, -26,  38],   // apt 1
    [-22, 10,  -10, 38],   // apt 2
    [ -6, 10,   6,  38],   // apt 3
    [ 10, 10,  22,  38],   // apt 4
    [ 18,-14,  38,   6],   // apt 5
  ],
  // 5: LIBRARY
  [
    [-38,  -6,  14,  38],  // north half (desks + display table)
    [-38, -38, -18,  -10], // reading nook (SW)
    [-14, -22,  14,  -8],  // main floor south
    [ 18, -38,  38,  23],  // archive room
  ],
];
