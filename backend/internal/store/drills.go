package store

import (
	"context"
	"encoding/json"
	"errors"

	"chesspractice/internal/domain"
	"github.com/jackc/pgx/v5"
)

// DrillHistoryLimit caps how many recent attempts FetchDrillState returns:
// enough for the rating chart and today's counters without shipping years
// of history on every page load.
const DrillHistoryLimit = 1000

// FetchDrillState returns a user's rating, per-item progress and recent
// attempts for one drill kind. A user who never played gets a nil rating
// and empty slices.
func (db *DB) FetchDrillState(ctx context.Context, userID, kind string) (domain.DrillState, error) {
	state := domain.DrillState{Progress: []domain.DrillProgress{}, Attempts: []domain.DrillAttemptLog{}}

	var r domain.DrillRating
	err := db.pool.QueryRow(ctx, `
		SELECT rating, rd, games FROM drill_ratings
		WHERE user_id = $1 AND kind = $2
	`, userID, kind).Scan(&r.Rating, &r.RD, &r.Games)
	switch {
	case err == nil:
		state.Rating = &r
	case !errors.Is(err, pgx.ErrNoRows):
		return state, err
	}

	rows, err := db.pool.Query(ctx, `
		SELECT item_id, attempts, successes, last_success, card, updated_at
		FROM drill_progress
		WHERE user_id = $1 AND kind = $2
	`, userID, kind)
	if err != nil {
		return state, err
	}
	for rows.Next() {
		var p domain.DrillProgress
		var card []byte
		if err := rows.Scan(&p.ItemID, &p.Attempts, &p.Successes, &p.LastSuccess, &card, &p.UpdatedAt); err != nil {
			rows.Close()
			return state, err
		}
		if card != nil {
			p.Card = json.RawMessage(card)
		}
		state.Progress = append(state.Progress, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return state, err
	}

	// Newest N, returned oldest first so the client can plot them as is.
	rows, err = db.pool.Query(ctx, `
		SELECT item_id, success, rating_after, duration_ms, created_at FROM (
			SELECT item_id, success, rating_after, duration_ms, created_at, id
			FROM drill_attempts
			WHERE user_id = $1 AND kind = $2
			ORDER BY id DESC
			LIMIT $3
		) recent
		ORDER BY id
	`, userID, kind, DrillHistoryLimit)
	if err != nil {
		return state, err
	}
	defer rows.Close()
	for rows.Next() {
		var a domain.DrillAttemptLog
		if err := rows.Scan(&a.ItemID, &a.Success, &a.RatingAfter, &a.DurationMs, &a.At); err != nil {
			return state, err
		}
		state.Attempts = append(state.Attempts, a)
	}
	return state, rows.Err()
}

// RecordDrillAttempt stores one result atomically: the attempt log row,
// the item's progress, and (for rated attempts) the user's new rating.
func (db *DB) RecordDrillAttempt(ctx context.Context, userID, kind string, a domain.DrillAttempt) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var ratingAfter *float64
	if a.Rating != nil {
		ratingAfter = &a.Rating.Rating
		if _, err := tx.Exec(ctx, `
			INSERT INTO drill_ratings (user_id, kind, rating, rd, games)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (user_id, kind) DO UPDATE SET
				rating = EXCLUDED.rating, rd = EXCLUDED.rd, games = EXCLUDED.games
		`, userID, kind, a.Rating.Rating, a.Rating.RD, a.Rating.Games); err != nil {
			return err
		}
	}

	// A nil card keeps whatever is stored (COALESCE), so the client only
	// sends one when the schedule actually changed.
	var card []byte
	if len(a.Card) > 0 && string(a.Card) != "null" {
		card = a.Card
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO drill_progress (user_id, kind, item_id, attempts, successes, last_success, card, updated_at)
		VALUES ($1, $2, $3, 1, CASE WHEN $4 THEN 1 ELSE 0 END, $4, $5::jsonb, now())
		ON CONFLICT (user_id, kind, item_id) DO UPDATE SET
			attempts = drill_progress.attempts + 1,
			successes = drill_progress.successes + CASE WHEN $4 THEN 1 ELSE 0 END,
			last_success = $4,
			card = COALESCE($5::jsonb, drill_progress.card),
			updated_at = now()
	`, userID, kind, a.ItemID, a.Success, card); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO drill_attempts (user_id, kind, item_id, success, rating_after, duration_ms)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, userID, kind, a.ItemID, a.Success, ratingAfter, a.DurationMs); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
