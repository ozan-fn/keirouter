package connectors

import (
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/mydisha/keirouter/backend/internal/core"
	"github.com/stretchr/testify/require"
)

func TestLooksLikeQuotaExhausted(t *testing.T) {
	tests := []struct {
		body string
		want bool
	}{
		{"", false},
		{"rate limit exceeded", false},
		{"too many requests", false},
		{"daily limit reached", true},
		{"daily quota exceeded", true},
		{"daily free allocation used", true},
		{"monthly limit reached", true},
		{"per day limit exceeded", true},
		{"per month limit reached", true},
		{"quota exceed", false},
		{"exceed quota", false},
		{"requests per minute quota exceeded", false},
		{"insufficient quota", true},
		{"billing cap reached", true},
		{"credit exhaust", true},
		{"out of credits", true},
		{"hard limit", true},
		{"plan limit", true},
		{"subscription limit", true},
		{"weekly quota", true},
		{"session limit", true},
		{"Rate limit exceeded", false}, // case insensitive check — should NOT match quota
		{"RATE LIMIT", false},
	}

	for _, tt := range tests {
		t.Run(tt.body, func(t *testing.T) {
			if got := looksLikeQuotaExhausted(tt.body); got != tt.want {
				t.Errorf("looksLikeQuotaExhausted(%q) = %v, want %v", tt.body, got, tt.want)
			}
		})
	}
}

func TestParseResetFromBody(t *testing.T) {
	tests := []struct {
		name string
		body string
		want time.Duration
	}{
		{
			name: "nested retry after seconds",
			body: `{"error":{"retry_after":2.5}}`,
			want: 2500 * time.Millisecond,
		},
		{
			name: "camel case retry after duration",
			body: `{"retryAfter":"3s"}`,
			want: 3 * time.Second,
		},
		{
			name: "past reset ignored",
			body: `{"resetAt":1000000001}`,
			want: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := parseResetFromBody([]byte(tt.body)); got != tt.want {
				t.Fatalf("parseResetFromBody() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestLooksLikeRateLimit(t *testing.T) {
	tests := []struct {
		body string
		want bool
	}{
		{"", false},
		{"rate limit exceeded", true},
		{"too many requests", true},
		{"requests per minute", true},
		{"RPM exceeded", true},
		{"TPM limit", true},
		{"concurrent requests", true},
		{"throttled", true},
		{"daily quota", false},
	}

	for _, tt := range tests {
		t.Run(tt.body, func(t *testing.T) {
			if got := looksLikeRateLimit(tt.body); got != tt.want {
				t.Errorf("looksLikeRateLimit(%q) = %v, want %v", tt.body, got, tt.want)
			}
		})
	}
}

func TestClassify429_QuotaExhausted(t *testing.T) {
	resp := &http.Response{Header: http.Header{}}
	resp.Header.Set("Content-Type", "application/json")

	body := []byte(`{"error": {"message": "daily free allocation used up", "type": "quota_error"}}`)
	kind, retryAfter := classify429(resp, body)

	require.Equal(t, core.ErrQuotaExhausted, kind)
	require.Equal(t, 30*time.Minute, retryAfter, "default quota cooldown should be 30m")
}

func TestClassify429_QuotaExhausted_WithRetryAfter(t *testing.T) {
	resp := &http.Response{Header: http.Header{}}
	resp.Header.Set("Retry-After", "3600")

	body := []byte(`{"error": {"message": "monthly quota exceeded"}}`)
	kind, retryAfter := classify429(resp, body)

	require.Equal(t, core.ErrQuotaExhausted, kind)
	require.Equal(t, time.Hour, retryAfter, "should use upstream Retry-After for quota")
}

func TestClassify429_RateLimit(t *testing.T) {
	resp := &http.Response{Header: http.Header{}}

	body := []byte(`{"error": {"message": "too many requests", "type": "rate_limit"}}`)
	kind, retryAfter := classify429(resp, body)

	require.Equal(t, core.ErrRateLimit, kind)
	require.Equal(t, 5*time.Second, retryAfter, "default rate-limit backoff should be 5s")
}

func TestClassify429_RateLimit_WithRetryAfter(t *testing.T) {
	resp := &http.Response{Header: http.Header{}}
	resp.Header.Set("Retry-After", "10")

	body := []byte(`{"error": {"message": "rate limit exceeded"}}`)
	kind, retryAfter := classify429(resp, body)

	require.Equal(t, core.ErrRateLimit, kind)
	require.Equal(t, 10*time.Second, retryAfter)
}

func TestClassify429_XRateLimitReset(t *testing.T) {
	resp := &http.Response{Header: http.Header{}}
	// Set reset to 60 seconds from now.
	resetTime := time.Now().Add(60 * time.Second).Unix()
	resp.Header.Set("X-RateLimit-Reset", strconv.FormatInt(resetTime, 10))

	body := []byte(`{"error": {"message": "rate limit"}}`)
	kind, retryAfter := classify429(resp, body)

	require.Equal(t, core.ErrRateLimit, kind)
	require.True(t, retryAfter > 55*time.Second && retryAfter <= 60*time.Second,
		"retryAfter should be ~60s, got %v", retryAfter)
}

func TestHTTPStatusError_429Quota(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusTooManyRequests,
		Header:     http.Header{},
	}
	body := []byte(`{"error": {"message": "daily limit reached"}}`)

	err := httpStatusError("test", "model", resp, body)
	pe := core.AsProviderError(err)

	require.Equal(t, core.ErrQuotaExhausted, pe.Kind)
	require.Equal(t, 30*time.Minute, pe.RetryAfter)
}

func TestHTTPStatusError_429RateLimit(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusTooManyRequests,
		Header:     http.Header{},
	}
	body := []byte(`{"error": {"message": "too many requests"}}`)

	err := httpStatusError("test", "model", resp, body)
	pe := core.AsProviderError(err)

	require.Equal(t, core.ErrRateLimit, pe.Kind)
	require.Equal(t, 5*time.Second, pe.RetryAfter)
}

func TestHTTPStatusError_429RateLimit_RetryAfter(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusTooManyRequests,
		Header:     http.Header{},
	}
	resp.Header.Set("Retry-After", "120")
	body := []byte(`{"error": {"message": "rate limit"}}`)

	err := httpStatusError("test", "model", resp, body)
	pe := core.AsProviderError(err)

	require.Equal(t, core.ErrRateLimit, pe.Kind)
	require.Equal(t, 2*time.Minute, pe.RetryAfter)
}
