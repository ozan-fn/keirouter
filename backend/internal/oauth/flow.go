package oauth

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// httpClient is shared across OAuth calls; per-request deadlines come from ctx.
var httpClient = &http.Client{Timeout: 30 * time.Second}

// AuthURL builds the provider authorize URL for an authorization-code(+PKCE)
// flow. challenge is empty for non-PKCE flows.
func (c ProviderConfig) AuthURL(redirectURI, state, challenge string) string {
	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", c.ClientID)
	q.Set("redirect_uri", redirectURI)
	if len(c.Scopes) > 0 {
		q.Set("scope", strings.Join(c.Scopes, " "))
	}
	q.Set("state", state)
	if c.Flow == FlowAuthCodePKCE && challenge != "" {
		q.Set("code_challenge", challenge)
		q.Set("code_challenge_method", "S256")
	}
	for k, v := range c.ExtraAuthParams {
		q.Set(k, v)
	}
	return c.AuthorizeURL + "?" + q.Encode()
}

// ExchangeCode swaps an authorization code for tokens. verifier is the PKCE
// verifier (ignored for non-PKCE flows).
func (c ProviderConfig) ExchangeCode(ctx context.Context, code, redirectURI, verifier string) (*Tokens, error) {
	// Some providers (Claude) append "#state" to the pasted code.
	if i := strings.Index(code, "#"); i >= 0 {
		code = code[:i]
	}

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", c.ClientID)
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	if c.Flow == FlowAuthCodePKCE && verifier != "" {
		form.Set("code_verifier", verifier)
	}
	if c.ClientSecret != "" && !c.UsesBasicAuth {
		form.Set("client_secret", c.ClientSecret)
	}

	raw, err := c.tokenRequest(ctx, c.TokenURL, form)
	if err != nil {
		return nil, err
	}
	return mapTokenResponse(raw)
}

// DeviceCode is the response of a device-authorization request.
type DeviceCode struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	// VerificationURIComplete embeds the user code for one-click verification.
	VerificationURIComplete string `json:"verification_uri_complete"`
	ExpiresIn               int    `json:"expires_in"`
	Interval                int    `json:"interval"`
}

// RequestDeviceCode starts a device-authorization grant. challenge is the PKCE
// challenge for providers that combine device-code with PKCE (qwen).
func (c ProviderConfig) RequestDeviceCode(ctx context.Context, challenge string) (*DeviceCode, error) {
	form := url.Values{}
	form.Set("client_id", c.ClientID)
	if len(c.Scopes) > 0 {
		form.Set("scope", strings.Join(c.Scopes, " "))
	}
	if challenge != "" {
		form.Set("code_challenge", challenge)
		form.Set("code_challenge_method", "S256")
	}

	raw, err := c.tokenRequest(ctx, c.DeviceCodeURL, form)
	if err != nil {
		return nil, err
	}
	var dc DeviceCode
	if err := json.Unmarshal(raw, &dc); err != nil {
		return nil, fmt.Errorf("oauth: parse device code: %w", err)
	}
	if dc.Interval <= 0 {
		dc.Interval = 5
	}
	return &dc, nil
}

// PollResult reports the outcome of a single device-code poll.
type PollResult struct {
	// Done is true when tokens were granted.
	Done   bool
	Tokens *Tokens
	// Pending is true when the user has not yet authorized (keep polling).
	Pending bool
	// SlowDown asks the caller to increase the poll interval.
	SlowDown bool
	// Err is a terminal error (expired, denied).
	Err error
}

