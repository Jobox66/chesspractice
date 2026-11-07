package store

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"chesspractice/internal/domain"
)

// Real-Postgres test, skipped unless STORE_TEST_URL is set (see
// drills_test.go). Creates and deletes its own user.
func TestGamesAgainstPostgres(t *testing.T) {
	url := os.Getenv("STORE_TEST_URL")
	if url == "" {
		t.Skip("STORE_TEST_URL not set")
	}
	ctx := context.Background()
	db := Connect(url)
	defer db.pool.Close()

	const uid = "games-test-user"
	cleanup := func() { db.pool.Exec(ctx, `DELETE FROM users WHERE token_id = $1`, uid) }
	cleanup()
	defer cleanup()
	if err := db.UpsertUser(ctx, domain.User{TokenID: uid, Username: "games_test", Email: "t@example.com"}); err != nil {
		t.Fatal(err)
	}

	games, err := db.ListGames(ctx, uid)
	if err != nil || games == nil || len(games) != 0 {
		t.Fatalf("fresh list = %#v, %v", games, err)
	}

	older := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	newer := time.Date(2026, 11, 6, 9, 0, 0, 0, time.UTC)
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(db.UpsertGame(ctx, uid, domain.SavedGame{ID: "a", Data: json.RawMessage(`{"id":"a","n":1}`), EndedAt: &older}))
	must(db.UpsertGame(ctx, uid, domain.SavedGame{ID: "b", Data: json.RawMessage(`{"id":"b"}`), EndedAt: &newer}))
	must(db.UpsertGame(ctx, uid, domain.SavedGame{ID: "c", Data: json.RawMessage(`{"id":"c"}`)})) // unfinished
	// Replace "a" (analysis added).
	must(db.UpsertGame(ctx, uid, domain.SavedGame{ID: "a", Data: json.RawMessage(`{"id":"a","n":2}`), EndedAt: &older}))

	games, err = db.ListGames(ctx, uid)
	must(err)
	if len(games) != 3 || games[0].ID != "b" || games[1].ID != "a" || games[2].ID != "c" {
		t.Fatalf("order = %v", ids(games))
	}
	var a map[string]any
	must(json.Unmarshal(games[1].Data, &a))
	if a["n"] != float64(2) || games[1].EndedAt == nil || !games[1].EndedAt.Equal(older) {
		t.Errorf("a = %s ended %v", games[1].Data, games[1].EndedAt)
	}

	must(db.DeleteGame(ctx, uid, "b"))
	must(db.DeleteGame(ctx, uid, "missing"))
	games, err = db.ListGames(ctx, uid)
	must(err)
	if len(games) != 2 {
		t.Errorf("after delete = %v", ids(games))
	}
}

func ids(gs []domain.SavedGame) []string {
	out := make([]string, len(gs))
	for i, g := range gs {
		out[i] = g.ID
	}
	return out
}
