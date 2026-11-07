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

func drillMux(fs *fakeStore) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /drills/{kind}", GetDrillState(fs))
	mux.HandleFunc("POST /drills/{kind}/attempts", PostDrillAttempt(fs))
	return mux
}

func serve(mux *http.ServeMux, req *http.Request) *httptest.ResponseRecorder {
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	return rr
}

func TestDrillStateEmptyForNewUser(t *testing.T) {
	fs := newFakeStore()
	sid := seedUser(t, fs, domain.User{TokenID: "me-sub", Username: "me", Email: "e"})

	rr := serve(drillMux(fs), withSession(httptest.NewRequest("GET", "/drills/puzzle", nil), sid))
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d", rr.Code)
	}
	var st domain.DrillState
	if err := json.Unmarshal(rr.Body.Bytes(), &st); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if st.Rating != nil || len(st.Progress) != 0 || len(st.Attempts) != 0 {
		t.Errorf("state = %#v", st)
	}
	// Slices must serialise as [] so the client never sees null.
	if got := rr.Body.String(); !strings.Contains(got, `"progress":[]`) || !strings.Contains(got, `"attempts":[]`) {
		t.Errorf("body = %s", got)
	}
}

func TestDrillAttemptRoundTrip(t *testing.T) {
	fs := newFakeStore()
	sid := seedUser(t, fs, domain.User{TokenID: "me-sub", Username: "me", Email: "e"})
	mux := drillMux(fs)

	// Rated miss that creates a review card.
	body := `{"itemId":"aB3x9","success":false,"durationMs":42000,
		"card":{"due":"2026-11-07T00:00:00Z","reps":1},
		"rating":{"rating":1480.5,"rd":290,"games":1}}`
	rr := serve(mux, withSession(newJSONRequest("POST", "/drills/puzzle/attempts", body), sid))
	if rr.Code != http.StatusNoContent {
		t.Fatalf("post status = %d body=%s", rr.Code, rr.Body.String())
	}
	// Unrated review solved, no card change.
	body = `{"itemId":"aB3x9","success":true,"durationMs":9000,"card":null}`
	rr = serve(mux, withSession(newJSONRequest("POST", "/drills/puzzle/attempts", body), sid))
	if rr.Code != http.StatusNoContent {
		t.Fatalf("post status = %d", rr.Code)
	}

	rr = serve(mux, withSession(httptest.NewRequest("GET", "/drills/puzzle", nil), sid))
	var st domain.DrillState
	if err := json.Unmarshal(rr.Body.Bytes(), &st); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if st.Rating == nil || st.Rating.Rating != 1480.5 || st.Rating.Games != 1 {
		t.Errorf("rating = %#v", st.Rating)
	}
	if len(st.Progress) != 1 {
		t.Fatalf("progress = %#v", st.Progress)
	}
	p := st.Progress[0]
	if p.Attempts != 2 || p.Successes != 1 || !p.LastSuccess || !strings.Contains(string(p.Card), `"reps":1`) {
		t.Errorf("progress = %#v card=%s", p, p.Card)
	}
	if len(st.Attempts) != 2 || st.Attempts[0].RatingAfter == nil || st.Attempts[1].RatingAfter != nil {
		t.Errorf("attempts = %#v", st.Attempts)
	}

	// Another kind is a separate track.
	rr = serve(mux, withSession(httptest.NewRequest("GET", "/drills/endgame", nil), sid))
	if rr.Code != http.StatusOK || strings.Contains(rr.Body.String(), "aB3x9") {
		t.Errorf("endgame leaked puzzle data: %d %s", rr.Code, rr.Body.String())
	}

	// Mistakes from your own games: "<gameId>-<ply>" ids, a track of their own.
	rr = serve(mux, withSession(newJSONRequest("POST", "/drills/mistake/attempts", `{"itemId":"mh2k9x1abc-23","success":false,"card":{"due":"2026-01-02T00:00:00Z"}}`), sid))
	if rr.Code != http.StatusNoContent {
		t.Fatalf("mistake attempt: status = %d %s", rr.Code, rr.Body.String())
	}
	rr = serve(mux, withSession(httptest.NewRequest("GET", "/drills/mistake", nil), sid))
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), "mh2k9x1abc-23") || strings.Contains(rr.Body.String(), "aB3x9") {
		t.Errorf("mistake state: %d %s", rr.Code, rr.Body.String())
	}
}

func TestDrillAttemptValidation(t *testing.T) {
	fs := newFakeStore()
	sid := seedUser(t, fs, domain.User{TokenID: "me-sub", Username: "me", Email: "e"})
	mux := drillMux(fs)

	cases := map[string]string{
		"bad id":      `{"itemId":"../etc","success":true}`,
		"empty id":    `{"itemId":"","success":true}`,
		"card array":  `{"itemId":"abc","success":true,"card":[1,2]}`,
		"rating high": `{"itemId":"abc","success":true,"rating":{"rating":9000,"rd":50,"games":1}}`,
		"rd zero":     `{"itemId":"abc","success":true,"rating":{"rating":1500,"rd":0,"games":1}}`,
		"not json":    `nope`,
	}
	for name, body := range cases {
		rr := serve(mux, withSession(newJSONRequest("POST", "/drills/puzzle/attempts", body), sid))
		if rr.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d", name, rr.Code)
		}
	}

	rr := serve(mux, withSession(newJSONRequest("POST", "/drills/chess960/attempts", `{"itemId":"abc","success":true}`), sid))
	if rr.Code != http.StatusNotFound {
		t.Errorf("unknown kind: status = %d", rr.Code)
	}
}

func TestDrillDurationClamped(t *testing.T) {
	a := domain.DrillAttempt{ItemID: "abc", DurationMs: 10 * maxDrillDuration}
	if msg := validateDrillAttempt(&a); msg != "" || a.DurationMs != maxDrillDuration {
		t.Errorf("msg=%q duration=%d", msg, a.DurationMs)
	}
	a = domain.DrillAttempt{ItemID: "abc", DurationMs: -5}
	if validateDrillAttempt(&a); a.DurationMs != 0 {
		t.Errorf("duration=%d", a.DurationMs)
	}
}

func TestDrillRequiresSession(t *testing.T) {
	fs := newFakeStore()
	mux := drillMux(fs)
	if rr := serve(mux, httptest.NewRequest("GET", "/drills/puzzle", nil)); rr.Code != http.StatusUnauthorized {
		t.Errorf("get status = %d", rr.Code)
	}
	req := newJSONRequest("POST", "/drills/puzzle/attempts", `{"itemId":"abc","success":true}`)
	if rr := serve(mux, req); rr.Code != http.StatusUnauthorized {
		t.Errorf("post status = %d", rr.Code)
	}
}

func TestDrillStoreError(t *testing.T) {
	fs := newFakeStore()
	sid := seedUser(t, fs, domain.User{TokenID: "me-sub", Username: "me", Email: "e"})
	mux := drillMux(fs)

	fs.withErr("FetchDrillState", errors.New("boom"))
	if rr := serve(mux, withSession(httptest.NewRequest("GET", "/drills/puzzle", nil), sid)); rr.Code != http.StatusInternalServerError {
		t.Errorf("get status = %d", rr.Code)
	}
	fs.withErr("RecordDrillAttempt", errors.New("boom"))
	req := withSession(newJSONRequest("POST", "/drills/puzzle/attempts", `{"itemId":"abc","success":true}`), sid)
	if rr := serve(mux, req); rr.Code != http.StatusInternalServerError {
		t.Errorf("post status = %d", rr.Code)
	}
}
