package domain

import (
	"encoding/json"
	"time"
)

// SavedGame is a finished practice game (vs the engine) kept in the user's
// library. The game itself — moves, colour, engine level, result and, once
// run, the engine analysis — is the client's JSON document; the server
// only indexes it by id and end time.
type SavedGame struct {
	ID      string          `json:"id"`
	Data    json.RawMessage `json:"data"`
	EndedAt *time.Time      `json:"endedAt"`
}
