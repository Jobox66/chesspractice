package api

import (
	"context"
	"sync"
	"time"

	"chesspractice/internal/domain"
	"chesspractice/internal/store"
)

// fakeStore is an in-memory store.Repo for unit tests. Every method
// mirrors the behaviour of the real Postgres-backed store; mutations
// are guarded by a mutex so a handler that runs concurrent reads/writes
// (the WS dispatch path doesn't, but it costs nothing) doesn't race.
//
// ctx is accepted by every method to satisfy the Repo contract, but
// not honored — the in-memory ops complete instantly so cancellation
// has nothing to interrupt.
type fakeStore struct {
	mu sync.Mutex

	usersByToken    map[string]domain.User
	usersByUsername map[string]string // username -> token id
	sessions        map[string]store.Session
	chapters        map[string][]domain.ChapterTreeResponse
	collaborators   map[collabKey]string // value is the permission ('edit' | 'train')
	drills          map[drillKey]*domain.DrillState
	games           map[string][]domain.SavedGame // user id -> games

	// errOn forces a method to return the given error on its next
	// call. Set via withErr; cleared after the call fires.
	errOn map[string]error
}

type collabKey struct{ owner, collaborator string }

type drillKey struct{ user, kind string }

func newFakeStore() *fakeStore {
	return &fakeStore{
		usersByToken:    map[string]domain.User{},
		usersByUsername: map[string]string{},
		sessions:        map[string]store.Session{},
		chapters:        map[string][]domain.ChapterTreeResponse{},
		collaborators:   map[collabKey]string{},
		drills:          map[drillKey]*domain.DrillState{},
		games:           map[string][]domain.SavedGame{},
		errOn:           map[string]error{},
	}
}

func (f *fakeStore) takeErr(name string) error {
	if e, ok := f.errOn[name]; ok {
		delete(f.errOn, name)
		return e
	}
	return nil
}

// withErr arms the next call to `name` to return err. Tests use this
// to drive the 500 paths without rewiring fakes per case.
func (f *fakeStore) withErr(name string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.errOn[name] = err
}

func (f *fakeStore) UpsertUser(_ context.Context, u domain.User) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("UpsertUser"); err != nil {
		return err
	}
	if prev, ok := f.usersByToken[u.TokenID]; ok && prev.Username != "" && prev.Username != u.Username {
		delete(f.usersByUsername, prev.Username)
	}
	f.usersByToken[u.TokenID] = u
	if u.Username != "" {
		f.usersByUsername[u.Username] = u.TokenID
	}
	return nil
}

func (f *fakeStore) FetchUser(_ context.Context, tokenID string) (*domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("FetchUser"); err != nil {
		return nil, err
	}
	u, ok := f.usersByToken[tokenID]
	if !ok {
		return nil, nil
	}
	cp := u
	return &cp, nil
}

func (f *fakeStore) FetchUserByUsername(_ context.Context, username string) (*domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("FetchUserByUsername"); err != nil {
		return nil, err
	}
	tok, ok := f.usersByUsername[username]
	if !ok {
		return nil, nil
	}
	u := f.usersByToken[tok]
	return &u, nil
}

func (f *fakeStore) CreateSession(_ context.Context, id, userID string) (store.Session, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("CreateSession"); err != nil {
		return store.Session{}, err
	}
	now := time.Now().UTC()
	sess := store.Session{
		SessionID: id,
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: now.Add(30 * 24 * time.Hour),
	}
	f.sessions[id] = sess
	return sess, nil
}

func (f *fakeStore) FetchSession(_ context.Context, id string) (*store.Session, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("FetchSession"); err != nil {
		return nil, err
	}
	sess, ok := f.sessions[id]
	if !ok {
		return nil, nil
	}
	if time.Now().UTC().After(sess.ExpiresAt) {
		return nil, nil
	}
	return &sess, nil
}

func (f *fakeStore) DeleteSession(_ context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("DeleteSession"); err != nil {
		return err
	}
	delete(f.sessions, id)
	return nil
}

func (f *fakeStore) FetchChaptersByOwner(_ context.Context, ownerID string) ([]domain.ChapterTreeResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("FetchChaptersByOwner"); err != nil {
		return nil, err
	}
	out := make([]domain.ChapterTreeResponse, len(f.chapters[ownerID]))
	copy(out, f.chapters[ownerID])
	return out, nil
}

func (f *fakeStore) AddCollaborator(_ context.Context, ownerID, collaboratorID, permission string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("AddCollaborator"); err != nil {
		return err
	}
	f.collaborators[collabKey{ownerID, collaboratorID}] = permission
	return nil
}

