package pipeline

import (
	"context"
	"testing"
	"time"

	"github.com/mydisha/keirouter/backend/internal/config"
	"github.com/mydisha/keirouter/backend/internal/core"
	"github.com/mydisha/keirouter/backend/internal/crypto"
	"github.com/mydisha/keirouter/backend/internal/dispatch"
	"github.com/mydisha/keirouter/backend/internal/store"
	"github.com/mydisha/keirouter/backend/internal/vault"
	"github.com/stretchr/testify/require"
)

type plannerConnectorSource struct{ conn core.Connector }

func (s plannerConnectorSource) Get(string) (core.Connector, error) { return s.conn, nil }

type plannerConnector struct{}

func (plannerConnector) ID() string            { return "openai" }
func (plannerConnector) Dialect() core.Dialect { return core.DialectOpenAI }
func (plannerConnector) Chat(context.Context, *core.ChatRequest, core.Credentials) (*core.ChatResponse, error) {
	return nil, nil
}
func (plannerConnector) Stream(context.Context, *core.ChatRequest, core.Credentials, core.StreamConfig) (<-chan core.StreamChunk, error) {
	ch := make(chan core.StreamChunk)
	close(ch)
	return ch, nil
}

func newPlannerDispatcher(t *testing.T) *dispatch.Dispatcher {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(ctx, config.DatabaseConfig{Driver: "sqlite", DSN: ":memory:"}, t.TempDir())
	require.NoError(t, err)
	require.NoError(t, db.Migrate(ctx))
	require.NoError(t, db.Tenants().EnsureDefault(ctx))
	t.Cleanup(func() { _ = db.Close() })

	key, err := crypto.GenerateMasterKey()
	require.NoError(t, err)
	sealer, err := crypto.NewSealer(key)
	require.NoError(t, err)
	secrets := vault.New(sealer)

	for i, id := range []string{"acc-1", "acc-2"} {
		now := time.Now()
		account := store.Account{
			ID: id, TenantID: store.DefaultTenantID, Provider: "openai",
			Label: id, AuthKind: store.AuthAPIKey, Priority: (i + 1) * 10,
			Metadata: "{}", CreatedAt: now, UpdatedAt: now,
		}
		require.NoError(t, secrets.Seal(&account, vault.NewSecret{APIKey: "sk-test"}))
		require.NoError(t, db.Accounts().Create(ctx, account))
	}

	d := dispatch.New(plannerConnectorSource{conn: plannerConnector{}}, db.Accounts(), secrets)
	d.SetRoutingSource(db.Routing())
	return d
}

func TestAttemptPlannerModelFailureKeepsAccountAvailableForNextModel(t *testing.T) {
	ctx := context.Background()
	d := newPlannerDispatcher(t)
	targets := []dispatch.Target{
		{Provider: "openai", Model: "gpt-4o"},
		{Provider: "openai", Model: "gpt-5"},
	}
	initial, err := d.Plan(ctx, store.DefaultTenantID, targets, core.NewCapabilitySet())
	require.NoError(t, err)
	planner := newAttemptPlanner(d, store.DefaultTenantID, targets, core.NewCapabilitySet(), dispatch.PlanOptions{}, initial)

	first, ok := planner.Current()
	require.True(t, ok)
	require.Equal(t, "acc-1", first.Account.ID)
	require.Equal(t, "gpt-4o", first.Target.Model)

	second, ok := planner.AfterFailure(ctx, first, &core.ProviderError{Kind: core.ErrModelUnavailable})
	require.True(t, ok)
	require.Equal(t, "acc-2", second.Account.ID)
	require.Equal(t, "gpt-4o", second.Target.Model)

	third, ok := planner.AfterFailure(ctx, second, &core.ProviderError{Kind: core.ErrModelUnavailable})
	require.True(t, ok)
	require.Equal(t, "acc-1", third.Account.ID)
	require.Equal(t, "gpt-5", third.Target.Model)
}

func TestAttemptPlannerAccountFailureSkipsCredentialAcrossModels(t *testing.T) {
	ctx := context.Background()
	d := newPlannerDispatcher(t)
	targets := []dispatch.Target{
		{Provider: "openai", Model: "gpt-4o"},
		{Provider: "openai", Model: "gpt-5"},
	}
	initial, err := d.Plan(ctx, store.DefaultTenantID, targets, core.NewCapabilitySet())
	require.NoError(t, err)
	planner := newAttemptPlanner(d, store.DefaultTenantID, targets, core.NewCapabilitySet(), dispatch.PlanOptions{}, initial)

	first, ok := planner.Current()
	require.True(t, ok)
	second, ok := planner.AfterFailure(ctx, first, &core.ProviderError{Kind: core.ErrAuth})
	require.True(t, ok)
	require.Equal(t, "acc-2", second.Account.ID)

	_, ok = planner.AfterFailure(ctx, second, &core.ProviderError{Kind: core.ErrAuth})
	require.False(t, ok)
}
