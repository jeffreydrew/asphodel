ASPHODEL — Spec v2.0
Real-Time Autonomous Agents with RL + Browser Use

Core Design Shift
The souls are no longer simulated characters — they are fully autonomous agents with a persistent identity, a reward signal, real browser access, and the goal of maximizing a composite reward function. The Three.js tower is their home screen. The internet is their workspace.
Abstract money now means every financial action is tracked in the DB as simulated balance — but the entire architecture (wallet model, transaction log, earning/spending flows) is built real-money-ready. Flipping to real money later means plugging in a Stripe Connect or Wise account, not rewiring the system.

The Reward Function
This is the heart of the system. Every action a soul takes produces an observation, which is scored and fed back as a reward signal that shapes future decisions.
R(t) = w₁·ΔProfit(t) + w₂·ΔSocialWelfare(t) + w₃·ΔHealth(t) − Penalty(t)

Default weights:
  w₁ = 0.40   (profit motive — strong but not dominant)
  w₂ = 0.35   (social welfare — relationships, community acts, helping others)
  w₃ = 0.25   (health — fitness, sleep, hunger, mental state)

Penalty(t) = harm_to_others + deception_detected + tos_violation_flagged
What scores positively:
ActionReward sourceEarns abstract income+ΔProfit scaled by effortCompletes a microjob+Profit +PurposePublishes a blog post with engagement+Profit +SocialHelps another soul (shares info, teaches skill)+Social large bonusExercises in gym+HealthEats when hungry+HealthForms a lasting friendship+Social sustainedCreates something used by others+Social +PurposeSleeps/rests appropriately+Health
What scores negatively (Penalty):
ActionWhy penalizedDeceptive content detectedAgainst agent charterToS violation flaggedPlatform ban riskIgnores hunger/sleep too longHealth collapseSocial isolation > N ticksSocial welfare decayProfit at cost of another soul's welfareExploitative behavior
The tension is the game. A soul with high profit weight will grind microjobs and neglect health. One with high social weight will help everyone but earn nothing. Over time they develop quirks — persistent behavioral biases that emerge from reward history. A soul that was rewarded 20 times for writing develops a writer quirk that boosts creation probability. One that was punished for social isolation starts initiating meetings unprompted.

Quirk System
Quirks are earned behavioral modifiers that accumulate over time. They're not assigned — they emerge.
json"quirks": [
  { "id": "night_owl", "trigger": "productivity peaks after sim-hour 20", "strength": 0.7 },
  { "id": "compulsive_helper", "trigger": "responds to any soul in distress within 2 ticks", "strength": 0.9 },
  { "id": "marketplace_hustler", "trigger": "checks job boards every 3 ticks regardless of goals", "strength": 0.6 },
  { "id": "recluse", "trigger": "avoids meeting actions when happiness < 40", "strength": 0.5 }
]
```

**How quirks form:** If a soul takes the same category of action 5+ times and gets rewarded, a quirk seed is planted. After 15 reinforced repetitions, it becomes a persistent modifier injected into the decision prompt. The LLM then treats it as part of the soul's identity, not as an instruction.

**How quirks are described to the LLM:**
```
Your known tendencies (earned over time):
- You tend to work late — your best ideas come at night [strength: high]
- You instinctively check for new gig opportunities when idle [strength: medium]
```

---

## Browser Agent Architecture

Each soul gets a **persistent Playwright browser context** — its own cookies, session storage, browsing history. This is what allows them to maintain platform logins and remember where they left off.
```
Soul ──→ LLM decides: "search for data entry jobs on Indeed"
             ↓
        BrowserAgent.execute({
          soul_id: "mira",
          task: "search_jobs",
          query: "data entry remote no experience",
          platform: "indeed"
        })
             ↓
        Playwright opens indeed.com in Mira's context
        Scrapes job listings → returns structured JSON
             ↓
        LLM reads results → decides: "apply to JobID #4421"
             ↓
        BrowserAgent fills form with Mira's profile data
        Submits → logs outcome → reward delta computed
