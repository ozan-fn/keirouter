package guardrails

import "context"

// Phase 1 ships stub implementations for Topics, Toxicity, and Bias so the
// UI can render and save their configuration. They return ActionAllow and a
// nil Decision so the Engine ignores them. Phase 2 will replace these with
// real engines (semantic topic matching, ML toxicity classifier, bias scan)
// without changing the call site.

type topicsStub struct{}

func (topicsStub) Name() string { return "topics" }
func (topicsStub) Inbound(_ context.Context, _ *InboundRequest, _ Policy) (*Decision, error) {
	return nil, nil
}
func (topicsStub) Outbound(_ context.Context, _ *OutboundResponse, _ Policy) (*Decision, error) {
	return nil, nil
}

// NewTopicsStub is the Phase 1 placeholder topic-boundary detector.
func NewTopicsStub() Detector { return topicsStub{} }

type toxicityStub struct{}

func (toxicityStub) Name() string { return "toxicity" }
func (toxicityStub) Inbound(_ context.Context, _ *InboundRequest, _ Policy) (*Decision, error) {
	return nil, nil
}
func (toxicityStub) Outbound(_ context.Context, _ *OutboundResponse, _ Policy) (*Decision, error) {
	return nil, nil
}

// NewToxicityStub is the Phase 1 placeholder toxicity classifier.
func NewToxicityStub() Detector { return toxicityStub{} }

type biasStub struct{}

func (biasStub) Name() string { return "bias" }
func (biasStub) Inbound(_ context.Context, _ *InboundRequest, _ Policy) (*Decision, error) {
	return nil, nil
}
func (biasStub) Outbound(_ context.Context, _ *OutboundResponse, _ Policy) (*Decision, error) {
	return nil, nil
}

// NewBiasStub is the Phase 1 placeholder bias detector.
func NewBiasStub() Detector { return biasStub{} }
