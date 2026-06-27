// Package capability maps models to the features they support, so the
// dispatcher never silently falls back to a model that cannot honor the
// request (e.g. routing a tool-calling request to a model without tools, or a
// vision request to a text-only model).
//
// Resolution is profile-driven: ResolveProfile derives a full Profile for a
// model via a four-step fallback chain (provider override, exact id, glob
// pattern, floor). Of/OfProvider then project that Profile onto the discrete
// core.CapabilitySet the routing layer guards on. Unknown models resolve to a
// safe floor (tools + 200k context + streaming) rather than being treated as
// text-only.
package capability

import (
	"github.com/mydisha/keirouter/backend/internal/core"
)

// longContextThreshold is the context-window size (tokens) at or above which a
// model is considered long-context.
const longContextThreshold = 200000

// CapabilitiesFromServiceKind maps a dashboard media-service kind (e.g.
// "imageToText", "tts") to the capability set it implies, so user-defined media
// models are classified by their modality rather than as text-only. The second
// result is false when the kind is unknown.
func CapabilitiesFromServiceKind(kind string) (core.CapabilitySet, bool) {
	c, ok := capabilitiesFromServiceKind(kind)
	if !ok {
		return nil, false
	}
	return profileSet(c.merge(defaultProfile())), true
}

// Of returns the capability set for a model id, with no provider context.
func Of(model string) core.CapabilitySet {
	return OfProvider("", model)
}

// OfProvider returns the capability set for a model resolved in the context of
// its upstream provider, allowing provider-specific overrides to apply. Pass an
// empty provider when it is unknown.
func OfProvider(provider, model string) core.CapabilitySet {
	return profileSet(ResolveProfile(provider, model))
}

// profileSet projects a resolved Profile onto the discrete capability set used
// by the routing guard. Streaming is granted to every model; long context is
// derived from the context-window threshold.
func profileSet(p Profile) core.CapabilitySet {
	set := core.NewCapabilitySet(core.CapStreaming)
	if p.Tools {
		set.Add(core.CapToolCalling)
	}
	if p.Vision {
		set.Add(core.CapVision)
	}
	if p.AudioInput {
		set.Add(core.CapAudioInput)
	}
	if p.VideoInput {
		set.Add(core.CapVideoInput)
	}
	if p.PDF {
		set.Add(core.CapDocumentInput)
	}
	if p.ImageOutput {
		set.Add(core.CapImageOutput)
	}
	if p.AudioOutput {
		set.Add(core.CapAudioOutput)
	}
	if p.Search {
		set.Add(core.CapWebSearch)
	}
	if p.Reasoning {
		set.Add(core.CapReasoning)
	}
	if p.StructuredOutput {
		set.Add(core.CapStructuredOutput)
	}
	if p.ContextWindow >= longContextThreshold {
		set.Add(core.CapLongContext)
	}
	return set
}

// Supports reports whether a model satisfies all required capabilities, with no
// provider context.
func Supports(model string, required core.CapabilitySet) bool {
	return Of(model).Satisfies(required)
}

// SupportsProvider reports whether a model, resolved in the context of its
// upstream provider, satisfies all required capabilities.
func SupportsProvider(provider, model string, required core.CapabilitySet) bool {
	return OfProvider(provider, model).Satisfies(required)
}

// Required infers the capabilities a request needs from its content, so the
// dispatcher can reject incapable fallback targets. It is conservative: it only
// flags capabilities that are unambiguously required by the request shape.
func Required(req *core.ChatRequest) core.CapabilitySet {
	set := core.NewCapabilitySet()
	if len(req.Tools) > 0 {
		set.Add(core.CapToolCalling)
	}
	if req.Stream {
		set.Add(core.CapStreaming)
	}
	if req.Reasoning != nil && (req.Reasoning.Effort != "" || req.Reasoning.MaxTokens > 0) {
		set.Add(core.CapReasoning)
	}
	if len(req.ResponseFormat) > 0 {
		set.Add(core.CapStructuredOutput)
	}
	for _, m := range req.Messages {
		for _, p := range m.Content {
			switch p.Type {
			case core.PartImage:
				set.Add(core.CapVision)
			case core.PartAudio:
				set.Add(core.CapAudioInput)
			}
		}
	}
	return set
}
