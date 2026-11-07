package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"regexp"
	"time"

	"chesspractice/internal/auth"
	"chesspractice/internal/domain"
	"chesspractice/internal/store"
)

// A long game with full analysis is ~20 KB of JSON; this leaves headroom
// without letting one row grow without bound.
const maxGameBody = 128 << 10

var gameID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,40}$`)

// ListGames returns the caller's saved games, newest first.
func ListGames(db store.Repo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sess, ok := auth.RequireSession(db, w, r)
		if !ok {
			return
		}
		games, err := db.ListGames(r.Context(), sess.UserID)
		if err != nil {
			log.Println("failed to list games:", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"games": games})
	}
}

// SaveGame stores (or replaces) one game. The body is the client's game
// document (a JSON object); endedAt is read from it so the list can be
// ordered.
func SaveGame(db store.Repo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !gameID.MatchString(id) {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		sess, ok := auth.RequireSession(db, w, r)
		if !ok {
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxGameBody))
		if err != nil {
			http.Error(w, "body too large", http.StatusRequestEntityTooLarge)
			return
		}
		var doc struct {
			ID      string     `json:"id"`
			EndedAt *time.Time `json:"endedAt"`
		}
		trimmed := bytes.TrimSpace(body)
		if len(trimmed) == 0 || trimmed[0] != '{' || json.Unmarshal(trimmed, &doc) != nil {
			http.Error(w, "invalid game", http.StatusBadRequest)
			return
		}
		if doc.ID != id {
			http.Error(w, "id mismatch", http.StatusBadRequest)
			return
		}
		if err := db.UpsertGame(r.Context(), sess.UserID, domain.SavedGame{ID: id, Data: trimmed, EndedAt: doc.EndedAt}); err != nil {
			log.Println("failed to save game:", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// DeleteGame removes one of the caller's games.
func DeleteGame(db store.Repo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !gameID.MatchString(id) {
			http.Error(w, "invalid id", http.StatusBadRequest)
			return
		}
		sess, ok := auth.RequireSession(db, w, r)
		if !ok {
			return
		}
		if err := db.DeleteGame(r.Context(), sess.UserID, id); err != nil {
			log.Println("failed to delete game:", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
