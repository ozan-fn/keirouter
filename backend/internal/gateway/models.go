package gateway

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/mydisha/keirouter/backend/internal/connectors"
	"github.com/mydisha/keirouter/backend/internal/core"
)

// modelEntry is one entry in a /v1/models listing, in the OpenAI shape plus
// KeiRouter extensions (provider, kind, dimensions).
type modelEntry struct {
	ID         string `json:"id"`
	Object     string `json:"object"`
	OwnedBy    string `json:"owned_by"`
	Provider   string `json:"provider,omitempty"`
	Kind       string `json:"kind,omitempty"`
	Name       string `json:"name,omitempty"`
	Dimensions int    `json:"dimensions,omitempty"`
}

// handleListModels reports targetable models: the tenant's chains (as virtual
// models) plus every catalogued LLM model in provider/model form. This lets a
// client discover what it can pass in the `model` field.
func (s *Server) handleListModels(w http.ResponseWriter, r *http.Request) {
	key, _ := authedKey(r.Context())
	tenantID := tenantOf(key)

	data := make([]modelEntry, 0, 64)

	// Chains are exposed as "combo" models, matching the upstream convention:
	// a combo chains multiple providers with auto-fallback and is callable by
	// its bare name (and via the chain: prefix). owned_by:"combo" lets client
	// tools surface them distinctly from single-provider models.
	chains, err := s.chains.ListByTenant(r.Context(), tenantID)
	if err == nil {
		for _, c := range chains {
			data = append(data, modelEntry{
				ID: c.Name, Object: "model", OwnedBy: "combo", Kind: string(core.ServiceLLM), Name: c.Name,
			})
		}
	}

	for _, pm := range connectors.ModelsByKind(core.ServiceLLM) {
		data = append(data, modelEntry{
			ID:      pm.Provider + "/" + pm.Model.ID,
			Object:  "model",
			OwnedBy: pm.Provider,
			Provider: pm.Provider,
			Kind:    string(core.ServiceLLM),
			Name:    pm.Model.Name,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"object": "list", "data": data})
}

// handleListModelsByKind serves GET /v1/models/{kind}: it lists every model of
// the requested service kind (llm, embedding, image, stt, tts, search, fetch)
// across the provider catalog, plus a special "chains" view.
func (s *Server) handleListModelsByKind(w http.ResponseWriter, r *http.Request) {
	kindParam := strings.ToLower(strings.TrimSpace(chi.URLParam(r, "kind")))

	// "chains" is a convenience view of the tenant's routing chains.
	if kindParam == "chains" {
		s.handleListModels(w, r)
		return
	}

	kind := core.ServiceKind(kindParam)
	if !core.ValidServiceKind(kind) {
		writeError(w, http.StatusBadRequest, "unknown model kind: "+kindParam)
		return
	}

	pairs := connectors.ModelsByKind(kind)
	data := make([]modelEntry, 0, len(pairs))
	for _, pm := range pairs {
		data = append(data, modelEntry{
			ID:         pm.Provider + "/" + pm.Model.ID,
			Object:     "model",
			OwnedBy:    pm.Provider,
			Provider:   pm.Provider,
			Kind:       string(pm.Model.Kind),
			Name:       pm.Model.Name,
			Dimensions: pm.Model.Dimensions,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"object": "list", "kind": kindParam, "data": data})
}

// handleModelInfo serves GET /v1/models/info?id=<provider/model>: it returns
// metadata for a single model (kind, dimensions, provider, name).
func (s *Server) handleModelInfo(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		writeError(w, http.StatusBadRequest, "id query parameter is required")
		return
	}

	provider, model, ok := strings.Cut(id, "/")
	if !ok || provider == "" || model == "" {
		writeError(w, http.StatusBadRequest, "id must be in provider/model form")
		return
	}

	spec, found := connectors.FindModel(provider, model)
	if !found {
		writeError(w, http.StatusNotFound, "unknown model: "+id)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":         id,
		"provider":   provider,
		"model":      spec.ID,
		"name":       spec.Name,
		"kind":       string(spec.Kind),
		"dimensions": spec.Dimensions,
	})
}