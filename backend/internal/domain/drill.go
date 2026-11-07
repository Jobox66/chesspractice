package domain

import (
	"encoding/json"
	"time"
)

// Drills are the practice modes outside the opening repertoire: tactics
// puzzles, (later) endgame positions, and the user's own mistakes from
// analysed games. Puzzle and endgame items ship with the frontend as static
// data; mistake items are derived on the client from the saved games. The
// server only keeps each user's progress.
// Scheduling (FSRS) and rating maths run on the client, like the
// repertoire's training cards — the server stores what it is sent.
const (
	DrillKindPuzzle  = "puzzle"
	DrillKindEndgame = "endgame"
	DrillKindMistake = "mistake"
)

// IsDrillKind reports whether kind is one the server accepts.
func IsDrillKind(kind string) bool {
	return kind == DrillKindPuzzle || kind == DrillKindEndgame || kind == DrillKindMistake
}

// DrillRating is a user's Glicko rating for one drill kind.
type DrillRating struct {
	Rating float64 `json:"rating"`
	RD     float64 `json:"rd"`
	Games  int     `json:"games"`
}

// DrillProgress is a user's record for one item. Card is the client's
// FSRS card as opaque JSON; nil until the item first needs review (an item
// solved on the first try never does).
type DrillProgress struct {
	ItemID      string          `json:"itemId"`
	Attempts    int             `json:"attempts"`
	Successes   int             `json:"successes"`
	LastSuccess bool            `json:"lastSuccess"`
	Card        json.RawMessage `json:"card"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

// DrillAttemptLog is one row of history, used for the rating chart and the
// daily counters. RatingAfter is nil for unrated attempts (reviews).
type DrillAttemptLog struct {
	ItemID      string    `json:"itemId"`
	Success     bool      `json:"success"`
	RatingAfter *float64  `json:"ratingAfter"`
	DurationMs  int       `json:"durationMs"`
	At          time.Time `json:"at"`
}

// DrillState is everything the client needs to resume a drill kind.
type DrillState struct {
	Rating   *DrillRating      `json:"rating"`
	Progress []DrillProgress   `json:"progress"`
	Attempts []DrillAttemptLog `json:"attempts"`
}

// DrillAttempt is what the client posts after finishing (or failing) an
// item. Rating is set only for rated attempts and is the user's rating
// after this result; Card is the item's FSRS card after this result, or
// nil to leave the stored card as it is.
type DrillAttempt struct {
	ItemID     string          `json:"itemId"`
	Success    bool            `json:"success"`
	DurationMs int             `json:"durationMs"`
	Card       json.RawMessage `json:"card"`
	Rating     *DrillRating    `json:"rating"`
}
