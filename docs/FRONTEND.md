# Frontend Module Reference

Vanilla ES modules served by Express. Three.js r163 via CDN importmap (no build step).
WS port 3001, HTTP port 3000 — configurable via `?ws=&http=` query params.
GLB models in `public/models/` — fallback to built-in geometry if absent.

## Module map (`public/js/`)

| File | Purpose |
|------|---------|
| `world.js` | Scene init, camera, controls, animation loop, pointer events, WebSocket handler |
| `world/constants.js` | FLOOR_SIZE, FLOORS array, ACTION_TASK_MAP, soul spot arrays — **start here** |
| `world/builders.js` | Floor slabs, perimeter walls, elevator shaft, scene lights |
| `world/furniture.js` | GLTF furniture placement per floor (room layout in file header comment) |
| `world/avatar.js` | SoulAvatar class: wander/task state machine, GLB loading, poses |
| `hud.js` | HTML overlays, soul selector, soul panel |
| `api.js` | WebSocket connection, REST helpers |

## Asset credits
- Characters: Quaternius (CC0)
- Furniture: Kenney (CC0)
