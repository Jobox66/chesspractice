package store

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"chesspractice/internal/domain"
)

// Runs against a real Postgres when STORE_TEST_URL points at a scratch
// database with schema.sql applied, e.g.
//
//	STORE_TEST_URL=postgres://dev@localhost:5499/chesspractice go test ./internal/store/
//
// Skipped otherwise (CI has no database). The test creates and deletes its
// own user, so it is safe on a dev database but never point it at prod.
func TestDrillsAgainstPostgres(t *testing.T) {
	url := os.Getenv("STORE_TEST_URL")
	if url == "" {
		t.Skip("STORE_TEST_URL not set")
	}
	ctx := context.Background()
	db := Connect(url)
	defer db.pool.Close()

	const uid = "drills-test-user"
	cleanup := func() { db.pool.Exec(ctx, `DELETE FROM users WHERE token_id = $1`, uid) }
	cleanup()
	defer cleanup()
	if err := db.UpsertUser(ctx, domain.User{TokenID: uid, Username: "drills_test", Email: "t@example.com"}); err != nil {
		t.Fatal(err)
	}

	st, err := db.FetchDrillState(ctx, uid, domain.DrillKindPuzzle)
	if err != nil {
		t.Fatal(err)
	}
	if st.Rating != nil || len(st.Progress) != 0 || len(st.Attempts) != 0 {
		t.Fatalf("fresh state = %#v", st)
	}

	card := json.RawMessage(`{"due":"2026-11-07T00:00:00.000Z","reps":1,"state":1}`)
	steps := []domain.DrillAttempt{
		{ItemID: "aB3x9", Success: false, DurationMs: 30000, Card: card, Rating: &domain.DrillRating{Rating: 1450, RD: 300, Games: 1}},
		{ItemID: "aB3x9", Success: true, DurationMs: 8000},
		{ItemID: "Zz001", Success: true, DurationMs: 12000, Card: json.RawMessage("null"), Rating: &domain.DrillRating{Rating: 1490, RD: 280, Games: 2}},
	}
	for _, a := range steps {
		if err := db.RecordDrillAttempt(ctx, uid, domain.DrillKindPuzzle, a); err != nil {
			t.Fatal(err)
		}
	}

	st, err = db.FetchDrillState(ctx, uid, domain.DrillKindPuzzle)
	if err != nil {
		t.Fatal(err)
	}
	if st.Rating == nil || st.Rating.Rating != 1490 || st.Rating.Games != 2 {
		t.Errorf("rating = %#v", st.Rating)
	}
	byID := map[string]domain.DrillProgress{}
	for _, p := range st.Progress {
		byID[p.ItemID] = p
	}
	a := byID["aB3x9"]
	if a.Attempts != 2 || a.Successes != 1 || !a.LastSuccess {
		t.Errorf("aB3x9 = %#v", a)
	}
	var c map[string]any
	if err := json.Unmarshal(a.Card, &c); err != nil || c["reps"] != float64(1) {
		t.Errorf("card kept through a nil update? %s (%v)", a.Card, err)
	}
	if z := byID["Zz001"]; z.Attempts != 1 || z.Card != nil {
		t.Errorf("Zz001 = %#v card=%s", z, z.Card)
	}
	if len(st.Attempts) != 3 {
		t.Fatalf("attempts = %#v", st.Attempts)
	}
	if st.Attempts[0].ItemID != "aB3x9" || st.Attempts[0].RatingAfter == nil || *st.Attempts[0].RatingAfter != 1450 {
		t.Errorf("first attempt = %#v", st.Attempts[0])
	}
	if st.Attempts[1].RatingAfter != nil || st.Attempts[2].ItemID != "Zz001" {
		t.Errorf("order/rating_after wrong: %#v", st.Attempts)
	}

	other, err := db.FetchDrillState(ctx, uid, domain.DrillKindEndgame)
	if err != nil || len(other.Progress) != 0 || other.Rating != nil {
		t.Errorf("endgame state = %#v err=%v", other, err)
	}
}
