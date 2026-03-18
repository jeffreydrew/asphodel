// ─── Asphodel Tower — World Constants ────────────────────────────────────────
// All static configuration: dimensions, floor defs, soul spot arrays, action map.
// No Three.js imports — pure data. Safe to read without context from other modules.

export const FLOOR_SPACING = 4.5;
export const FLOOR_SIZE    = 16;
export const WALL_HEIGHT   = 3.8;
export const ELEV_X        = 6.5;
export const ELEV_Z        = 6.5;

export const SOUL_COLORS = [0xff6b9d, 0xffd93d, 0x6bcb77, 0x4d96ff, 0xc77dff];

export const KIT = '/models/furniture/kenney_furniture-kit/Models/GLTF%20format/';

export const FLOORS = [
  { y: 0,                  label: 'LOBBY',   lightColor: 0xffddaa, lightIntensity: 80,  floorColor: 0x1e1e42, actions: ['idle','meet_soul','social_post'] },
  { y: FLOOR_SPACING,      label: 'KITCHEN', lightColor: 0xfff4e8, lightIntensity: 90,  floorColor: 0x1a2e42, actions: ['eat'] },
  { y: FLOOR_SPACING * 2,  label: 'OFFICE',  lightColor: 0xe8f0ff, lightIntensity: 100, floorColor: 0x14223a, actions: ['browse_jobs','submit_application','create_content'] },
  { y: FLOOR_SPACING * 3,  label: 'GYM',     lightColor: 0xd4ffea, lightIntensity: 80,  floorColor: 0x162e26, actions: ['exercise'] },
  { y: FLOOR_SPACING * 4,  label: 'BEDROOM', lightColor: 0xffccaa, lightIntensity: 50,  floorColor: 0x221238, actions: ['rest'] },
  { y: FLOOR_SPACING * 5,  label: 'LIBRARY', lightColor: 0xffe8cc, lightIntensity: 65,  floorColor: 0x1a1208, actions: ['read_book','write_book','create_art','browse_web'] },
];

// ─── Soul task spots — [x, z] per soul index ─────────────────────────────────

const LOBBY_COUCH_XZ   = [[-5.5,-2.5], [-5.5, 1.5], [-5.5,-4.5], [5.0,-4.5], [6.5,-1.0]];
const LOBBY_MEETING_XZ = [[-4.0,-1.5], [-3.0,-3.0], [-3.5, 0.5], [5.5,-4.0], [5.5,-1.5]];
const KITCHEN_SPOT_XZ  = [[ 1.5,-5.5], [ 3.0,-5.5], [ 4.5,-5.5], [1.5, 1.5], [3.0, 1.5]];
const OFFICE_DESK_XZ   = [[-6.0,-4.0], [-3.0,-4.0], [ 0.0,-4.0], [3.0,-4.0], [6.0,-4.0]];
const OFFICE_MTG_XZ    = [[-2.5, 4.0], [ 2.5, 4.0], [ 0.0, 5.5], [-1.0,4.5], [1.0, 4.5]];
const GYM_SPOT_XZ      = [[-5.5,-5.5], [-5.5,-2.5], [-5.5, 0.5], [1.0,-2.5], [4.5,-4.5]];
const BED_XZ           = [[-5.5,-5.0], [ 5.5,-5.0], [-5.5,-0.5], [5.5,-0.5], [-5.5,3.0]];
const LIB_DESK_XZ      = [[-6.0,-4.0], [-3.5,-4.0], [-1.0,-4.0], [2.5,-4.0], [0.0, 0.5]];
const LIB_READING_XZ   = [[-6.5, 5.0], [-5.0, 5.5], [-6.5, 2.5], [-1.5,0.5], [1.5, 0.5]];
const LIB_ART_XZ       = [[ 2.0, 5.0], [ 5.0, 5.0], [ 2.0, 2.5], [-1.5,0.5], [3.5, 3.5]];

// ─── action → { spots, ms, sit?, computer? } ─────────────────────────────────

export const ACTION_TASK_MAP = {
  'idle':               { spots: LOBBY_COUCH_XZ,   ms: 25_000, sit: true },
  'social_post':        { spots: LOBBY_COUCH_XZ,   ms: 20_000, sit: true },
  'meet_soul':          { spots: LOBBY_MEETING_XZ, ms: 25_000, sit: true },
  'meet_soul_office':   { spots: OFFICE_MTG_XZ,    ms: 25_000, sit: true },
  'eat':                { spots: KITCHEN_SPOT_XZ,  ms: 20_000, sit: true },
  'browse_jobs':        { spots: OFFICE_DESK_XZ,   ms: 45_000, computer: true },
  'submit_application': { spots: OFFICE_DESK_XZ,   ms: 35_000, computer: true },
  'create_content':     { spots: OFFICE_DESK_XZ,   ms: 45_000, computer: true },
  'exercise':           { spots: GYM_SPOT_XZ,      ms: 30_000 },
  'rest':               { spots: BED_XZ,            ms: 60_000, sit: true },
  'read_book':          { spots: LIB_READING_XZ,   ms: 40_000, sit: true },
  'write_book':         { spots: LIB_DESK_XZ,      ms: 45_000, computer: true },
  'create_art':         { spots: LIB_ART_XZ,       ms: 35_000 },
  'browse_web':         { spots: LIB_DESK_XZ,      ms: 35_000, computer: true },
};
