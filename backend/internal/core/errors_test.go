package core

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestAsProviderErrorClassifiesLocalContextErrors(t *testing.T) {
	canceled := AsProviderError(context.Canceled)
	if canceled.Kind != ErrClientCanceled || canceled.EffectiveScope() != FailureScopeRequest {
		t.Fatalf("canceled error = kind %q scope %q", canceled.Kind, canceled.EffectiveScope())
	}

	deadline := AsProviderError(context.DeadlineExceeded)
	if deadline.Kind != ErrTimeout || deadline.EffectiveScope() != FailureScopeRequest {
		t.Fatalf("deadline error = kind %q scope %q", deadline.Kind, deadline.EffectiveScope())
	}
}

func TestIsClientDisconnectDoesNotGuessFromSocketText(t *testing.T) {
	if !IsClientDisconnect(context.Canceled) {
		t.Fatal("context cancellation must be classified as a client disconnect")
	}
	if IsClientDisconnect(errors.New("read: connection reset by peer")) {
		t.Fatal("an upstream socket reset must not be classified as a client disconnect")
	}
}

func TestProviderErrorDecision(t *testing.T) {
	pe := &ProviderError{Kind: ErrRateLimit, RetryAfter: 3 * time.Second}
	got := pe.Decision()
	if !got.Retryable || !got.Fallbackable || got.Scope != FailureScopeAccount || got.RetryAfter != 3*time.Second {
		t.Fatalf("unexpected retry decision: %+v", got)
	}

	model := (&ProviderError{Kind: ErrModelUnavailable}).Decision()
	if model.Retryable || !model.Fallbackable || model.Scope != FailureScopeModel {
		t.Fatalf("unexpected model decision: %+v", model)
	}
}
