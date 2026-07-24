package connectors

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/mydisha/keirouter/backend/internal/core"
)

func TestQoderSerializeTools_UsesOpenAIFunctionWrapper(t *testing.T) {
	tools := serializeTools([]core.Tool{
		{
			Name:        "read_file",
			Description: "Read a file",
			Parameters:  json.RawMessage(`{"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}`),
		},
	})

	if len(tools) != 1 {
		t.Fatalf("expected 1 serialized tool, got %d", len(tools))
	}

	var got map[string]any
	if err := json.Unmarshal(tools[0], &got); err != nil {
		t.Fatalf("unmarshal serialized tool: %v", err)
	}

	if got["type"] != "function" {
		t.Fatalf("tool type = %v, want function", got["type"])
	}
	fn, ok := got["function"].(map[string]any)
	if !ok {
		t.Fatalf("function missing or wrong type: %v", got["function"])
	}
	if fn["name"] != "read_file" {
		t.Fatalf("tool name = %v, want read_file", fn["name"])
	}
	if fn["description"] != "Read a file" {
		t.Fatalf("tool description = %v, want Read a file", fn["description"])
	}

	schema, ok := fn["parameters"].(map[string]any)
	if !ok {
		t.Fatalf("parameters missing or wrong type: %v", fn["parameters"])
	}
	if schema["type"] != "object" {
		t.Fatalf("parameters.type = %v, want object", schema["type"])
	}
}

func TestQoderSerializeTools_DefaultsInvalidSchema(t *testing.T) {
	tools := serializeTools([]core.Tool{
		{Name: "empty"},
		{Name: "bad", Parameters: json.RawMessage(`not-json`)},
	})

	if len(tools) != 2 {
		t.Fatalf("expected 2 serialized tools, got %d", len(tools))
	}

	for i, raw := range tools {
		var got map[string]any
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatalf("unmarshal serialized tool %d: %v", i, err)
		}
		fn, ok := got["function"].(map[string]any)
		if !ok {
			t.Fatalf("function missing or wrong type for tool %d: %v", i, got)
		}
		schema, ok := fn["parameters"].(map[string]any)
		if !ok {
			t.Fatalf("parameters missing or wrong type for tool %d: %v", i, got)
		}
		if schema["type"] != "object" {
			t.Fatalf("parameters.type for tool %d = %v, want object", i, schema["type"])
		}
		if _, ok := schema["properties"].(map[string]any); !ok {
			t.Fatalf("parameters.properties missing or wrong type for tool %d: %v", i, schema)
		}
	}
}

func TestNormalizeQoderMessages_PreservesToolPair(t *testing.T) {
	msgs, system := normalizeQoderMessages([]core.Message{
		{
			Role: core.RoleAssistant,
			Content: []core.ContentPart{
				{Type: core.PartText, Text: "checking"},
				{Type: core.PartToolCall, ToolCall: &core.ToolCall{
					ID:        "tool_call_1",
					Name:      "read_file",
					Arguments: json.RawMessage(`{"path":"a.go"}`),
				}},
			},
		},
		{
			Role: core.RoleUser,
			Content: []core.ContentPart{
				{Type: core.PartToolResult, ToolResult: &core.ToolResult{
					CallID: "tool_call_1", Content: "package main",
				}},
				{Type: core.PartText, Text: "continue"},
			},
		},
	})

	if system != "" {
		t.Fatalf("unexpected system text %q", system)
	}
	if len(msgs) != 3 {
		t.Fatalf("expected assistant/tool/user messages, got %+v", msgs)
	}
	if len(msgs[0].ToolCalls) != 1 {
		t.Fatalf("expected one tool call, got %+v", msgs[0])
	}
	call := msgs[0].ToolCalls[0]
	if call.ID != "tool_call_1" || call.Function.Name != "read_file" ||
		call.Function.Arguments != `{"path":"a.go"}` {
		t.Fatalf("unexpected tool call: %+v", call)
	}
	if msgs[1].Role != "tool" || msgs[1].ToolCallID != "tool_call_1" ||
		msgs[1].Content != "package main" {
		t.Fatalf("unexpected tool result: %+v", msgs[1])
	}
	if msgs[2].Role != "user" || msgs[2].Content != "continue" {
		t.Fatalf("unexpected user message: %+v", msgs[2])
	}
}

func TestNormalizeQoderMessages_DropsOrphanResultAndKeepsText(t *testing.T) {
	msgs, _ := normalizeQoderMessages([]core.Message{
		{
			Role: core.RoleUser,
			Content: []core.ContentPart{
				{Type: core.PartToolResult, ToolResult: &core.ToolResult{
					CallID: "tool_call_1", Content: "stale",
				}},
				{Type: core.PartText, Text: "continue"},
			},
		},
	})

	if len(msgs) != 1 {
		t.Fatalf("expected orphan result to be dropped, got %+v", msgs)
	}
	if msgs[0].Role != "user" || msgs[0].Content != "continue" {
		t.Fatalf("unexpected remaining message: %+v", msgs[0])
	}
}

