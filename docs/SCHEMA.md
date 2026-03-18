# SQLite Schema

15 tables, applied idempotently via `IF NOT EXISTS` in `src/db/schema.ts`.

| Table | Purpose |
|-------|---------|
| `souls` | Identity, vitals, state |
| `wallets` | Per-soul balance |
| `transactions` | Wallet credit/debit history |
| `reward_history` | Per-tick reward scores |
| `quirks` | Reinforced behaviours (seed→persist lifecycle) |
| `browser_sessions` | Playwright session state |
| `world_log` | Classified events log |
| `world_milestones` | Notable world events |
| `soul_memory` | LLM-accessible memory per soul |
| `directives` | Visitor-submitted directives |
| `soul_positions` | 3D coordinates for Three.js |
| `ghost_posts` | Published Ghost blog records |
| `social_posts` | Twitter/Reddit post records |
| `stripe_accounts` | Stripe Connect account refs |
| `sqlite_sequence` | SQLite internal |
