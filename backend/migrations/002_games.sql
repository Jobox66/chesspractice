-- Saved practice games (Play tab), with their engine analysis. Safe to run
-- more than once. Apply to an existing database (Neon SQL Editor) before
-- deploying the backend that serves /games; schema.sql has it for new ones.

CREATE TABLE IF NOT EXISTS games (
    user_id TEXT NOT NULL REFERENCES users (token_id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    -- the client's game document: moves, colour, engine level, result, analysis
    data JSONB NOT NULL,
    ended_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS games_user_ended ON games (user_id, ended_at DESC);
