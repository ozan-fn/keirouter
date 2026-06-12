package guardrails

import (
	"context"
	"log/slog"
	"strings"

	"github.com/mydisha/keirouter/backend/internal/core"
	"github.com/mydisha/keirouter/backend/internal/store"
)

// Engine orchestrates registered detectors against a request. It runs them
// in registration order, stops on the first block, applies masks in-place,
// and emits audit log rows. A nil engine is a valid "guardrails disabled"
// state — all methods are nil-safe.
type Engine struct {
	resolver  *Resolver
	audit     *AuditWriter
	detectors []Detector
	log       *slog.Logger
}

// EngineConfig collects engine dependencies.
type EngineConfig struct {
	Resolver  *Resolver
	Audit     *AuditWriter
	Detectors []Detector
	Logger    *slog.Logger
}

// NewEngine builds an engine. Detectors run in slice order; callers should
// register the cheaper/faster detectors first (PII regex before any ML).
func NewEngine(cfg EngineConfig) *Engine {
	log := cfg.Logger
	if log == nil {
		log = slog.Default()
	}
	return &Engine{
		resolver:  cfg.Resolver,
		audit:     cfg.Audit,
		detectors: cfg.Detectors,
		log:       log,
	}
}

// Result is what the engine reports back to the pipeline for a single
// direction (inbound or outbound). Action is the strictest action across all
// detectors; Decisions is the per-detector breakdown for audit + headers.
type Result struct {
	Action    Action
	Reason    string
	Decisions []Decision
}

// Inbound runs all detectors against the incoming request. If any detector
// produces Action == ActionBlock the engine stops and returns immediately
// (further detectors don't run; the request will be refused). Masking
// detectors rewrite the request fields in place.
func (e *Engine) Inbound(ctx context.Context, req *core.ChatRequest) Result {
	if e == nil || req == nil {
		return Result{Action: ActionAllow}
	}
	policy := e.resolver.Effective(ctx, e.keyFor(req))
	if !policy.IsActive() {
		return Result{Action: ActionAllow}
	}

	in := &InboundRequest{Source: req, FlatText: flattenRequest(req)}
	final := Result{Action: ActionAllow}

	for _, d := range e.detectors {
		dec, err := d.Inbound(ctx, in, policy)
		if err != nil {
			e.log.Warn("guardrail detector error (inbound)", "detector", d.Name(), "err", err)
			continue
		}
		if dec == nil || dec.Action == "" || dec.Action == ActionAllow {
			continue
		}
		dec.Detector = d.Name()
		dec.Direction = DirectionInbound
		e.logDecision(req, dec)

		final.Decisions = append(final.Decisions, *dec)
		if rank(dec.Action) > rank(final.Action) {
			final.Action = dec.Action
			final.Reason = dec.Reason
		}

		if dec.Action == ActionMask && dec.Mutated != "" {
			applyMutation(req, dec)
			// Rebuild FlatText so the next detector sees the rewritten content.
			in.FlatText = flattenRequest(req)
		}
		if dec.Action == ActionBlock {
			return final
		}
	}
	return final
}

// Outbound runs detectors against a finalized (non-streaming) response.
// Streaming output is currently audited only at the end of the stream via
// the same path — pipeline collects chunks into a final ChatResponse and
// hands it back.
func (e *Engine) Outbound(ctx context.Context, req *core.ChatRequest, resp *core.ChatResponse) Result {
	if e == nil || req == nil || resp == nil {
		return Result{Action: ActionAllow}
	}
	policy := e.resolver.Effective(ctx, e.keyFor(req))
	if !policy.IsActive() {
		return Result{Action: ActionAllow}
	}
	out := &OutboundResponse{Source: resp, Text: flattenResponse(resp), Streaming: false}
	final := Result{Action: ActionAllow}
	for _, d := range e.detectors {
		dec, err := d.Outbound(ctx, out, policy)
		if err != nil {
			e.log.Warn("guardrail detector error (outbound)", "detector", d.Name(), "err", err)
			continue
		}
		if dec == nil || dec.Action == "" || dec.Action == ActionAllow {
			continue
		}
		dec.Detector = d.Name()
		dec.Direction = DirectionOutbound
		e.logDecision(req, dec)

		final.Decisions = append(final.Decisions, *dec)
		if rank(dec.Action) > rank(final.Action) {
			final.Action = dec.Action
			final.Reason = dec.Reason
		}
		if dec.Action == ActionMask && dec.Mutated != "" {
			applyResponseMutation(resp, dec)
		}
		if dec.Action == ActionBlock {
			return final
		}
	}
	return final
}

