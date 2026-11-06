-- Puzzle / endgame progress ("drills"). Safe to run more than once.
-- Apply to an existing database (e.g. Neon SQL Editor) before deploying the
-- backend version that serves /drills. Fresh databases get these tables from
-- schema.sql.

CREATE TABLE IF NOT EXISTS drill_ratings (
    user_id TEXT NOT NULL REFERENCES users (token_id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    rating DOUBLE PRECISION NOT NULL,
    rd DOUBLE PRECISION NOT NULL,
    games INT NOT NULL,
    PRIMARY KEY (user_id, kind)
);

CREATE TABLE IF NOT EXISTS drill_progress (
    user_id TEXT NOT NULL REFERENCES users (token_id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    item_id TEXT NOT NULL,
    attempts INT NOT NULL,
    successes INT NOT NULL,
    last_success BOOL NOT NULL,
    -- FSRS card computed by the client; NULL until the item needs review.
    card JSONB,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, kind, item_id)
);

CREATE TABLE IF NOT EXISTS drill_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (token_id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    item_id TEXT NOT NULL,
    success BOOL NOT NULL,
    -- rating after this attempt; NULL for unrated attempts (reviews)
    rating_after DOUBLE PRECISION,
    duration_ms INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drill_attempts_user ON drill_attempts (user_id, kind, id);
