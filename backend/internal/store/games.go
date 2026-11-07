package store

import (
	"context"
	"time"

	"chesspractice/internal/domain"
)

// GameListLimit caps how many games ListGames returns (newest first).
const GameListLimit = 500

// ListGames returns the user's saved games, most recently finished first.
func (db *DB) ListGames(ctx context.Context, userID string) ([]domain.SavedGame, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, data, ended_at FROM games
		WHERE user_id = $1
		ORDER BY ended_at DESC NULLS LAST, updated_at DESC
		LIMIT $2
	`, userID, GameListLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	games := []domain.SavedGame{}
	for rows.Next() {
		var g domain.SavedGame
		var data []byte
		if err := rows.Scan(&g.ID, &data, &g.EndedAt); err != nil {
			return nil, err
		}
		g.Data = data
		games = append(games, g)
	}
	return games, rows.Err()
}

// UpsertGame stores (or replaces) one game.
func (db *DB) UpsertGame(ctx context.Context, userID string, g domain.SavedGame) error {
	var ended *time.Time
	if g.EndedAt != nil {
		t := g.EndedAt.UTC()
		ended = &t
	}
	_, err := db.pool.Exec(ctx, `
		INSERT INTO games (user_id, id, data, ended_at, updated_at)
		VALUES ($1, $2, $3::jsonb, $4, now())
		ON CONFLICT (user_id, id) DO UPDATE SET
			data = EXCLUDED.data,
			ended_at = EXCLUDED.ended_at,
			updated_at = now()
	`, userID, g.ID, []byte(g.Data), ended)
	return err
}

// DeleteGame removes one game; deleting a missing game is not an error.
func (db *DB) DeleteGame(ctx context.Context, userID, id string) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM games WHERE user_id = $1 AND id = $2`, userID, id)
	return err
}
