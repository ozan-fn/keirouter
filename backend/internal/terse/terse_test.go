package terse

import (
	"strings"
	"testing"

	"github.com/mydisha/keirouter/backend/internal/core"
	"github.com/stretchr/testify/require"
)

func TestApply_Disabled(t *testing.T) {
	req := &core.ChatRequest{System: "original instructions"}
	Apply(req, Config{Enabled: false})
	require.Equal(t, "original instructions", req.System)
}

func TestApply_NilRequest(t *testing.T) {
	require.NotPanics(t, func() {
		Apply(nil, Config{Enabled: true})
	})
}

func TestApply_InjectsTerseContext(t *testing.T) {
	req := &core.ChatRequest{
		Messages: []core.Message{
			{Role: core.RoleUser, Content: []core.ContentPart{{Type: core.PartText, Text: "hello"}}},
		},
	}
	Apply(req, Config{Enabled: true})
	require.Contains(t, req.System, sentinel)
	require.Contains(t, req.System, "TERSE format")
	require.Contains(t, req.System, "Conversation")
	require.Contains(t, req.System, "hello")
}

func TestApply_SerializesTools(t *testing.T) {
	req := &core.ChatRequest{
		Tools: []core.Tool{
			{Name: "read_file", Description: "Read a file from disk"},
		},
	}
	Apply(req, Config{Enabled: true})
	require.Contains(t, req.System, sentinel)
	require.Contains(t, req.System, "Tools")
	require.Contains(t, req.System, "read_file")
}

func TestApply_PrependsToExistingSystem(t *testing.T) {
	req := &core.ChatRequest{
		System: "you are a helpful assistant",
		Messages: []core.Message{
			{Role: core.RoleUser, Content: []core.ContentPart{{Type: core.PartText, Text: "hi"}}},
		},
	}
	Apply(req, Config{Enabled: true})

	require.Contains(t, req.System, sentinel)
	require.Contains(t, req.System, "you are a helpful assistant")
	// terse block must come first
	require.True(t, strings.Index(req.System, sentinel) < strings.Index(req.System, "you are a helpful assistant"))
}

func TestApply_Idempotent(t *testing.T) {
	req := &core.ChatRequest{
		System: "base",
		Messages: []core.Message{
			{Role: core.RoleUser, Content: []core.ContentPart{{Type: core.PartText, Text: "test"}}},
		},
	}
	Apply(req, Config{Enabled: true})
	first := req.System
	Apply(req, Config{Enabled: true})
	require.Equal(t, first, req.System, "second apply must not change anything")
	require.Equal(t, 1, strings.Count(req.System, sentinel), "sentinel must appear exactly once")
}

func TestApply_EmptyMessagesAndTools(t *testing.T) {
	req := &core.ChatRequest{System: "base"}
	Apply(req, Config{Enabled: true})
	require.Contains(t, req.System, sentinel)
	require.Contains(t, req.System, "TERSE format")
	// No conversation or tools sections when empty
	require.NotContains(t, req.System, "Conversation")
	require.NotContains(t, req.System, "Tools")
}

func TestApply_MultiPartContent(t *testing.T) {
	req := &core.ChatRequest{
		Messages: []core.Message{
			{
				Role: core.RoleAssistant,
				Content: []core.ContentPart{
					{Type: core.PartText, Text: "let me check"},
					{Type: core.PartToolCall, ToolCall: &core.ToolCall{ID: "call_1", Name: "search", Arguments: []byte(`{"q":"test"}`)}},
				},
			},
		},
	}
	Apply(req, Config{Enabled: true})
	require.Contains(t, req.System, "let me check")
	require.Contains(t, req.System, "tool_call")
	require.Contains(t, req.System, "search")
}
