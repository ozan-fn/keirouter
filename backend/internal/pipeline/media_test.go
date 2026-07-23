package pipeline

import (
	"context"
	"testing"

	"github.com/mydisha/keirouter/backend/internal/core"
	"github.com/mydisha/keirouter/backend/internal/dispatch"
	"github.com/stretchr/testify/require"
)

type chatOnlyVisionConnector struct {
	request *core.ChatRequest
}

func (c *chatOnlyVisionConnector) ID() string            { return "vision-chat" }
func (c *chatOnlyVisionConnector) Dialect() core.Dialect { return core.DialectAnthropic }
func (c *chatOnlyVisionConnector) Chat(_ context.Context, req *core.ChatRequest, _ core.Credentials) (*core.ChatResponse, error) {
	c.request = req
	return &core.ChatResponse{
		Model: req.Model,
		Message: core.Message{
			Role:    core.RoleAssistant,
			Content: []core.ContentPart{{Type: core.PartText, Text: "a cat"}},
		},
		Usage: core.Usage{TotalTokens: 12},
	}, nil
}
func (c *chatOnlyVisionConnector) Stream(context.Context, *core.ChatRequest, core.Credentials, core.StreamConfig) (<-chan core.StreamChunk, error) {
	ch := make(chan core.StreamChunk)
	close(ch)
	return ch, nil
}

func TestUnderstandImageFallsBackToCanonicalChat(t *testing.T) {
	conn := &chatOnlyVisionConnector{}
	resp, err := understandImage(context.Background(), dispatch.Attempt{
		Target: dispatch.Target{Provider: "anthropic", Model: "claude-vision"},
		Conn:   conn,
	}, &core.ImageUnderstandingRequest{
		Model:     "claude-vision",
		Prompt:    "describe",
		Images:    []string{"data:image/png;base64,abc123", "https://example.com/cat.jpg"},
		MaxTokens: 321,
	})
	require.NoError(t, err)
	require.Equal(t, "a cat", resp.Text)
	require.Equal(t, 12, resp.Usage.TotalTokens)
	require.NotNil(t, conn.request.MaxTokens)
	require.Equal(t, 321, *conn.request.MaxTokens)
	require.Len(t, conn.request.Messages[0].Content, 3)

	inline := conn.request.Messages[0].Content[1].Media
	require.Equal(t, "image/png", inline.MIMEType)
	require.Equal(t, "abc123", inline.Data)

	remote := conn.request.Messages[0].Content[2].Media
	require.Equal(t, "https://example.com/cat.jpg", remote.URL)
}
