// Package capability provides modality stripping for requests routed to
// providers whose upstream capabilities are unknown or limited.
//
// When the dispatcher relaxes its capability guard for custom/dynamic providers
// (see connectors.IsCustomProviderID), the pipeline calls
// StripUnsupportedModalities to soft-degrade the request in place: input
// modalities the resolved profile cannot handle are replaced with short text
// placeholders, so the upstream receives a valid text-only request rather than
// being rejected or sending content it cannot process.
//
// This mirrors the conservative principle behind Required(): only hard input
// modalities (vision, audio) are stripped. Tool calls and text are always
// preserved — a model that lacks tool calling will simply not emit tool calls,
// and stripping them from history would break tool-result pairing.
package capability

import (
	"fmt"

	"github.com/mydisha/keirouter/backend/internal/core"
)

// modalityPlaceholder is the text substituted for a stripped content part. It
// is short and descriptive so the model retains awareness that media was
// present without receiving bytes it cannot decode.
const modalityPlaceholder = "[content removed: %s not supported by this model]"

// StripUnsupportedModalities removes input-modality content parts the resolved
// model profile cannot handle, replacing them with text placeholders. It
// mutates req in place and returns true if any part was stripped.
//
// Only hard input modalities (vision, audio) are stripped. Text, tool calls,
// tool results, and thinking blocks are always preserved.
func StripUnsupportedModalities(req *core.ChatRequest, provider, model string) bool {
	if req == nil {
		return false
	}
	caps := OfProvider(provider, model)
	hasVision := caps.Has(core.CapVision)
	hasAudioInput := caps.Has(core.CapAudioInput)

	stripped := false
	for i := range req.Messages {
		msg := &req.Messages[i]
		for j := range msg.Content {
			p := &msg.Content[j]
			switch p.Type {
			case core.PartImage:
				if !hasVision {
					*p = core.ContentPart{
						Type: core.PartText,
						Text: fmt.Sprintf(modalityPlaceholder, "image"),
					}
					stripped = true
				}
			case core.PartAudio:
				if !hasAudioInput {
					*p = core.ContentPart{
						Type: core.PartText,
						Text: fmt.Sprintf(modalityPlaceholder, "audio"),
					}
					stripped = true
				}
			}
		}
	}
	return stripped
}