func TestNormalizeQoderMessages_MovesDelayedResultNextToCall(t *testing.T) {
	msgs, _ := normalizeQoderMessages([]core.Message{
		{
			Role: core.RoleAssistant,
			Content: []core.ContentPart{
				{Type: core.PartToolCall, ToolCall: &core.ToolCall{
					ID: "tool_call_1", Name: "read_file", Arguments: json.RawMessage(`{}`),
				}},
			},
		},
		{
			Role: core.RoleUser,
			Content: []core.ContentPart{
				{Type: core.PartText, Text: "intervening"},
			},
		},
		{
			Role: core.RoleTool,
			Content: []core.ContentPart{
				{Type: core.PartToolResult, ToolResult: &core.ToolResult{
					CallID: "tool_call_1", Content: "result",
				}},
			},
		},
	})

	if len(msgs) != 3 {
		t.Fatalf("expected three repaired messages, got %+v", msgs)
	}
	if msgs[0].Role != "assistant" || msgs[1].Role != "tool" || msgs[2].Role != "user" {
		t.Fatalf("tool result is not adjacent to assistant: %+v", msgs)
	}
	if msgs[1].ToolCallID != "tool_call_1" || msgs[1].Content != "result" {
		t.Fatalf("unexpected moved result: %+v", msgs[1])
	}
}

func TestNormalizeQoderMessages_SynthesizesMissingResult(t *testing.T) {
	msgs, _ := normalizeQoderMessages([]core.Message{
		{
			Role: core.RoleAssistant,
			Content: []core.ContentPart{
				{Type: core.PartToolCall, ToolCall: &core.ToolCall{
					ID: "tool_call_1", Name: "read_file", Arguments: json.RawMessage(`{}`),
				}},
			},
		},
		{
			Role: core.RoleUser,
			Content: []core.ContentPart{
				{Type: core.PartText, Text: "continue"},
			},
		},
	})

	if len(msgs) != 3 || msgs[1].Role != "tool" || msgs[1].ToolCallID != "tool_call_1" {
		t.Fatalf("missing tool result was not repaired: %+v", msgs)
	}
	if msgs[1].Content != "" {
		t.Fatalf("synthetic result content = %q, want empty", msgs[1].Content)
	}
}

func TestQoderBuildPayload_ScopesSessionByAccountAndRequest(t *testing.T) {
	connector := NewQoder("qoder", "")
	req := &core.ChatRequest{
		Model: "ultimate",
		Messages: []core.Message{
			{Role: core.RoleUser, Content: []core.ContentPart{
				{Type: core.PartText, Text: "hello"},
			}},
		},
		Metadata: core.RequestMetadata{
			ContextAffinityKey: "conversation-a",
			RequestID:          "request-a",
		},
	}

	first := connector.buildPayload(req, "ultimate", nil, "account-a")
	retry := connector.buildPayload(req, "ultimate", nil, "account-a")
	otherAccount := connector.buildPayload(req, "ultimate", nil, "account-b")

	if first.SessionID != retry.SessionID {
		t.Fatalf("same request should keep session id: %q != %q", first.SessionID, retry.SessionID)
	}
	if first.SessionID == otherAccount.SessionID {
		t.Fatal("different accounts must not share a session id")
	}

	req.Metadata.ContextAffinityKey = ""
	withoutAffinity := connector.buildPayload(req, "ultimate", nil, "account-a")
	req.Metadata.RequestID = "request-b"
	otherRequest := connector.buildPayload(req, "ultimate", nil, "account-a")
	if withoutAffinity.SessionID == otherRequest.SessionID {
		t.Fatal("requests without affinity must not share a session id")
	}
}

func TestCollectQoderChunks_ReassemblesToolCall(t *testing.T) {
	chunks := make(chan core.StreamChunk, 3)
	chunks <- core.StreamChunk{
		Type:  core.ChunkToolCall,
		Index: 0,
		ToolCall: &core.ToolCall{
			ID:        "tool_call_1",
			Name:      "Read",
			Arguments: json.RawMessage(`{"file_path":"`),
		},
	}
	chunks <- core.StreamChunk{
		Type:     core.ChunkToolCall,
		Index:    0,
		ToolCall: &core.ToolCall{Arguments: json.RawMessage(`a.go"}`)},
	}
	chunks <- core.StreamChunk{
		Type:         core.ChunkFinish,
		FinishReason: core.FinishToolCalls,
	}
	close(chunks)

	msg, finishReason, _, err := collectQoderChunks(chunks)
	if err != nil {
		t.Fatalf("collect chunks: %v", err)
	}
	if finishReason != core.FinishToolCalls {
		t.Fatalf("finish reason = %q, want %q", finishReason, core.FinishToolCalls)
	}
	if len(msg.Content) != 1 || msg.Content[0].ToolCall == nil {
		t.Fatalf("expected one complete tool call, got %+v", msg.Content)
	}
	call := msg.Content[0].ToolCall
	if call.ID != "tool_call_1" || call.Name != "Read" ||
		string(call.Arguments) != `{"file_path":"a.go"}` {
		t.Fatalf("unexpected assembled tool call: %+v", call)
	}
}

func TestUnwrapQoderSSELineWithError_SurfacesEnvelopeError(t *testing.T) {
	line := `data: {"statusCodeValue":400,"body":"Invalid tool parameters"}`

	inner, ok, err := unwrapQoderSSELineWithError(line, "qoder", "claude-sonnet-4")
	if inner != "" || ok {
		t.Fatalf("expected no inner payload, got inner=%q ok=%v", inner, ok)
	}

	var pe *core.ProviderError
	if !errors.As(err, &pe) {
		t.Fatalf("expected ProviderError, got %T %v", err, err)
	}
	if pe.Kind != core.ErrBadRequest {
		t.Fatalf("error kind = %v, want %v", pe.Kind, core.ErrBadRequest)
	}
	if pe.StatusCode != 400 {
		t.Fatalf("status = %d, want 400", pe.StatusCode)
	}
	if pe.Message != "Invalid tool parameters" {
		t.Fatalf("message = %q, want Invalid tool parameters", pe.Message)
	}
}
