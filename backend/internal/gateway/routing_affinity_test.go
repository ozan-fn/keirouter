package gateway

import (
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/mydisha/keirouter/backend/internal/core"
)

func TestRequestAffinityKeyPrefersExplicitHeader(t *testing.T) {
	r := httptest.NewRequest("POST", "/v1/chat/completions", nil)
	r.Header.Set("X-Conversation-ID", "thread-123")

	got := requestAffinityKey(r, nil, &core.ChatRequest{})
	require.Equal(t, "header:x-conversation-id:thread-123", got)
}

func TestRequestAffinityKeyUsesStableFirstUserFingerprint(t *testing.T) {
	r := httptest.NewRequest("POST", "/v1/chat/completions", nil)
	base := &core.ChatRequest{
		Model: "xiaomi-tokenplan/mimo-v2.5",
		Metadata: core.RequestMetadata{
			APIKeyID:      "key-1",
			ClientKind:    "codex",
			SourceDialect: core.DialectOpenAI,
		},
		Messages: []core.Message{
			{Role: core.RoleUser, Content: []core.ContentPart{{Type: core.PartText, Text: "start this task"}}},
		},
	}
	followUp := &core.ChatRequest{
		Model:    base.Model,
		Metadata: base.Metadata,
		Messages: []core.Message{
			{Role: core.RoleUser, Content: []core.ContentPart{{Type: core.PartText, Text: "start this task"}}},
			{Role: core.RoleAssistant, Content: []core.ContentPart{{Type: core.PartText, Text: "working"}}},
			{Role: core.RoleUser, Content: []core.ContentPart{{Type: core.PartText, Text: "continue"}}},
		},
	}

	require.Equal(t, requestAffinityKey(r, nil, base), requestAffinityKey(r, nil, followUp))
}
