package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chesspractice/internal/domain"
)

func gameMux(fs *fakeStore) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /games", ListGames(fs))
	mux.HandleFunc("POST /games/{id}", SaveGame(fs))
	mux.HandleFunc("DELETE /games/{id}", DeleteGame(fs))
	return mux
}

func listGames(t *testing.T, mux *http.ServeMux, sid string) []domain.SavedGame {
	t.Helper()
	rr := serve(mux, withSession(httptest.NewRequest("GET", "/games", nil), sid))
	if rr.Code != http.StatusOK {
		t.Fatalf("list status = %d", rr.Code)
	}
	var body struct {
		Games []domain.SavedGame `json:"games"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v (%s)", err, rr.Body.String())
	}
	return body.Games
}

func TestGamesRoundTrip(t *testing.T) {
	fs := newFakeStore()
	sid := seedUser(t, fs, domain.User{TokenID: "me-sub", Username: "me", Email: "e"})
	other := seedUser(t, fs, domain.User{TokenID: "you-sub", Username: "you", Email: "e"})
	mux := gameMux(fs)

	if got := listGames(t, mux, sid); len(got) != 0 {
		t.Fatalf("fresh list = %#v", got)
	}
	if rr := serve(mux, withSession(httptest.NewRequest("GET", "/games", nil), sid)); !strings.Contains(rr.Body.String(), `"games":[]`) {
		t.Errorf("empty list must be [] not null: %s", rr.Body.String())
	}

	doc := `{"id":"g1","moves":["e2e4","e7e5"],"endedAt":"2026-11-06T10:00:00Z","result":{"winner":"white","reason":"resign"}}`
	if rr := serve(mux, withSession(newJSONRequest("POST", "/games/g1", doc), sid)); rr.Code != http.StatusNoContent {
		t.Fatalf("save status = %d %s", rr.Code, rr.Body.String())
	}
	// Saving again (e.g. with analysis added) replaces it.
	doc2 := `{"id":"g1","moves":["e2e4","e7e5"],"endedAt":"2026-11-06T10:00:00Z","analysis":{"v":1}}`
	if rr := serve(mux, withSession(newJSONRequest("POST", "/games/g1", doc2), sid)); rr.Code != http.StatusNoContent {
		t.Fatalf("resave status = %d", rr.Code)
	}
	got := listGames(t, mux, sid)
	if len(got) != 1 || got[0].ID != "g1" || !strings.Contains(string(got[0].Data), `"analysis"`) || got[0].EndedAt == nil {
		t.Fatalf("list = %#v", got)
	}
	if len(listGames(t, mux, other)) != 0 {
		t.Error("another user sees my games")
	}

	if rr := serve(mux, withSession(httptest.NewRequest("DELETE", "/games/g1", nil), sid)); rr.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d", rr.Code)
	}
	if len(listGames(t, mux, sid)) != 0 {
		t.Error("game not deleted")
	}
}

func TestSaveGameValidation(t *testing.T) {
	fs := newFakeStore()
	sid := seedUser(t, fs, domain.User{TokenID: "me-sub", Username: "me", Email: "e"})
	mux := gameMux(fs)

	cases := map[string]struct{ path, body string }{
		"id mismatch": {"/games/g1", `{"id":"g2"}`},
		"not object":  {"/games/g1", `[1,2]`},
		"not json":    {"/games/g1", `nope`},
		"bad id":      {"/games/a.b", `{"id":"a.b"}`},
		"bad endedAt": {"/games/g1", `{"id":"g1","endedAt":"yesterday"}`},
	}
	for name, c := range cases {
		rr := serve(mux, withSession(newJSONRequest("POST", c.path, c.body), sid))
		if rr.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d", name, rr.Code)
		}
	}
	big := `{"id":"g1","pad":"` + strings.Repeat("x", maxGameBody) + `"}`
	if rr := serve(mux, withSession(newJSONRequest("POST", "/games/g1", big), sid)); rr.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("oversize: status = %d", rr.Code)
	}
}

func TestGamesRequireSessionAndHandleErrors(t *testing.T) {
	fs := newFakeStore()
	mux := gameMux(fs)
	if rr := serve(mux, httptest.NewRequest("GET", "/games", nil)); rr.Code != http.StatusUnauthorized {
		t.Errorf("list without session = %d", rr.Code)
	}
	if rr := serve(mux, newJSONRequest("POST", "/games/g1", `{"id":"g1"}`)); rr.Code != http.StatusUnauthorized {
		t.Errorf("save without session = %d", rr.Code)
	}

	sid := seedUser(t, fs, domain.User{TokenID: "me-sub", Username: "me", Email: "e"})
	fs.withErr("ListGames", errors.New("boom"))
	if rr := serve(mux, withSession(httptest.NewRequest("GET", "/games", nil), sid)); rr.Code != http.StatusInternalServerError {
		t.Errorf("list error = %d", rr.Code)
	}
	fs.withErr("UpsertGame", errors.New("boom"))
	if rr := serve(mux, withSession(newJSONRequest("POST", "/games/g1", `{"id":"g1"}`), sid)); rr.Code != http.StatusInternalServerError {
		t.Errorf("save error = %d", rr.Code)
	}
}
