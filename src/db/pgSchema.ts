import type { Pool } from 'pg';

export async function applySchema(pool: Pool): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS souls (
      id              TEXT      PRIMARY KEY,
      name            TEXT      NOT NULL,
      email           TEXT      NOT NULL UNIQUE,
      identity        JSONB     NOT NULL,
      vitals          JSONB     NOT NULL,
      reward_weights  JSONB     NOT NULL,
      is_active       BOOLEAN   NOT NULL DEFAULT TRUE,
      created_at      BIGINT    NOT NULL
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
      type     TEXT    NOT NULL,
      source   TEXT    NOT NULL,
      amount   REAL    NOT NULL,
      ts       BIGINT  NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS reward_history (
      id                 BIGSERIAL PRIMARY KEY,
      soul_id            TEXT      NOT NULL,
      tick               INTEGER   NOT NULL,
      r_profit           REAL      NOT NULL DEFAULT 0.0,
      r_social           REAL      NOT NULL DEFAULT 0.0,
      r_health           REAL      NOT NULL DEFAULT 0.0,
      r_penalty          REAL      NOT NULL DEFAULT 0.0,
      r_total            REAL      NOT NULL DEFAULT 0.0,
      action_that_caused TEXT      NOT NULL,
      quirk_delta        JSONB,
      ts                 BIGINT    NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS quirks (
      id                  TEXT    PRIMARY KEY,
      soul_id             TEXT    NOT NULL,
      quirk_id            TEXT    NOT NULL,
      trigger             TEXT    NOT NULL,
      strength            REAL    NOT NULL DEFAULT 0.0,
      reinforcement_count INTEGER NOT NULL DEFAULT 0,
      seeded              BOOLEAN NOT NULL DEFAULT FALSE,
      persisted           BOOLEAN NOT NULL DEFAULT FALSE,
      created_at          BIGINT  NOT NULL,
      UNIQUE (soul_id, quirk_id),
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS browser_sessions (
      id                   TEXT    PRIMARY KEY,
      soul_id              TEXT    NOT NULL,
      platform             TEXT    NOT NULL,
      session_cookie       TEXT,
      last_active          BIGINT,
      tasks_completed      INTEGER NOT NULL DEFAULT 0,
      abstract_earned_here REAL    NOT NULL DEFAULT 0.0,
      status               TEXT    NOT NULL DEFAULT 'active',
      UNIQUE (soul_id, platform),
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS world_log (
      id           BIGSERIAL PRIMARY KEY,
      soul_id      TEXT,
      significance TEXT      NOT NULL,
      action       TEXT      NOT NULL,
      description  TEXT      NOT NULL,
      metadata     JSONB,
      ts           BIGINT    NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE INDEX IF NOT EXISTS idx_world_log_significance ON world_log(significance);
    CREATE INDEX IF NOT EXISTS idx_world_log_ts           ON world_log(ts);

    CREATE TABLE IF NOT EXISTS soul_memory (
      id        BIGSERIAL       PRIMARY KEY,
      soul_id   TEXT            NOT NULL,
      type      TEXT            NOT NULL,
      content   TEXT            NOT NULL,
      metadata  JSONB,
      ts        BIGINT          NOT NULL,
      embedding vector(768),
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE INDEX IF NOT EXISTS idx_soul_memory_soul_id ON soul_memory(soul_id, ts);

    CREATE TABLE IF NOT EXISTS directives (
      id          TEXT    PRIMARY KEY,
      soul_id     TEXT    NOT NULL,
      visitor_id  TEXT    NOT NULL DEFAULT 'visitor',
      message     TEXT    NOT NULL,
      injected    BOOLEAN NOT NULL DEFAULT FALSE,
      ts          BIGINT  NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE INDEX IF NOT EXISTS idx_directives_soul_id ON directives(soul_id, injected);

    CREATE TABLE IF NOT EXISTS soul_positions (
      soul_id     TEXT   PRIMARY KEY,
      x           REAL   NOT NULL DEFAULT 0,
      y           REAL   NOT NULL DEFAULT 0,
      z           REAL   NOT NULL DEFAULT 0,
      updated_at  BIGINT NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS ghost_posts (
      id            TEXT   PRIMARY KEY,
      soul_id       TEXT   NOT NULL,
      ghost_post_id TEXT,
      title         TEXT   NOT NULL,
      url           TEXT,
      ts            BIGINT NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS social_posts (
      id          TEXT   PRIMARY KEY,
      soul_id     TEXT   NOT NULL,
      platform    TEXT   NOT NULL,
      external_id TEXT,
      content     TEXT   NOT NULL,
      ts          BIGINT NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS stripe_accounts (
      soul_id           TEXT   PRIMARY KEY,
      stripe_account_id TEXT   NOT NULL,
      status            TEXT   NOT NULL DEFAULT 'pending',
      created_at        BIGINT NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS world_milestones (
      id          BIGSERIAL PRIMARY KEY,
      soul_id     TEXT,
      title       TEXT      NOT NULL,
      description TEXT      NOT NULL,
      ts          BIGINT    NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS library_works (
      id       BIGSERIAL PRIMARY KEY,
      soul_id  TEXT      NOT NULL,
      type     TEXT      NOT NULL,
      title    TEXT      NOT NULL,
      content  TEXT      NOT NULL,
      metadata JSONB,
      ts       BIGINT    NOT NULL,
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE INDEX IF NOT EXISTS idx_library_works_soul_id ON library_works(soul_id, ts);
    CREATE INDEX IF NOT EXISTS idx_library_works_type    ON library_works(type, ts);

    CREATE TABLE IF NOT EXISTS soul_goals (
      id             TEXT    PRIMARY KEY,
      soul_id        TEXT    NOT NULL,
      goal_text      TEXT    NOT NULL,
      formed_at      BIGINT  NOT NULL,
      priority       INTEGER NOT NULL DEFAULT 1,
      sub_goals      JSONB,
      progress_notes JSONB,
      status         TEXT    NOT NULL DEFAULT 'active',
      FOREIGN KEY (soul_id) REFERENCES souls(id)
    );

    CREATE INDEX IF NOT EXISTS idx_soul_goals_soul_id ON soul_goals(soul_id, status);

    CREATE TABLE IF NOT EXISTS action_registry (
      id               TEXT    PRIMARY KEY,
      label            TEXT    NOT NULL UNIQUE,
      description      TEXT    NOT NULL,
      vitals_effect    JSONB   NOT NULL DEFAULT '{}',
      profit_delta     REAL    NOT NULL DEFAULT 0,
      social_delta     REAL    NOT NULL DEFAULT 0,
      prerequisites    JSONB,
      created_by       TEXT    NOT NULL,
      is_collaborative BOOLEAN NOT NULL DEFAULT FALSE,
      min_participants INTEGER NOT NULL DEFAULT 1,
      max_participants INTEGER NOT NULL DEFAULT 1,
      created_at       BIGINT  NOT NULL
    );

    CREATE TABLE IF NOT EXISTS world_objects (
      id            TEXT    PRIMARY KEY,
      type          TEXT    NOT NULL,
      label         TEXT    NOT NULL,
      owner_soul_id TEXT,
      floor         INTEGER NOT NULL DEFAULT 0,
      position_x    REAL    NOT NULL DEFAULT 0,
      position_y    REAL    NOT NULL DEFAULT 0,
      position_z    REAL    NOT NULL DEFAULT 0,
      properties    JSONB,
      created_by    TEXT    NOT NULL,
      created_at    BIGINT  NOT NULL,
      FOREIGN KEY (owner_soul_id) REFERENCES souls(id),
      FOREIGN KEY (created_by)    REFERENCES souls(id)
    );

    CREATE INDEX IF NOT EXISTS idx_world_objects_floor ON world_objects(floor);

    CREATE TABLE IF NOT EXISTS joint_ventures (
      id           TEXT    PRIMARY KEY,
      initiator_id TEXT    NOT NULL,
      partner_id   TEXT    NOT NULL,
      action_label TEXT    NOT NULL,
      description  TEXT    NOT NULL,
      reward_split JSONB   NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'negotiating',
      created_at   BIGINT  NOT NULL,
      completed_at BIGINT,
      FOREIGN KEY (initiator_id) REFERENCES souls(id),
      FOREIGN KEY (partner_id)   REFERENCES souls(id)
    );

    CREATE TABLE IF NOT EXISTS venture_proposals (
      id           TEXT   PRIMARY KEY,
      venture_id   TEXT   NOT NULL,
      from_soul_id TEXT   NOT NULL,
      to_soul_id   TEXT   NOT NULL,
      message      TEXT   NOT NULL,
      response     TEXT,
      counter_text TEXT,
      ts           BIGINT NOT NULL,
      FOREIGN KEY (venture_id)    REFERENCES joint_ventures(id),
      FOREIGN KEY (from_soul_id)  REFERENCES souls(id),
      FOREIGN KEY (to_soul_id)    REFERENCES souls(id)
    );
  `);
}