Abstract money phase: When a job would pay $X, the soul's abstract wallet increases by $X. The browser action is real (searching, reading, filling forms) but no real payment is received. When you flip to real money, you swap the wallet write for a Stripe/Wise transfer.
Platform targets for v1:
PlatformActionAbstract earningAmazon Mechanical TurkFind HITs, complete tasksPer-HIT rateClickworker / RemotasksMicrojob signup and task completionPer-task rateeBayList items (soul's "inventory"), browse dealsSale priceCraigslistPost services (writing, data work)Posted rateFiverrCreate gig, respond to inquiriesGig priceTwitter/XPost as soul, grow followingSimulated brand valueRedditParticipate in communities, build karmaSocial welfare score

Soul Identity Package
Each soul needs a coherent real-world identity for the platform phase. Built once, used by the browser agent everywhere.
json"identity": {
  "full_name": "Mira Osei",
  "email": "mira.osei.asphodel@proton.me",
  "username_pool": { "twitter": "mira_osei_writes", "reddit": "u/mira_asphodel" },
  "bio": "Freelance writer and curious human. I write about what I notice.",
  "skills_public": ["copywriting", "data entry", "research"],
  "portfolio_url": "https://mira.asphodel.world",
  "location_public": "Remote",
  "profile_photo": "mira_avatar_realistic.jpg",
  "payment_method": "abstract_wallet | stripe_connect_id (phase 2)"
}
```

Email addresses are real ProtonMail accounts you create once. Profile photos can be AI-generated realistic portraits (thispersondoesnotexist.com or Midjourney). Portfolio links to the Ghost blog that auto-publishes their creations.

---

## Real-Time Loop (not tick-based)

The previous spec used a 30s tick. Real-time agents need a different model:
```
Per soul: continuous async event loop (not clock-driven)

while soul.is_active:
    state = soul.observe()           # read vitals, memory, world state
    reward = engine.score(state)     # compute R(t)
    action = llm.decide(state, reward)   # LLM picks next action
    result = executor.run(action)    # browser / world / social
    soul.update(result)              # update memory, vitals, wallet
    soul.sleep(cooldown)             # 60–300s depending on action type
```

**Cooldown by action type** (prevents LLM cost explosion):

| Action type | Cooldown after |
|---|---|
| Browsing / job search | 120s |
| Form submission / application | 300s |
| Social post | 600s |
| Meeting another soul | 180s |
| Rest / eat / exercise | 60s |
| Creation (writing, making) | 900s |

**At 5 souls with mixed cooldowns:** roughly 80–150 LLM calls/day. Well within the 200/day budget at zero cost.

---

## World Log & Significant Event System

Every action produces a log entry. The system classifies significance:
```
ROUTINE   — soul moved to kitchen, soul rested
NOTABLE   — soul completed a microjob, souls met
SIGNIFICANT — soul earned first income, soul published blog post,
              soul formed first friendship, soul developed new quirk,
              soul's wallet crossed $100 abstract, world milestone
Significant events are:

Pinned in the Three.js HUD with a "breaking news" style flash
Stored permanently in world_milestones table
Optionally tweeted by the world's own @asphodel_tower account


Data Models (updated)
Wallet
json{
  "soul_id": "uuid",
  "balance_abstract": 247.50,
  "balance_real": 0.00,
  "currency": "USD",
  "transactions": [
    { "type": "earned", "source": "mturk_hit_id_4421", "amount": 0.45, "ts": "..." },
    { "type": "spent",  "target": "ebay_listing_fee",  "amount": 0.30, "ts": "..." }
  ],
  "lifetime_earned": 312.80,
  "lifetime_spent": 65.30
}
RewardHistory
json{
  "soul_id": "uuid",
  "tick": 4821,
  "r_profit": 0.18,
  "r_social": 0.42,
  "r_health": -0.15,
  "r_penalty": 0.00,
  "r_total": 0.45,
  "action_that_caused": "helped_dev_with_writing",
  "quirk_delta": { "compulsive_helper": +0.03 }
}
BrowserSession
json{
  "soul_id": "uuid",
  "platform": "mturk",
  "session_cookie": "...",
  "last_active": "...",
  "tasks_completed": 14,
  "abstract_earned_here": 6.30,
  "status": "active | suspended | banned"
}

Revised Stack
ComponentTechnologyWhyAgent runtimeNode.js async loop per soulNon-blocking, 5 parallel agentsBrowser automationPlaywright (persistent contexts)Real browser, real sessionsLLMOllama + Qwen2.5:7b on Hetzner~60 tokens/sec CPU, freeWeb searchSerper.dev2,500 free/mo, Google resultsReward enginePure JS scoring moduleFast, no ML needed for reward calcPersistenceSQLite + better-sqlite3Lightweight, file-based, survives rebootsWorld stateIn-memory + periodic SQLite flushFast reads for WebSocket broadcast3D viewerThree.js + GLTFLoader.glb assets, isometric camAdmin panelExpress + simple HTMLSoul editor, budget controls, kill switchReal-world blogGhost (self-hosted)Souls auto-publish via Ghost Admin APISocial postingTwitter API v2 + Reddit APIPosts as soul identityProcess managerPM2Keeps 5 soul loops + server alive 24/7

Revised Budget
ItemServiceCost/moWorld server + appHetzner CX32 (4 vCPU, 8GB)€8.21 (~$9)LLM server (Ollama)Hetzner CPX41 (8 vCPU, 16GB)€14.99 (~$17)Domainasphodel.world via Namecheap~$2Web searchSerper.dev free tier$03D modelsPoly Haven / Sketchfab CC0$0Ghost blog (5 souls)Self-hosted on app server$0Social APIsTwitter free + Reddit free$0ProtonMail (5 addresses)Proton free tier$0Total~$28/month
$72/month headroom. GPU upgrade (Hetzner GPU server ~€70) available whenever LLM speed becomes a bottleneck. At current call volume, CPU is fast enough.

Implementation Order (revised)
Phase 1 — Agent skeleton

Soul data model + SQLite schema (wallets, reward history, quirks, browser sessions)
Single agent loop for one soul (no LLM yet — hardcoded decisions)
Reward engine scoring module
World log + significant event classifier
WebSocket server broadcasting live state

Phase 2 — LLM brain + reward loop
6. Ollama integration, all 4 prompt types
7. Reward delta fed back into next decision prompt
8. Quirk seeding + reinforcement logic
9. All 5 souls running parallel async loops
Phase 3 — Browser agent
10. Playwright setup, persistent contexts per soul
11. Job search tool (Indeed/Craigslist scraping)
12. Form-filling abstraction layer
13. Abstract wallet transactions on task completion
14. eBay listing + browsing tool
Phase 4 — Three.js world
15. Asphodel tower scene (Luke-sim isometric aesthetic)
16. Soul avatars with nametags, live position lerp
17. HUD: world clock, reward bars, wallet balances, world log
18. Soul click → full Soul Panel (vitals, quirks, reward history, wallet)
19. Visitor chat → directive injection
Phase 5 — Real-world presence
20. Ghost blog auto-publish pipeline
21. Twitter/Reddit posting as soul identities
22. @asphodel_tower world account for milestone announcements
23. Real money pathway (Stripe Connect swap-in)
