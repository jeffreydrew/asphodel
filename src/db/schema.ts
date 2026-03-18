import type Database from 'better-sqlite3';

export function applySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS souls (
      id              TEXT    PRIMARY KEY,
      name            TEXT    NOT NULL,
      email           TEXT    NOT NULL UNIQUE,
      identity        TEXT    NOT NULL,  -- JSON SoulIdentity
      vitals          TEXT    NOT NULL,  -- JSON SoulVitals
      reward_weights  TEXT    NOT NULL,  -- JSON RewardWeights
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      INTEGER NOT NULL  -- Unix ms
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id               TEXT    PRIMARY KEY,
      soul_id          TEXT    NOT NULL UNIQUE,
      balance_abstract REAL    NOT NULL DEFAULT 0.0,
      balance_real     REAL    NOT NULL DEFAULT 0.0,
      currency         TEXT    NOT NULL DEFAULT 'USD',
      lifetime_earned  REAL    NOT NULL DEFAULT 0.0,
      lifetime_spent   REAL    NOT NULL DEFAULT 0.0,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id       TEXT    PRIMARY KEY,
      soul_id  TEXT    NOT NULL,
      type     TEXT    NOT NULL,  -- 'earned' | 'spent'
      source   TEXT    NOT NULL,
      amount   REAL    NOT NULL,
      ts       INTEGER NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS reward_history (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      soul_id            TEXT    NOT NULL,
      tick               INTEGER NOT NULL,
      r_profit           REAL    NOT NULL DEFAULT 0.0,
      r_social           REAL    NOT NULL DEFAULT 0.0,
      r_health           REAL    NOT NULL DEFAULT 0.0,
      r_penalty          REAL    NOT NULL DEFAULT 0.0,
      r_total            REAL    NOT NULL DEFAULT 0.0,
      action_that_caused TEXT    NOT NULL,
      quirk_delta        TEXT,           -- JSON Record<string,number> | null
      ts                 INTEGER NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS quirks (
      id                  TEXT    PRIMARY KEY,
      soul_id             TEXT    NOT NULL,
      quirk_id            TEXT    NOT NULL,
      trigger             TEXT    NOT NULL,
      strength            REAL    NOT NULL DEFAULT 0.0,
      reinforcement_count INTEGER NOT NULL DEFAULT 0,
      seeded              INTEGER NOT NULL DEFAULT 0,  -- boolean
      persisted           INTEGER NOT NULL DEFAULT 0,  -- boolean
      created_at          INTEGER NOT NULL,
      UNIQUE (soul_id, quirk_id),
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS browser_sessions (
      id                   TEXT    PRIMARY KEY,
      soul_id              TEXT    NOT NULL,
      platform             TEXT    NOT NULL,
      session_cookie       TEXT,
      last_active          INTEGER,
      tasks_completed      INTEGER NOT NULL DEFAULT 0,
      abstract_earned_here REAL    NOT NULL DEFAULT 0.0,
      status               TEXT    NOT NULL DEFAULT 'active',
      UNIQUE (soul_id, platform),
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS world_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      soul_id      TEXT,
      significance TEXT    NOT NULL,
      action       TEXT    NOT NULL,
      description  TEXT    NOT NULL,
      metadata     TEXT,           -- JSON | null
      ts           INTEGER NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE INDEX IF NOT EXISTS idx_world_log_significance ON world_log(significance);
    CREATE INDEX IF NOT EXISTS idx_world_log_ts           ON world_log(ts);

    CREATE TABLE IF NOT EXISTS soul_memory (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      soul_id    TEXT    NOT NULL,
      type       TEXT    NOT NULL,  -- 'reflection' | 'content' | 'social'
      content    TEXT    NOT NULL,
      metadata   TEXT,              -- JSON | null
      ts         INTEGER NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE INDEX IF NOT EXISTS idx_soul_memory_soul_id ON soul_memory(soul_id, ts);

    CREATE TABLE IF NOT EXISTS directives (
      id          TEXT    PRIMARY KEY,
      soul_id     TEXT    NOT NULL,
      visitor_id  TEXT    NOT NULL DEFAULT 'visitor',
      message     TEXT    NOT NULL,
      injected    INTEGER NOT NULL DEFAULT 0,
      ts          INTEGER NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE INDEX IF NOT EXISTS idx_directives_soul_id ON directives(soul_id, injected);

    CREATE TABLE IF NOT EXISTS soul_positions (
      soul_id     TEXT    PRIMARY KEY,
      x           REAL    NOT NULL DEFAULT 0,
      y           REAL    NOT NULL DEFAULT 0,
      z           REAL    NOT NULL DEFAULT 0,
      updated_at  INTEGER NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS ghost_posts (
      id           TEXT    PRIMARY KEY,
      soul_id      TEXT    NOT NULL,
      ghost_post_id TEXT,
      title        TEXT    NOT NULL,
      url          TEXT,
      ts           INTEGER NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS social_posts (
      id          TEXT    PRIMARY KEY,
      soul_id     TEXT    NOT NULL,
      platform    TEXT    NOT NULL,
      external_id TEXT,
      content     TEXT    NOT NULL,
      ts          INTEGER NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS stripe_accounts (
      soul_id           TEXT    PRIMARY KEY,
      stripe_account_id TEXT    NOT NULL,
      status            TEXT    NOT NULL DEFAULT 'pending',
      created_at        INTEGER NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS world_milestones (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      soul_id     TEXT,
      title       TEXT    NOT NULL,
      description TEXT    NOT NULL,
      ts          INTEGER NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS library_works (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      soul_id  TEXT    NOT NULL,
      type     TEXT    NOT NULL,  -- 'writing' | 'art' | 'research'
      title    TEXT    NOT NULL,
      content  TEXT    NOT NULL,
      metadata TEXT,              -- JSON | null
      ts       INTEGER NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE INDEX IF NOT EXISTS idx_library_works_soul_id ON library_works(soul_id, ts);
    CREATE INDEX IF NOT EXISTS idx_library_works_type    ON library_works(type, ts);
  `);
}