// PollDeviceToken performs one poll of the device-code token endpoint.
func (c ProviderConfig) PollDeviceToken(ctx context.Context, deviceCode, verifier string) PollResult {
	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:device_code")
	form.Set("client_id", c.ClientID)
	form.Set("device_code", deviceCode)
	if verifier != "" {
		form.Set("code_verifier", verifier)
	}

	raw, status, err := c.tokenRequestStatus(ctx, c.TokenURL, form)
	if err != nil {
		return PollResult{Err: err}
	}

	var parsed struct {
		AccessToken      string `json:"access_token"`
		RefreshToken     string `json:"refresh_token"`
		ExpiresIn        int    `json:"expires_in"`
		Scope            string `json:"scope"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	_ = json.Unmarshal(raw, &parsed)

	if parsed.AccessToken != "" {
		return PollResult{Done: true, Tokens: &Tokens{
			AccessToken:  parsed.AccessToken,
			RefreshToken: parsed.RefreshToken,
			ExpiresIn:    parsed.ExpiresIn,
			Scope:        parsed.Scope,
		}}
	}

	switch parsed.Error {
	case "authorization_pending", "":
		if status == http.StatusOK && parsed.AccessToken == "" {
			return PollResult{Pending: true}
		}
		if parsed.Error == "authorization_pending" {
			return PollResult{Pending: true}
		}
		return PollResult{Pending: true}
	case "slow_down":
		return PollResult{Pending: true, SlowDown: true}
	case "expired_token", "access_denied":
		return PollResult{Err: fmt.Errorf("oauth: %s: %s", parsed.Error, parsed.ErrorDescription)}
	default:
		return PollResult{Err: fmt.Errorf("oauth: device poll failed: %s %s", parsed.Error, parsed.ErrorDescription)}
	}
}

// Refresh exchanges a refresh token for a new access token.
func (c ProviderConfig) Refresh(ctx context.Context, refreshToken string) (*Tokens, error) {
	if refreshToken == "" {
		return nil, fmt.Errorf("oauth: no refresh token available")
	}
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("client_id", c.ClientID)
	form.Set("refresh_token", refreshToken)
	if c.ClientSecret != "" && !c.UsesBasicAuth {
		form.Set("client_secret", c.ClientSecret)
	}

	raw, err := c.tokenRequest(ctx, c.refreshURL(), form)
	if err != nil {
		return nil, err
	}
	t, err := mapTokenResponse(raw)
	if err != nil {
		return nil, err
	}
	// Providers may omit a new refresh token; keep the existing one.
	if t.RefreshToken == "" {
		t.RefreshToken = refreshToken
	}
	return t, nil
}

// tokenRequest posts a token-endpoint request and returns the body, erroring on
// non-2xx responses.
func (c ProviderConfig) tokenRequest(ctx context.Context, endpoint string, form url.Values) ([]byte, error) {
	raw, status, err := c.tokenRequestStatus(ctx, endpoint, form)
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("oauth: token endpoint returned %d: %s", status, truncate(raw, 300))
	}
	return raw, nil
}

// tokenRequestStatus posts a token request and returns the body + status,
// honoring the provider's content-type and Basic auth preferences.
func (c ProviderConfig) tokenRequestStatus(ctx context.Context, endpoint string, form url.Values) ([]byte, int, error) {
	var (
		req *http.Request
		err error
	)
	if c.TokenContentType == "json" {
		// Build a JSON body from the form values.
		obj := map[string]string{}
		for k := range form {
			obj[k] = form.Get(k)
		}
		body, _ := json.Marshal(obj)
		req, err = http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(body)))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
		}
	} else {
		req, err = http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
		if err == nil {
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
	}
	if err != nil {
		return nil, 0, fmt.Errorf("oauth: build token request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	if c.UsesBasicAuth && c.ClientSecret != "" {
		cred := base64.StdEncoding.EncodeToString([]byte(c.ClientID + ":" + c.ClientSecret))
		req.Header.Set("Authorization", "Basic "+cred)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("oauth: token request: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("oauth: read token response: %w", err)
	}
	return body, resp.StatusCode, nil
}

// mapTokenResponse normalizes a standard OAuth token JSON body into Tokens.
func mapTokenResponse(raw []byte) (*Tokens, error) {
	var parsed struct {
		AccessToken      string `json:"access_token"`
		RefreshToken     string `json:"refresh_token"`
		ExpiresIn        int    `json:"expires_in"`
		Scope            string `json:"scope"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("oauth: parse token response: %w", err)
	}
	if parsed.Error != "" {
		return nil, fmt.Errorf("oauth: %s: %s", parsed.Error, parsed.ErrorDescription)
	}
	if parsed.AccessToken == "" {
		return nil, fmt.Errorf("oauth: token response missing access_token")
	}
	return &Tokens{
		AccessToken:  parsed.AccessToken,
		RefreshToken: parsed.RefreshToken,
		ExpiresIn:    parsed.ExpiresIn,
		Scope:        parsed.Scope,
	}, nil
}

func truncate(b []byte, max int) string {
	s := strings.TrimSpace(string(b))
	if len(s) > max {
		return s[:max] + "…"
	}
	return s
}