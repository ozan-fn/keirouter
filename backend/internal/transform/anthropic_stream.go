package transform

import (
	"bytes"
	"fmt"

	json "github.com/mydisha/keirouter/backend/internal/fastjson"

	"github.com/mydisha/keirouter/backend/internal/core"
)

// Anthropic streams a sequence of typed SSE events rather than uniform chunks:
//
//	message_start → content_block_start → content_block_delta* →
//	content_block_stop → message_delta → message_stop
//
// ParseStreamLine maps the data payload of each event to canonical chunks, and
// RenderStreamChunk produces the corresponding event sequence for a client that
// speaks Anthropic.

type antStreamEvent struct {
	Type  string `json:"type"`
	Index int    `json:"index"`
	Delta struct {
		Type        string `json:"type"`
		Text        string `json:"text"`
		Thinking    string `json:"thinking"`
		Signature   string `json:"signature"`
		PartialJSON string `json:"partial_json"`
		StopReason  string `json:"stop_reason"`
	} `json:"delta"`
	ContentBlock struct {
		Type string `json:"type"`
		ID   string `json:"id"`
		Name string `json:"name"`
		Text string `json:"text"`
	} `json:"content_block"`
	Usage *struct {
		InputTokens              int `json:"input_tokens"`
		OutputTokens             int `json:"output_tokens"`
		CacheReadInputTokens     int `json:"cache_read_input_tokens"`
		CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
	} `json:"usage"`
	Message *struct {
		Usage struct {
			InputTokens              int `json:"input_tokens"`
			OutputTokens             int `json:"output_tokens"`
			CacheReadInputTokens     int `json:"cache_read_input_tokens"`
			CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
		} `json:"usage"`
	} `json:"message"`
}

// ParseStreamLine converts one Anthropic SSE data payload into canonical chunks.
func (AnthropicCodec) ParseStreamLine(line []byte, _ string) ([]core.StreamChunk, error) {
	line = bytes.TrimSpace(line)
	if len(line) == 0 {
		return nil, nil
	}

	var ev antStreamEvent
	if err := json.Unmarshal(line, &ev); err != nil {
		return nil, fmt.Errorf("anthropic: parse stream event: %w", err)
	}

	switch ev.Type {
	case "content_block_start":
		if ev.ContentBlock.Type == "tool_use" {
			return []core.StreamChunk{{
				Type:  core.ChunkToolCall,
				Index: ev.Index,
				ToolCall: &core.ToolCall{
					ID:        ev.ContentBlock.ID,
					Name:      ev.ContentBlock.Name,
					Arguments: json.RawMessage("{}"),
				},
			}}, nil
		}
		return nil, nil

	case "content_block_delta":
		switch ev.Delta.Type {
		case "text_delta":
			return []core.StreamChunk{{Type: core.ChunkText, Delta: ev.Delta.Text}}, nil
		case "thinking_delta":
			return []core.StreamChunk{{Type: core.ChunkThinking, Delta: ev.Delta.Thinking}}, nil
		case "signature_delta":
			return []core.StreamChunk{{Type: core.ChunkThinking, Signature: ev.Delta.Signature}}, nil
		case "input_json_delta":
			return []core.StreamChunk{{
				Type:     core.ChunkToolCall,
				Index:    ev.Index,
				ToolCall: &core.ToolCall{Arguments: json.RawMessage(ev.Delta.PartialJSON)},
			}}, nil
		}
		return nil, nil

	case "message_delta":
		var chunks []core.StreamChunk
		if ev.Delta.StopReason != "" {
			chunks = append(chunks, core.StreamChunk{
				Type:         core.ChunkFinish,
				FinishReason: mapAntStop(ev.Delta.StopReason),
			})
		}
		if ev.Usage != nil {
			promptTokens := ev.Usage.InputTokens + ev.Usage.CacheReadInputTokens + ev.Usage.CacheCreationInputTokens
			chunks = append(chunks, core.StreamChunk{
				Type: core.ChunkUsage,
				Usage: &core.Usage{
					CompletionTokens: ev.Usage.OutputTokens,
					PromptTokens:     promptTokens,
					TotalTokens:      promptTokens + ev.Usage.OutputTokens,
					CachedTokens:     ev.Usage.CacheReadInputTokens,
					CacheWriteTokens: ev.Usage.CacheCreationInputTokens,
					Source:           core.UsageSourceProvider,
				},
			})
		}
		return chunks, nil

	case "message_start":
		if ev.Message != nil {
			promptTokens := ev.Message.Usage.InputTokens + ev.Message.Usage.CacheReadInputTokens + ev.Message.Usage.CacheCreationInputTokens
			return []core.StreamChunk{{
				Type: core.ChunkUsage,
				Usage: &core.Usage{
					PromptTokens:     promptTokens,
					CompletionTokens: ev.Message.Usage.OutputTokens,
					TotalTokens:      promptTokens + ev.Message.Usage.OutputTokens,
					CachedTokens:     ev.Message.Usage.CacheReadInputTokens,
					CacheWriteTokens: ev.Message.Usage.CacheCreationInputTokens,
					Source:           core.UsageSourceProvider,
				},
			}}, nil
		}
		return nil, nil

	default:
		// message_stop, content_block_stop, ping: nothing canonical to emit.
		return nil, nil
	}
}

