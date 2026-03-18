# CLAUDE.md

## Active Work
<!-- Update this at the start of each session -->
**Current feature:**
**Files in scope:**
**Last known state:**

---

## Commands

```bash
npm run dev        # run with ts-node (no build needed)
npm run build      # compile to dist/
npm run typecheck  # run before declaring anything done
./ollama-tunnel.sh # SSH tunnel to Hetzner Ollama (keep open during dev)
./db-mount.sh      # mount server DB via SSHFS (stop PM2 on server first)
./deploy.sh        # build + rsync + pm2 restart on Hetzner
```

**Validate:** `npm run typecheck` + `timeout 8 npm run dev`

### Dev workflow (canonical single DB)

1. `ssh -i .ssh/id_ed25519 root@128.140.7.97 'pm2 stop asphodel'`
2. Terminal 1: `./ollama-tunnel.sh`
3. Terminal 2: `./db-mount.sh` → mounts to `./mnt/`
4. Terminal 3: `npm run dev`
5. Done: Ctrl+C db-mount, then `./deploy.sh` or `ssh ... pm2 restart asphodel`

---

## Project Paradigm

Asphodel Tower is a **living autonomous community**. Five souls run parallel async loops — each tick: decide (LLM) → execute → score reward → update state → broadcast (WebSocket) → sleep.

**Souls are sovereign persons**, not NPCs. Every decision, content piece, and social post is LLM-generated using the soul's full identity (name, neighbours, email, blog, social handle). Visitors send directives but cannot override the LLM.

---

## Architecture

### Tick pipeline (`src/agent/AgentLoop.ts`)
```
drain DirectiveQueue
→ LLMDecider.decide()           # HardcodedDecider fallback if Ollama offline
→ generateContent/Social/Reflection (90s timeout)
→ ActionExecutor.run()          # BrowserAgent first, simulation fallback
→ scoreReward()                 # pure fn, per-soul weights
→ soul.updateVitals() + creditWallet()
→ QuirkTracker.reinforce()
→ EventClassifier → WorldLog.append()
→ IntegrationDispatcher.dispatch()  # Ghost, Twitter, Reddit
→ updatePosition()              # 3D coords for Three.js
→ pushSnapshot() + worldEvents.emit('update')
→ sleep(COOLDOWNS[action] * COOLDOWN_SCALE)
```

### Key files
| Path | Purpose |
|------|---------|
| `src/agent/AgentLoop.ts` | Main tick loop |
| `src/llm/prompts.ts` | All 4 prompt builders (decision/content/social/reflection) |
| `src/llm/LLMDecider.ts` | Ollama call + HardcodedDecider fallback |
| `src/engine/RewardEngine.ts` | `scoreReward()` — pure fn, per-soul weights |
| `src/engine/QuirkTracker.ts` | Reinforce → seed (5) → persist (15) → inject into prompts |
| `src/db/schema.ts` | SQLite schema, applied idempotently |
| `src/integrations/` | Ghost, Twitter, Reddit, Stripe — all no-op if env vars absent |
| `src/browser/BrowserAgent.ts` | Playwright; returns null for unhandled actions |
| `public/js/world.js` | Three.js scene, WebSocket handler |
| `public/js/world/constants.js` | FLOOR_SIZE, soul spots, ACTION_TASK_MAP — start here for frontend |
| `public/js/world/avatar.js` | SoulAvatar: wander/task state machine, GLB loading |

### Design rules (don't break these)
- **Identity preamble first.** All prompt builders call `buildIdentityPreamble(identity, neighbours)` before any decision context.
- **Reward weights are per-soul** and stored in DB — never shared state.
- **Two Ollama timeouts:** decisions = `OLLAMA_TIMEOUT_MS` (30s), content/social/reflection = `OLLAMA_CONTENT_TIMEOUT_MS` (90s) via `{ long: true }`.
- **All integrations fail silently** if env vars absent.
- **Directives:** `POST /directives` → `DirectiveQueue.enqueue()` → `drain()` at tick start → appended to decision prompt.

### Quirk lifecycle
Seed at 5 reinforcements → persist at 15 → only **persisted** quirks injected into prompts. Single entry: `QuirkTracker.reinforce()` called once per tick.

---

## Infrastructure

- **App server:** `128.140.7.97` (Hetzner CX32) — Node + Nginx + PM2
- **Ollama server:** `178.104.95.182` (Hetzner CX42) — qwen2.5:7b
- **SSH key:** `.ssh/id_ed25519` (gitignored)

---

## Critical Env Vars

```
OLLAMA_URL                  # tunnel: localhost:11434 | prod: http://178.104.95.182:11434
OLLAMA_TIMEOUT_MS           # default 30000
OLLAMA_CONTENT_TIMEOUT_MS   # default 90000
COOLDOWN_SCALE              # 1=fast dev, 10=prod pacing
ENABLE_BROWSER=true         # activates Playwright (needs: npx playwright install chromium)
ENABLE_REAL_MONEY=true      # + STRIPE_SECRET_KEY → routes wallet to Stripe Connect
GHOST_URL + GHOST_ADMIN_KEY # blog publishing
TWITTER_* / REDDIT_*        # per-soul or shared fallback
```

---

## Reference docs (load only when needed)
- `docs/schema.md` — full SQLite table list (15 tables)
- `docs/cooldowns.md` — base cooldown values per action type
- `docs/frontend.md` — full frontend module descriptions