// EffectivePolicy is a passthrough for the admin API and per-key UI preview.
func (e *Engine) EffectivePolicy(ctx context.Context, k Key) Policy {
	if e == nil || e.resolver == nil {
		return Policy{}
	}
	return e.resolver.Effective(ctx, k)
}

// Resolver returns the underlying resolver so the admin layer can invalidate
// cache entries after writes.
func (e *Engine) Resolver() *Resolver {
	if e == nil {
		return nil
	}
	return e.resolver
}

// Audit returns the underlying audit writer so handlers (e.g. the policy
// test endpoint) can write extra rows tagged for their use case.
func (e *Engine) Audit() *AuditWriter {
	if e == nil {
		return nil
	}
	return e.audit
}

// Detectors returns the registered detector list (for /api/system display).
func (e *Engine) Detectors() []Detector {
	if e == nil {
		return nil
	}
	return e.detectors
}

// keyFor extracts the 5-tuple from a live request. We read Model from the
// request itself (the gateway populates metadata.Provider/ChainID but the
// canonical Model lives on the request body where dispatch consumes it).
func (e *Engine) keyFor(req *core.ChatRequest) Key {
	return Key{
		TenantID: req.Metadata.TenantID,
		Provider: req.Metadata.Provider,
		Model:    req.Model,
		ChainID:  req.Metadata.ChainID,
		APIKeyID: req.Metadata.APIKeyID,
	}
}

func (e *Engine) logDecision(req *core.ChatRequest, dec *Decision) {
	if e.audit == nil {
		return
	}
	m := req.Metadata
	e.audit.Write(context.Background(), store.GuardrailLog{
		TenantID:  defaultTenant(m.TenantID),
		RequestID: m.RequestID,
		APIKeyID:  m.APIKeyID,
		Provider:  m.Provider,
		Model:     req.Model,
		ChainID:   m.ChainID,
		Detector:  dec.Detector,
		Direction: string(dec.Direction),
		Action:    string(dec.Action),
		Severity:  string(dec.Severity),
		Reason:    dec.Reason,
		Findings:  MarshalDecisionFindings(dec),
	})
}

func defaultTenant(t string) string {
	if t == "" {
		return store.DefaultTenantID
	}
	return t
}

// flattenRequest concatenates the textual content of System + Messages with
// role-tagged delimiters. Detectors operate on this single string so they
// don't have to walk the message slice. Tool calls and non-text parts are
// skipped — they aren't currently in scope for text-content guardrails.
func flattenRequest(req *core.ChatRequest) string {
	if req == nil {
		return ""
	}
	var b strings.Builder
	if req.System != "" {
		b.WriteString("<<system>>\n")
		b.WriteString(req.System)
		b.WriteString("\n")
	}
	for _, msg := range req.Messages {
		b.WriteString("<<")
		b.WriteString(string(msg.Role))
		b.WriteString(">>\n")
		b.WriteString(messageText(msg))
		b.WriteString("\n")
	}
	return b.String()
}

func flattenResponse(resp *core.ChatResponse) string {
	if resp == nil {
		return ""
	}
	return responseText(resp)
}

// applyMutation writes a detector's masked text back to the request. We
// rewrite the *user-authored* surfaces (system + message contents); the
// detector's Mutated field carries the full post-flatten text and we re-split
// it across the original message boundaries.
//
// For simplicity in Phase 1, we replace the LAST user message's text content
// when the detector mutates inbound text. This covers the dominant case of
// chat completions where the latest user turn is the freshly-typed prompt
// — detectors that need finer-grained rewriting can extend MutatedField.
func applyMutation(req *core.ChatRequest, dec *Decision) {
	if dec == nil || req == nil {
		return
	}
	// Field-specific overrides take priority.
	switch dec.MutatedField {
	case MutatedFieldSystem:
		req.System = dec.Mutated
		return
	case MutatedFieldMessages, MutatedFieldNone:
	}

	// Default: rewrite the most recent user message.
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if req.Messages[i].Role == core.RoleUser {
			setMessageText(&req.Messages[i], dec.Mutated)
			return
		}
	}
	// No user message — fall back to system.
	req.System = dec.Mutated
}

func applyResponseMutation(resp *core.ChatResponse, dec *Decision) {
	if dec == nil || resp == nil {
		return
	}
	setResponseText(resp, dec.Mutated)
}