// RenderStreamChunk emits Anthropic event(s) for a canonical chunk. It lazily
// opens the message and a text content block on first text delta.
func (AnthropicCodec) RenderStreamChunk(chunk core.StreamChunk, state *StreamState) ([][]byte, error) {
	var events [][]byte

	ensureOpen := func() {
		if state.SentRole {
			return
		}
		state.SentRole = true
		events = append(events, antEvent("message_start", map[string]any{
			"type": "message_start",
			"message": map[string]any{
				"id": firstNonEmpty(state.MessageID, "msg_stream"), "type": "message",
				"role": "assistant", "model": state.Model, "content": []any{},
				"stop_reason": nil, "usage": map[string]int{"input_tokens": 0, "output_tokens": 0},
			},
		}))
	}

	closeThinkingBlock := func() {
		if thinkOpen, _ := state.Custom["think_open"].(bool); thinkOpen {
			idx := state.Custom["think_index"]
			sig, _ := state.Custom["think_signature"].(string)
			// Only emit signature_delta if we have a non-empty signature from upstream.
			if sig != "" {
				events = append(events, antEvent("content_block_delta", map[string]any{
					"type": "content_block_delta", "index": idx,
					"delta": map[string]any{"type": "signature_delta", "signature": sig},
				}))
			}
			events = append(events, antEvent("content_block_stop", map[string]any{
				"type": "content_block_stop", "index": idx,
			}))
			state.Custom["think_open"] = false
		}
	}

	switch chunk.Type {
	case core.ChunkText:
		ensureOpen()
		// Close any open thinking block before starting/continuing text.
		closeThinkingBlock()
		// Close any open tool block before starting/continuing text.
		if toolOpen, _ := state.Custom["tool_open"].(bool); toolOpen {
			events = append(events, antEvent("content_block_stop", map[string]any{
				"type": "content_block_stop", "index": state.ToolIndex,
			}))
			state.Custom["tool_open"] = false
			state.ToolIndex++
		}
		if !state.OpenedBlock {
			state.OpenedBlock = true
			if state.Custom == nil {
				state.Custom = map[string]any{}
			}
			state.Custom["text_index"] = state.ToolIndex
			events = append(events, antEvent("content_block_start", map[string]any{
				"type": "content_block_start", "index": state.ToolIndex,
				"content_block": map[string]any{"type": "text", "text": ""},
			}))
			state.ToolIndex++
		}
		events = append(events, antEvent("content_block_delta", map[string]any{
			"type": "content_block_delta", "index": state.Custom["text_index"],
			"delta": map[string]any{"type": "text_delta", "text": chunk.Delta},
		}))

	case core.ChunkThinking:
		ensureOpen()
		// Close any open tool block before starting/continuing thinking.
		if toolOpen, _ := state.Custom["tool_open"].(bool); toolOpen {
			events = append(events, antEvent("content_block_stop", map[string]any{
				"type": "content_block_stop", "index": state.ToolIndex,
			}))
			state.Custom["tool_open"] = false
			state.ToolIndex++
		}
		// Open thinking block if not already open.
		if state.Custom == nil {
			state.Custom = map[string]any{}
		}
		if thinkOpen, _ := state.Custom["think_open"].(bool); !thinkOpen {
			state.Custom["think_open"] = true
			state.Custom["think_index"] = state.ToolIndex
			events = append(events, antEvent("content_block_start", map[string]any{
				"type": "content_block_start", "index": state.ToolIndex,
				"content_block": map[string]any{"type": "thinking", "thinking": "", "signature": ""},
			}))
			state.ToolIndex++
		}
		// Store signature from upstream (signature_delta event).
		if chunk.Signature != "" {
			state.Custom["think_signature"] = chunk.Signature
		}
		// Emit thinking delta (skip signature-only chunks).
		if chunk.Delta != "" {
			events = append(events, antEvent("content_block_delta", map[string]any{
				"type": "content_block_delta", "index": state.Custom["think_index"],
				"delta": map[string]any{"type": "thinking_delta", "thinking": chunk.Delta},
			}))
		}

	case core.ChunkToolCall:
		ensureOpen()
		if chunk.ToolCall == nil {
			break
		}
		// Close any open thinking block before starting tool use.
		closeThinkingBlock()

		// First chunk for a tool call (carries ID and Name) — open a new
		// tool_use content block. Close any previously open tool block first.
		// Open a new tool_use block only when the ID actually changes. Some
		// upstreams (e.g. Kiro) repeat the same tool ID on the arguments
		// continuation chunk; treating a repeated ID as a new block would
		// close the real block with empty input and open a nameless duplicate.
		if chunk.ToolCall.ID != "" {
			openID, _ := state.Custom["tool_id"].(string)
			if openID != chunk.ToolCall.ID {
				if toolOpen, _ := state.Custom["tool_open"].(bool); toolOpen {
					events = append(events, antEvent("content_block_stop", map[string]any{
						"type": "content_block_stop", "index": state.ToolIndex,
					}))
					state.ToolIndex++
				}
				if state.Custom == nil {
					state.Custom = map[string]any{}
				}
				state.Custom["tool_open"] = true
				state.Custom["tool_id"] = chunk.ToolCall.ID
				events = append(events, antEvent("content_block_start", map[string]any{
					"type":  "content_block_start",
					"index": state.ToolIndex,
					"content_block": map[string]any{
						"type":  "tool_use",
						"id":    chunk.ToolCall.ID,
						"name":  chunk.ToolCall.Name,
						"input": map[string]any{},
					},
				}))
			}
		}

		// Emit argument deltas (skip empty ones). Partial JSON fragments
		// from upstream streaming are not individually valid objects, so
		// they must not be normalized — the client reassembles them.
		if toolOpen, _ := state.Custom["tool_open"].(bool); toolOpen {
			args := string(chunk.ToolCall.Arguments)
			if args != "" && args != "{}" && args != "[]" {
				events = append(events, antEvent("content_block_delta", map[string]any{
					"type":  "content_block_delta",
					"index": state.ToolIndex,
					"delta": map[string]any{
						"type":         "input_json_delta",
						"partial_json": args,
					},
				}))
			}
		}

	case core.ChunkFinish:
		// Close any open thinking block, then tool block, then text block.
		closeThinkingBlock()
		if toolOpen, _ := state.Custom["tool_open"].(bool); toolOpen {
			events = append(events, antEvent("content_block_stop", map[string]any{
				"type": "content_block_stop", "index": state.ToolIndex,
			}))
			state.Custom["tool_open"] = false
		}
		if state.OpenedBlock {
			events = append(events, antEvent("content_block_stop", map[string]any{
				"type": "content_block_stop", "index": state.Custom["text_index"],
			}))
		}
		// Mark that finish was processed so RenderStreamDone doesn't emit message_delta again.
		if state.Custom == nil {
			state.Custom = map[string]any{}
		}
		state.Custom["finish_sent"] = true
		events = append(events, antEvent("message_delta", map[string]any{
			"type":  "message_delta",
			"delta": map[string]any{"stop_reason": renderAntStop(chunk.FinishReason)},
			"usage": map[string]int{"output_tokens": 0},
		}))

	default:
		return nil, nil
	}
	return events, nil
}

