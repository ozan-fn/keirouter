package oauth

import (
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"testing"
)

func TestGeneratePKCE(t *testing.T) {
	p, err := GeneratePKCE(32)
	if err != nil {
		t.Fatal(err)
	}
	if p.Verifier == "" || p.Challenge == "" || p.State == "" {
		t.Fatal("expected non-empty verifier/challenge/state")
	}
	// Challenge must be S256(verifier) base64url.
	sum := sha256.Sum256([]byte(p.Verifier))
	want := base64.RawURLEncoding.EncodeToString(sum[:])
	if p.Challenge != want {
		t.Fatalf("challenge mismatch: got %q want %q", p.Challenge, want)
	}
	// base64url must not contain padding or +/.
	if strings.ContainsAny(p.Verifier, "+/=") {
		t.Errorf("verifier is not base64url: %q", p.Verifier)
	}
}

func TestGeneratePKCEUnique(t *testing.T) {
	a, _ := GeneratePKCE(32)
	b, _ := GeneratePKCE(32)
	if a.Verifier == b.Verifier || a.State == b.State {
		t.Fatal("expected unique PKCE values across calls")
	}
}

func TestConfigFor(t *testing.T) {
	for _, id := range []string{"claude", "codex", "github", "qwen", "xai", "gemini-cli"} {
		cfg, ok := ConfigFor(id)
		if !ok {
			t.Errorf("expected OAuth config for %q", id)
			continue
		}
		if cfg.Provider != id {
			t.Errorf("config %q has wrong Provider %q", id, cfg.Provider)
		}
	}
	if _, ok := ConfigFor("does-not-exist"); ok {
		t.Error("expected no config for unknown provider")
	}
}

func TestAuthURLPKCE(t *testing.T) {
	cfg, _ := ConfigFor("claude")
	url := cfg.AuthURL("http://localhost:20180/callback", "state123", "challenge456")
	for _, want := range []string{
		"https://claude.ai/oauth/authorize?",
		"client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e",
		"code_challenge=challenge456",
		"code_challenge_method=S256",
		"state=state123",
		"response_type=code",
	} {
		if !strings.Contains(url, want) {
			t.Errorf("auth URL missing %q\ngot: %s", want, url)
		}
	}
}

func TestAuthURLDeviceCodeFlowDistinct(t *testing.T) {
	cfg, _ := ConfigFor("github")
	if cfg.Flow != FlowDeviceCode {
		t.Fatalf("github should be device-code flow, got %q", cfg.Flow)
	}
}

func TestRefreshURLFallback(t *testing.T) {
	claude, _ := ConfigFor("claude")
	if claude.refreshURL() != claude.TokenURL {
		t.Error("refresh URL should default to token URL when unset")
	}
	cline, _ := ConfigFor("cline")
	if cline.refreshURL() != "https://api.cline.bot/api/v1/auth/refresh" {
		t.Errorf("cline refresh URL should use explicit RefreshURL, got %q", cline.refreshURL())
	}
}

func TestSessionStore(t *testing.T) {
	s := NewSessionStore()
	s.Put("k1", &Session{Provider: "claude", State: "k1", Verifier: "v"})
	got, ok := s.Get("k1")
	if !ok || got.Verifier != "v" {
		t.Fatal("expected to retrieve stored session")
	}
	s.Delete("k1")
	if _, ok := s.Get("k1"); ok {
		t.Fatal("expected session deleted")
	}
}