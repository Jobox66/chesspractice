package api

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"regexp"

	"chesspractice/internal/auth"
	"chesspractice/internal/domain"
	"chesspractice/internal/store"
)

const (
	maxDrillBody     = 8 << 10
	maxDrillCard     = 2 << 10
	maxDrillDuration = 60 * 60 * 1000 // an hour; longer means the tab sat open
)

// Lichess puzzle ids are 5 alphanumerics; endgame ids are our own slugs;
// mistake ids are "<gameId>-<ply>".
var drillItemID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,32}$`)

// GetDrillState returns the caller's rating, progress and recent attempts
// for one drill kind ("puzzle", "endgame" or "mistake").
func GetDrillState(db store.Repo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		kind := r.PathValue("kind")
		if !domain.IsDrillKind(kind) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		sess, ok := auth.RequireSession(db, w, r)
		if !ok {
			return
		}
		state, err := db.FetchDrillState(r.Context(), sess.UserID, kind)
		if err != nil {
			log.Println("failed to fetch drill state:", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(state)
	}
}

// PostDrillAttempt records one result for the caller. The client computes
// the FSRS card and the rating; the server checks they are sane and stores
// them.
func PostDrillAttempt(db store.Repo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		kind := r.PathValue("kind")
		if !domain.IsDrillKind(kind) {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		sess, ok := auth.RequireSession(db, w, r)
		if !ok {
			return
		}

		var a domain.DrillAttempt
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxDrillBody)).Decode(&a); err != nil {
			http.Error(w, "invalid body", http.StatusBadRequest)
			return
		}
		if msg := validateDrillAttempt(&a); msg != "" {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}

		if err := db.RecordDrillAttempt(r.Context(), sess.UserID, kind, a); err != nil {
			log.Println("failed to record drill attempt:", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// validateDrillAttempt returns a reason the attempt is rejected, or "".
// Out-of-range durations are clamped rather than rejected.
func validateDrillAttempt(a *domain.DrillAttempt) string {
	if !drillItemID.MatchString(a.ItemID) {
		return "invalid itemId"
	}
	if a.DurationMs < 0 {
		a.DurationMs = 0
	}
	if a.DurationMs > maxDrillDuration {
		a.DurationMs = maxDrillDuration
	}
	if card := bytes.TrimSpace(a.Card); len(card) > 0 && !bytes.Equal(card, []byte("null")) {
		if len(card) > maxDrillCard || card[0] != '{' {
			return "invalid card"
		}
	}
	if rt := a.Rating; rt != nil {
		if rt.Rating < 100 || rt.Rating > 4000 || rt.RD <= 0 || rt.RD > 500 || rt.Games < 0 {
			return "invalid rating"
		}
	}
	return ""
}
