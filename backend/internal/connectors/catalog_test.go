package connectors

import (
	"testing"

	"github.com/mydisha/keirouter/backend/internal/core"
)

func TestCatalogHasCoreProviders(t *testing.T) {
	want := []string{"openai", "anthropic", "deepseek", "groq", "gemini", "openrouter", "tavily", "elevenlabs"}
	for _, id := range want {
		if _, ok := SpecByID(id); !ok {
			t.Errorf("catalog missing provider %q", id)
		}
	}
}

func TestSpecByAlias(t *testing.T) {
	spec, ok := SpecByAlias("ds")
	if !ok || spec.ID != "deepseek" {
		t.Fatalf("alias ds should resolve to deepseek, got %q ok=%v", spec.ID, ok)
	}
	// id also resolves.
	if spec, ok := SpecByAlias("openai"); !ok || spec.ID != "openai" {
		t.Fatalf("id openai should resolve, got %q ok=%v", spec.ID, ok)
	}
}

func TestSpecsByKind(t *testing.T) {
	cases := map[core.ServiceKind][]string{
		core.ServiceImage:  {"nanobanana", "fal-ai", "stability-ai"},
		core.ServiceSTT:    {"deepgram", "assemblyai", "groq"},
		core.ServiceTTS:    {"elevenlabs", "inworld"},
		core.ServiceSearch: {"tavily", "brave-search", "serper", "exa"},
		core.ServiceFetch:  {"firecrawl", "jina-reader", "tavily"},
	}
	for kind, wantProviders := range cases {
		specs := SpecsByKind(kind)
		got := map[string]bool{}
		for _, s := range specs {
			got[s.ID] = true
		}
		for _, id := range wantProviders {
			if !got[id] {
				t.Errorf("kind %q: expected provider %q in results", kind, id)
			}
		}
	}
}

func TestModelsByKind(t *testing.T) {
	// Every LLM model should belong to a provider that advertises the LLM kind.
	llms := ModelsByKind(core.ServiceLLM)
	if len(llms) == 0 {
		t.Fatal("expected at least one LLM model in catalog")
	}
	for _, pm := range llms {
		if pm.Model.Kind != core.ServiceLLM {
			t.Errorf("ModelsByKind(llm) returned non-llm model %q (%q)", pm.Model.ID, pm.Model.Kind)
		}
	}

	// Image models should be present and tagged correctly.
	images := ModelsByKind(core.ServiceImage)
	if len(images) == 0 {
		t.Fatal("expected at least one image model in catalog")
	}
	for _, pm := range images {
		if pm.Model.Kind != core.ServiceImage {
			t.Errorf("ModelsByKind(image) returned non-image model %q", pm.Model.ID)
		}
	}
}

func TestFindModel(t *testing.T) {
	if _, ok := FindModel("openai", "gpt-4o"); !ok {
		t.Error("expected to find openai/gpt-4o")
	}
	if _, ok := FindModel("openai", "nonexistent-model"); ok {
		t.Error("expected miss for nonexistent model")
	}
}

func TestDrivableDialect(t *testing.T) {
	if !DrivableDialect(core.DialectOpenAI) || !DrivableDialect(core.DialectAnthropic) {
		t.Error("openai and anthropic dialects must be drivable")
	}
	if DrivableDialect(core.DialectKiro) {
		t.Error("kiro dialect should not be drivable yet")
	}
}

func TestRegistryRegistersDrivableProviders(t *testing.T) {
	r := DefaultRegistry()
	// OpenAI (chat) and a web provider should be registered.
	for _, id := range []string{"openai", "anthropic", "tavily", "firecrawl"} {
		if !r.Has(id) {
			t.Errorf("registry should have connector for %q", id)
		}
	}
	// Proprietary-dialect providers should NOT have a connector yet.
	for _, id := range []string{"kiro", "cursor", "gemini"} {
		if r.Has(id) {
			t.Errorf("registry should not have connector for not-yet-drivable %q", id)
		}
	}
}