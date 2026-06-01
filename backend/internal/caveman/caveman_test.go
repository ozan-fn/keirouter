package caveman

import (
	"strings"
	"testing"

	"github.com/mydisha/keirouter/backend/internal/core"
)

func TestApplyDisabled(t *testing.T) {
	req := &core.ChatRequest{System: "original"}
	Apply(req, Config{Enabled: false})
	if req.System != "original" {
		t.Fatalf("disabled caveman must not change system, got %q", req.System)
	}
}

func TestApplyInjectsIntoEmptySystem(t *testing.T) {
	req := &core.ChatRequest{}
	Apply(req, Config{Enabled: true, Level: LevelFull})
	if !strings.Contains(req.System, sentinel) {
		t.Fatal("expected sentinel marker in system prompt")
	}
	if !strings.Contains(req.System, "terse caveman") {
		t.Fatalf("expected full-level prompt, got %q", req.System)
	}
}

func TestApplyAppendsToExistingSystem(t *testing.T) {
	req := &core.ChatRequest{System: "be helpful"}
	Apply(req, Config{Enabled: true, Level: LevelLite})
	if !strings.HasPrefix(req.System, "be helpful") {
		t.Fatalf("existing system text must be preserved first, got %q", req.System)
	}
	if !strings.Contains(req.System, sentinel) {
		t.Fatal("expected sentinel marker appended")
	}
}

func TestApplyIdempotent(t *testing.T) {
	req := &core.ChatRequest{}
	Apply(req, Config{Enabled: true, Level: LevelFull})
	first := req.System
	Apply(req, Config{Enabled: true, Level: LevelFull})
	if req.System != first {
		t.Fatal("second Apply must be a no-op (idempotent across retries)")
	}
}

func TestLevelSelection(t *testing.T) {
	cases := map[Level]string{
		LevelLite:  "Keep grammar",
		LevelFull:  "terse caveman",
		LevelUltra: "ultra-terse",
	}
	for level, want := range cases {
		req := &core.ChatRequest{}
		Apply(req, Config{Enabled: true, Level: level})
		if !strings.Contains(req.System, want) {
			t.Errorf("level %q: expected %q in prompt, got %q", level, want, req.System)
		}
	}
}

func TestValidLevel(t *testing.T) {
	for _, l := range []Level{LevelLite, LevelFull, LevelUltra} {
		if !ValidLevel(l) {
			t.Errorf("expected %q to be valid", l)
		}
	}
	if ValidLevel("bogus") {
		t.Error("expected bogus level to be invalid")
	}
}