// RenderStreamDone closes any open blocks, emits message_delta, then emits the terminal message_stop event.
func (AnthropicCodec) RenderStreamDone(state *StreamState) [][]byte {
	var events [][]byte
	
	if state == nil || state.Custom == nil {
		// Emit message_delta + message_stop if no state
		events = append(events, antEvent("message_delta", map[string]any{
			"type":  "message_delta",
			"delta": map[string]any{"stop_reason": "end_turn"},
			"usage": map[string]int{"output_tokens": 0},
		}))
		events = append(events, antEvent("message_stop", map[string]any{"type": "message_stop"}))
		return [][]byte(events)
	}
	
	// Close any open thinking block.
	if thinkOpen, _ := state.Custom["think_open"].(bool); thinkOpen {
		idx := state.Custom["think_index"]
		sig, _ := state.Custom["think_signature"].(string)
		// Only emit signature_delta if we have a non-empty signature from upstream.
		if sig != "" {
			events = append(events, antEvent("content_block_delta", map[string]any{
				"type": "content_block_delta", "index": idx,
				"delta": map[string]any{"type": "signature_delta", "signature": sig},
			}))
		}
		events = append(events, antEvent("content_block_stop", map[string]any{
			"type": "content_block_stop", "index": idx,
		}))
	}
	
	// Close any open tool block.
	if toolOpen, _ := state.Custom["tool_open"].(bool); toolOpen {
		events = append(events, antEvent("content_block_stop", map[string]any{
			"type": "content_block_stop", "index": state.ToolIndex,
		}))
	}
	
	// Close any open text block.
	if state.OpenedBlock {
		if textIdx, ok := state.Custom["text_index"]; ok {
			events = append(events, antEvent("content_block_stop", map[string]any{
				"type": "content_block_stop", "index": textIdx,
			}))
		}
	}
	
	// Emit message_delta with stop_reason and usage (required before message_stop).
	// Skip if ChunkFinish already sent it (avoid double message_delta).
	if finishSent, _ := state.Custom["finish_sent"].(bool); !finishSent {
		events = append(events, antEvent("message_delta", map[string]any{
			"type":  "message_delta",
			"delta": map[string]any{"stop_reason": "end_turn"},
			"usage": map[string]int{"output_tokens": 0},
		}))
	}
	
	// Emit terminal message_stop.
	events = append(events, antEvent("message_stop", map[string]any{"type": "message_stop"}))
	
	return [][]byte(events)
}

// antEvent formats a named Anthropic SSE event: "event: <name>\ndata: <json>\n\n".
func antEvent(name string, payload map[string]any) []byte {
	b, _ := json.Marshal(payload)
	out := make([]byte, 0, len(name)+len(b)+20)
	out = append(out, "event: "...)
	out = append(out, name...)
	out = append(out, '\n')
	out = append(out, "data: "...)
	out = append(out, b...)
	out = append(out, '\n', '\n')
	return out
}
