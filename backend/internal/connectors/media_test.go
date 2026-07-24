package connectors

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mydisha/keirouter/backend/internal/core"
	"github.com/stretchr/testify/require"
)

func TestOpenAICompatible_GenerateVideo(t *testing.T) {
	var gotBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/videos/generations", r.URL.Path)
		require.Equal(t, "Bearer sk-test", r.Header.Get("Authorization"))
		gotBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"request_id":"vid_123","status":"queued"}`)
	}))
	defer srv.Close()

	c := NewOpenAICompatible("xai", srv.URL)
	raw := []byte(`{"model":"public-video-alias","prompt":"a cat","aspect_ratio":"16:9"}`)
	resp, err := c.GenerateVideo(context.Background(),
		&core.VideoRequest{Model: "grok-imagine-video", Body: raw},
		core.Credentials{APIKey: "sk-test"})
	require.NoError(t, err)
	require.JSONEq(t,
		`{"model":"grok-imagine-video","prompt":"a cat","aspect_ratio":"16:9"}`,
		string(gotBody))
	require.Equal(t, "vid_123", resp.RequestID)
	require.Equal(t, "queued", resp.Status)
	require.NotEmpty(t, resp.Raw)
}

func TestOpenAICompatible_PollVideo(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/videos/vid_123", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"id":"vid_123","status":"completed","url":"https://cdn.example/out.mp4"}`)
	}))
	defer srv.Close()

	c := NewOpenAICompatible("xai", srv.URL)
	resp, err := c.PollVideo(context.Background(),
		&core.VideoStatusRequest{Model: "grok-imagine-video", RequestID: "vid_123"},
		core.Credentials{APIKey: "sk-test"})
	require.NoError(t, err)
	require.Equal(t, "vid_123", resp.RequestID)
	require.Equal(t, "completed", resp.Status)
	require.Equal(t, "https://cdn.example/out.mp4", resp.URL)
}

func TestOpenAICompatible_UnderstandImage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/chat/completions", r.URL.Path)
		body, _ := io.ReadAll(r.Body)
		var payload struct {
			Model    string `json:"model"`
			Messages []struct {
				Role    string `json:"role"`
				Content []struct {
					Type     string `json:"type"`
					Text     string `json:"text"`
					ImageURL struct {
						URL string `json:"url"`
					} `json:"image_url"`
				} `json:"content"`
			} `json:"messages"`
		}
		require.NoError(t, json.Unmarshal(body, &payload))
		require.Equal(t, "gpt-4o", payload.Model)
		require.Len(t, payload.Messages, 1)
		parts := payload.Messages[0].Content
		require.Len(t, parts, 2)
		require.Equal(t, "text", parts[0].Type)
		require.Equal(t, "what is this?", parts[0].Text)
		require.Equal(t, "image_url", parts[1].Type)
		require.True(t, strings.HasPrefix(parts[1].ImageURL.URL, "https://"))
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"role":"assistant","content":"a red apple"}}],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14}}`)
	}))
	defer srv.Close()

	c := NewOpenAICompatible("openai", srv.URL)
	resp, err := c.UnderstandImage(context.Background(),
		&core.ImageUnderstandingRequest{
			Model:  "gpt-4o",
			Prompt: "what is this?",
			Images: []string{"https://example.com/apple.png"},
		},
		core.Credentials{APIKey: "sk-test"})
	require.NoError(t, err)
	require.Equal(t, "a red apple", resp.Text)
	require.Equal(t, 14, resp.Usage.TotalTokens)
}

// Compile-time assertions that the OpenAI-compatible connector satisfies the
// new capability interfaces.
var (
	_ core.VideoConnector              = (*OpenAICompatible)(nil)
	_ core.ImageUnderstandingConnector = (*OpenAICompatible)(nil)
)
