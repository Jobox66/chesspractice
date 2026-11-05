package auth

import (
	"testing"
	"time"
)

func TestWSTicketSingleUse(t *testing.T) {
	ticket, err := IssueWSTicket("sess-1")
	if err != nil {
		t.Fatal(err)
	}
	id, ok := RedeemWSTicket(ticket)
	if !ok || id != "sess-1" {
		t.Fatalf("first redeem = (%q, %v), want (sess-1, true)", id, ok)
	}
	if _, ok := RedeemWSTicket(ticket); ok {
		t.Fatal("second redeem succeeded, want single-use")
	}
}

func TestWSTicketUnknown(t *testing.T) {
	if _, ok := RedeemWSTicket("nope"); ok {
		t.Fatal("unknown ticket redeemed")
	}
}

func TestWSTicketExpired(t *testing.T) {
	ticket, err := IssueWSTicket("sess-2")
	if err != nil {
		t.Fatal(err)
	}
	wsTicketsMu.Lock()
	e := wsTickets[ticket]
	e.expiresAt = time.Now().Add(-time.Second)
	wsTickets[ticket] = e
	wsTicketsMu.Unlock()

	if _, ok := RedeemWSTicket(ticket); ok {
		t.Fatal("expired ticket redeemed")
	}
}
