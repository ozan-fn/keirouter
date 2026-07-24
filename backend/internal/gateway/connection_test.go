package gateway

import (
	"context"
	"errors"
	"testing"
)

func TestIsClientDisconnectUsesWriteDirection(t *testing.T) {
	if !isClientDisconnect(context.Canceled) {
		t.Fatal("context cancellation must be treated as a client disconnect")
	}
	if !isClientDisconnect(&streamWriteError{err: errors.New("write: broken pipe")}) {
		t.Fatal("a downstream broken pipe must be treated as a client disconnect")
	}
	if isClientDisconnect(&streamReadError{err: errors.New("read: connection reset by peer")}) {
		t.Fatal("an upstream reset must remain a provider failure")
	}
	if isClientDisconnect(errors.New("connection reset by peer")) {
		t.Fatal("an unscoped socket string must not be guessed as a client disconnect")
	}
}
