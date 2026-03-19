# Migration: Anthropic API + Prompt Caching + Computer Use

## Summary

Asphodel Tower's LLM stack has been migrated from Groq/Together AI to **Anthropic claude-haiku-4-5** as primary provider, with **ephemeral prompt caching** on the static identity + quirks blocks (~80% token reduction on repeated calls per soul).

---

## What Changed

| File | Change |
|------|--------|
| `src/llm/AnthropicClient.ts` | **NEW** — Anthropic SDK wrapper with caching + usage logging |
| `src/llm/systemBlocks.ts` | **NEW** — Builds ephemeral-cached `AnthropicContentBlock[]` arrays |
| `src/llm/ComputerUseAgent.ts` | **NEW** — Agentic computer-use loop (bash + text_editor + computer) |
| `src/llm/OllamaClient.ts` | **REPLACED** — Now an adapter that proxies to `AnthropicClient` |
| `src/llm/prompts.ts` | **MINOR** — Exported `buildIdentityPreamble` (was private) |
| `src/soul/AgentLoop.ts` | **UPDATED** — All 10 `ollama.chat()` calls → `anthropicClient.chat()` with systemBlocks; BROWSE_WEB → ComputerUseAgent when `ENABLE_COMPUTER_USE=true`; cache stats every 100 ticks |
| `src/soul/LLMDecider.ts` | **UNCHANGED** — Still calls `ollama.chat()` via adapter |
| `src/soul/ConversationLoop.ts` | **UNCHANGED** — Still calls `ollama.chat()` via adapter |
| `src/server/httpServer.ts` | **UNCHANGED** — Still calls `ollama.chat()` via adapter |

---

## New Env Vars

Add to `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...       # Required — get from console.anthropic.com
ANTHROPIC_MODEL=claude-haiku-4-5-20251001  # Default model
ENABLE_COMPUTER_USE=false          # Set true to route BROWSE_WEB through ComputerUseAgent
ANTHROPIC_MAX_TOKENS_SHORT=1024    # Token budget for decisions/narrations
ANTHROPIC_MAX_TOKENS_LONG=4096     # Token budget for content/reflection/ideology
```

---

## How Prompt Caching Works

Each LLM call in `AgentLoop` passes two system blocks with `cache_control: { type: 'ephemeral' }`:

1. **Identity block** — full name, bio, email, neighbours, server awareness (built by `buildIdentityPreamble`)
2. **Quirks + goals block** — persisted behavioural quirks + active goals

These blocks are identical across all calls for the same soul within a tick. Anthropic caches the KV state after the first call; subsequent calls in the same tick or across ticks (within the 5-minute TTL) pay only 10% of the input token cost for the cached portion.

The dynamic context (vitals, wallet, recent actions, directives) goes in the user message and is never cached.

**Expected savings**: ~70-80% reduction in input tokens after the second call per soul, per tick.

---

## Computer Use (BROWSE_WEB)

When `ENABLE_COMPUTER_USE=true` and a soul takes the `browse_web` action, the request is routed through `ComputerUseAgent.runComputerTask()`:

- **Bash tool** — runs whitelisted shell commands (`ls`, `cat`, `git log`, etc.)
- **Text editor tool** — view/edit files (write requires `ENABLE_CODE_WRITE=true`)
- **Computer tool** — screenshot + mouse/keyboard (requires `ENABLE_BROWSER=true` + GUI)

The agentic loop runs up to `maxSteps=10` iterations until a text response is returned.

---

## Fallback Behaviour

If `ANTHROPIC_API_KEY` is not set or the API call fails:

- `AnthropicClient.isAvailable()` returns `false` (cached 60s)
- `AgentLoop.checkLLM()` returns `false`
- Soul falls back to `HardcodedDecider` (deterministic rule-based decisions)

Legacy call sites (`LLMDecider`, `ConversationLoop`, `httpServer`) use the `OllamaAdapter` which also routes to `AnthropicClient` — they silently return `null` if the key is absent.

---

## Verification Checklist

1. `npm run typecheck` — no errors
2. Set `ANTHROPIC_API_KEY` in `.env`
3. `npm run dev` — look for `[AnthropicClient]` log lines
4. After 2nd call to same soul: `cache_read > 0` confirms caching is active
5. Every 100 ticks: `[AgentLoop] [cacheStats]` summary is printed
6. Without `ANTHROPIC_API_KEY`: `isAvailable()` → false → `hardcoded fallback` in logs
7. `ENABLE_COMPUTER_USE=true` + `ENABLE_BROWSER=true` + BROWSE_WEB action → `[ComputerUseAgent]` logs
