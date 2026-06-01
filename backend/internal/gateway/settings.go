package gateway

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/mydisha/keirouter/backend/internal/caveman"
	"github.com/mydisha/keirouter/backend/internal/slimmer"
	"github.com/mydisha/keirouter/backend/internal/terse"
)

// endpointSettingsKey is the settings-store key under which token-saving
// preferences are persisted as a JSON blob (mirrors 9router's endpoint
// settings: RTK token saver + caveman output compression + terse mode).
const endpointSettingsKey = "endpoint_settings"

// EndpointSettings holds the dashboard-configurable token-saving preferences.
type EndpointSettings struct {
	// RTKEnabled toggles input-side tool-output compression (the slimmer).
	RTKEnabled bool `json:"rtk_enabled"`

	// CavemanEnabled toggles output-side caveman compression; CavemanLevel is
	// one of "lite", "full", "ultra".
	CavemanEnabled bool   `json:"caveman_enabled"`
	CavemanLevel   string `json:"caveman_level"`

	// TerseEnabled toggles the alternative terse output mode; TerseLevel is one
	// of "light", "medium", "aggressive".
	TerseEnabled bool   `json:"terse_enabled"`
	TerseLevel   string `json:"terse_level"`
}

// defaultEndpointSettings mirrors 9router's defaults: RTK on, caveman/terse off.
func defaultEndpointSettings() EndpointSettings {
	return EndpointSettings{
		RTKEnabled:     true,
		CavemanEnabled: false,
		CavemanLevel:   string(caveman.LevelFull),
		TerseEnabled:   false,
		TerseLevel:     string(terse.LevelMedium),
	}
}

// loadEndpointSettings reads the persisted settings, falling back to defaults
// when unset or unreadable. It never errors: token-saving is best-effort.
func (s *Server) loadEndpointSettings(ctx context.Context) EndpointSettings {
	def := defaultEndpointSettings()
	if s.settings == nil {
		return def
	}
	raw, err := s.settings.Get(ctx, endpointSettingsKey)
	if err != nil || raw == "" {
		return def
	}
	var es EndpointSettings
	if err := json.Unmarshal([]byte(raw), &es); err != nil {
		return def
	}
	// Backfill empty levels with defaults.
	if es.CavemanLevel == "" {
		es.CavemanLevel = def.CavemanLevel
	}
	if es.TerseLevel == "" {
		es.TerseLevel = def.TerseLevel
	}
	return es
}

// slimmerConfig resolves the slimmer (RTK) settings from endpoint settings.
func (s *Server) slimmerConfig() slimmer.Config {
	es := s.loadEndpointSettings(context.Background())
	return slimmer.Config{Enabled: es.RTKEnabled}
}

// terseConfig resolves terse-mode settings from endpoint settings.
func (s *Server) terseConfig() terse.Config {
	es := s.loadEndpointSettings(context.Background())
	return terse.Config{Enabled: es.TerseEnabled, Level: terse.Level(es.TerseLevel)}
}

// cavemanConfig resolves caveman settings from endpoint settings.
func (s *Server) cavemanConfig() caveman.Config {
	es := s.loadEndpointSettings(context.Background())
	return caveman.Config{Enabled: es.CavemanEnabled, Level: caveman.Level(es.CavemanLevel)}
}

// ---- admin endpoints --------------------------------------------------------

// adminGetEndpointSettings returns the current token-saving preferences.
func (s *Server) adminGetEndpointSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.loadEndpointSettings(r.Context()))
}

// adminUpdateEndpointSettings persists token-saving preferences. It accepts a
// partial body and merges it over the current settings, validating enum values.
func (s *Server) adminUpdateEndpointSettings(w http.ResponseWriter, r *http.Request) {
	if s.settings == nil {
		writeError(w, http.StatusInternalServerError, "settings store not configured")
		return
	}
	current := s.loadEndpointSettings(r.Context())

	var patch struct {
		RTKEnabled     *bool   `json:"rtk_enabled"`
		CavemanEnabled *bool   `json:"caveman_enabled"`
		CavemanLevel   *string `json:"caveman_level"`
		TerseEnabled   *bool   `json:"terse_enabled"`
		TerseLevel     *string `json:"terse_level"`
	}
	if !decodeJSON(w, r, &patch) {
		return
	}

	if patch.RTKEnabled != nil {
		current.RTKEnabled = *patch.RTKEnabled
	}
	if patch.CavemanEnabled != nil {
		current.CavemanEnabled = *patch.CavemanEnabled
	}
	if patch.CavemanLevel != nil {
		if !caveman.ValidLevel(caveman.Level(*patch.CavemanLevel)) {
			writeError(w, http.StatusBadRequest, "caveman_level must be lite, full, or ultra")
			return
		}
		current.CavemanLevel = *patch.CavemanLevel
	}
	if patch.TerseEnabled != nil {
		current.TerseEnabled = *patch.TerseEnabled
	}
	if patch.TerseLevel != nil {
		current.TerseLevel = *patch.TerseLevel
	}

	raw, err := json.Marshal(current)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.settings.Set(r.Context(), endpointSettingsKey, string(raw)); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, current)
}
