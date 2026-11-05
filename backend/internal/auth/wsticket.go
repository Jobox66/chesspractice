package auth

import (
	"sync"
	"time"
)

// WebSocket tickets bridge the session cookie to a WebSocket that is
// opened cross-site. In the Vercel + Render deploy the SPA reaches the
// HTTP API through a same-origin rewrite (/api/* -> Render), so the
// session cookie is first-party. Vercel can't proxy WebSockets, though,
// so the socket connects straight to the Render host, where the browser
// won't attach the (SameSite=Lax, host-only) cookie. Instead the SPA
// trades its cookie for a short-lived, single-use ticket over the
// proxied HTTP API and passes it as ?ticket= on the upgrade.
//
// Tickets live in process memory: fine for the single-instance backend.
// A multi-instance deploy would need a shared store.

// WSTicketTTL bounds how long a ticket stays redeemable. The client
// fetches one immediately before dialing, so a few seconds is plenty;
// the margin covers a slow mobile link.
const WSTicketTTL = 30 * time.Second

type wsTicket struct {
	sessionID string
	expiresAt time.Time
}

var (
	wsTicketsMu sync.Mutex
	wsTickets   = make(map[string]wsTicket)
)

// IssueWSTicket mints a single-use ticket bound to sessionID.
func IssueWSTicket(sessionID string) (string, error) {
	id, err := NewSessionID()
	if err != nil {
		return "", err
	}
	now := time.Now()

	wsTicketsMu.Lock()
	defer wsTicketsMu.Unlock()
	// Opportunistic sweep so abandoned tickets don't accumulate.
	for k, t := range wsTickets {
		if now.After(t.expiresAt) {
			delete(wsTickets, k)
		}
	}
	wsTickets[id] = wsTicket{sessionID: sessionID, expiresAt: now.Add(WSTicketTTL)}
	return id, nil
}

// RedeemWSTicket consumes a ticket and returns the session id it was
// issued for. A ticket works at most once; expired or unknown tickets
// return ok=false. The caller must still validate the session itself,
// since it may have been revoked after the ticket was issued.
func RedeemWSTicket(ticket string) (sessionID string, ok bool) {
	wsTicketsMu.Lock()
	defer wsTicketsMu.Unlock()
	t, found := wsTickets[ticket]
	if !found {
		return "", false
	}
	delete(wsTickets, ticket)
	if time.Now().After(t.expiresAt) {
		return "", false
	}
	return t.sessionID, true
}