func (f *fakeStore) RemoveCollaborator(_ context.Context, ownerID, collaboratorID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("RemoveCollaborator"); err != nil {
		return err
	}
	delete(f.collaborators, collabKey{ownerID, collaboratorID})
	return nil
}

func (f *fakeStore) FetchOutgoingCollaborators(_ context.Context, ownerID string) ([]domain.CollaboratorView, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("FetchOutgoingCollaborators"); err != nil {
		return nil, err
	}
	out := make([]domain.CollaboratorView, 0)
	for k, perm := range f.collaborators {
		if k.owner != ownerID {
			continue
		}
		if u, ok := f.usersByToken[k.collaborator]; ok && u.Username != "" {
			out = append(out, domain.CollaboratorView{Username: u.Username, Picture: u.Picture, Permission: perm})
		}
	}
	return out, nil
}

func (f *fakeStore) FetchIncomingCollaborators(_ context.Context, userID string) ([]domain.CollaboratorView, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("FetchIncomingCollaborators"); err != nil {
		return nil, err
	}
	out := make([]domain.CollaboratorView, 0)
	for k, perm := range f.collaborators {
		if k.collaborator != userID {
			continue
		}
		if u, ok := f.usersByToken[k.owner]; ok && u.Username != "" {
			out = append(out, domain.CollaboratorView{Username: u.Username, Picture: u.Picture, Permission: perm})
		}
	}
	return out, nil
}

func (f *fakeStore) CanViewRepertoire(_ context.Context, ownerID, viewerID string) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("CanViewRepertoire"); err != nil {
		return false, err
	}
	if ownerID == viewerID {
		return true, nil
	}
	_, ok := f.collaborators[collabKey{ownerID, viewerID}]
	return ok, nil
}

func (f *fakeStore) FetchDrillState(_ context.Context, userID, kind string) (domain.DrillState, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("FetchDrillState"); err != nil {
		return domain.DrillState{}, err
	}
	if st, ok := f.drills[drillKey{userID, kind}]; ok {
		return *st, nil
	}
	return domain.DrillState{Progress: []domain.DrillProgress{}, Attempts: []domain.DrillAttemptLog{}}, nil
}

func (f *fakeStore) RecordDrillAttempt(_ context.Context, userID, kind string, a domain.DrillAttempt) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("RecordDrillAttempt"); err != nil {
		return err
	}
	k := drillKey{userID, kind}
	st, ok := f.drills[k]
	if !ok {
		st = &domain.DrillState{Progress: []domain.DrillProgress{}, Attempts: []domain.DrillAttemptLog{}}
		f.drills[k] = st
	}
	var ratingAfter *float64
	if a.Rating != nil {
		r := *a.Rating
		st.Rating = &r
		ratingAfter = &r.Rating
	}
	now := time.Now()
	idx := -1
	for i, p := range st.Progress {
		if p.ItemID == a.ItemID {
			idx = i
		}
	}
	if idx < 0 {
		st.Progress = append(st.Progress, domain.DrillProgress{ItemID: a.ItemID})
		idx = len(st.Progress) - 1
	}
	p := &st.Progress[idx]
	p.Attempts++
	if a.Success {
		p.Successes++
	}
	p.LastSuccess = a.Success
	if len(a.Card) > 0 && string(a.Card) != "null" {
		p.Card = a.Card
	}
	p.UpdatedAt = now
	st.Attempts = append(st.Attempts, domain.DrillAttemptLog{
		ItemID: a.ItemID, Success: a.Success, RatingAfter: ratingAfter, DurationMs: a.DurationMs, At: now,
	})
	return nil
}

func (f *fakeStore) ListGames(_ context.Context, userID string) ([]domain.SavedGame, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("ListGames"); err != nil {
		return nil, err
	}
	out := append([]domain.SavedGame{}, f.games[userID]...)
	// newest first, like the SQL
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

func (f *fakeStore) UpsertGame(_ context.Context, userID string, g domain.SavedGame) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("UpsertGame"); err != nil {
		return err
	}
	list := f.games[userID]
	for i := range list {
		if list[i].ID == g.ID {
			list[i] = g
			return nil
		}
	}
	f.games[userID] = append(list, g)
	return nil
}

func (f *fakeStore) DeleteGame(_ context.Context, userID, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := f.takeErr("DeleteGame"); err != nil {
		return err
	}
	list := f.games[userID][:0]
	for _, g := range f.games[userID] {
		if g.ID != id {
			list = append(list, g)
		}
	}
	f.games[userID] = list
	return nil
}

// Compile-time assertion: fakeStore satisfies store.Repo. If a method
// is added to Repo and not implemented here, the build breaks.
var _ store.Repo = (*fakeStore)(nil)
