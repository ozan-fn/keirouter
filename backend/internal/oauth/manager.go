package oauth

import (
	"context"
	"fmt"
	"time"

	"github.com/mydisha/keirouter/backend/internal/store"
	"github.com/mydisha/keirouter/backend/internal/vault"
)

// refreshSkew refreshes a token this long before its actual expiry, so an
// in-flight request never races a just-expired token.
const refreshSkew = 60 * time.Second

// TokenManager refreshes expiring OAuth access tokens just-in-time. It is
// consulted by the dispatcher before opening an account's credentials.
type TokenManager struct {
	vault    *vault.Vault
	accounts *store.AccountRepo
}

// NewTokenManager builds a TokenManager.
func NewTokenManager(v *vault.Vault, accounts *store.AccountRepo) *TokenManager {
	return &TokenManager{vault: v, accounts: accounts}
}

// EnsureFresh returns an account whose OAuth access token is valid, refreshing
// it in place (and persisting the new tokens) when it is expired or about to
// expire. Non-OAuth accounts and accounts without an expiry are returned
// unchanged. A refresh failure is returned so the dispatcher can skip the
// account and fall back.
func (m *TokenManager) EnsureFresh(ctx context.Context, acc store.Account) (store.Account, error) {
	if m == nil || m.vault == nil || m.accounts == nil {
		return acc, nil
	}
	if acc.AuthKind != store.AuthOAuth || acc.TokenExpiresAt == nil {
		return acc, nil
	}
	if time.Until(*acc.TokenExpiresAt) > refreshSkew {
		return acc, nil // still valid
	}

	cfg, ok := ConfigFor(acc.Provider)
	if !ok {
		// No refresh config; let the dispatcher try the (possibly stale) token.
		return acc, nil
	}

	refreshToken, err := m.vault.OpenRefreshToken(acc)
	if err != nil {
		return acc, fmt.Errorf("oauth: no refresh token for account %s: %w", acc.ID, err)
	}

	tokens, err := cfg.Refresh(ctx, refreshToken)
	if err != nil {
		return acc, fmt.Errorf("oauth: refresh failed for account %s: %w", acc.ID, err)
	}

	var expiresAt *time.Time
	if tokens.ExpiresIn > 0 {
		t := time.Now().Add(time.Duration(tokens.ExpiresIn) * time.Second)
		expiresAt = &t
	}

	// Seal the new tokens into the account. Passing nil Metadata preserves the
	// existing provider metadata.
	if err := m.vault.Seal(&acc, vault.NewSecret{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		ExpiresAt:    expiresAt,
	}); err != nil {
		return acc, fmt.Errorf("oauth: seal refreshed token: %w", err)
	}
	acc.TokenExpiresAt = expiresAt

	if err := m.accounts.UpdateTokens(ctx, acc); err != nil {
		return acc, fmt.Errorf("oauth: persist refreshed token: %w", err)
	}
	return acc, nil
}