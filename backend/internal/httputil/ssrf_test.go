package httputil

import "testing"

func TestValidateOAuthRedirectURI(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{"empty", "", false},
		{"localhost http", "http://localhost:3000/callback", false},
		{"localhost https", "https://localhost:8443/auth/callback", false},
		{"127.0.0.1", "http://127.0.0.1:3000/callback", false},
		{"127.0.0.2", "http://127.0.0.2:3000/callback", false},
		{"IPv6 loopback", "http://[::1]:3000/callback", false},
		{"no scheme", "localhost:3000/callback", true},
		{"file scheme", "file:///etc/passwd", true},
		{"private 10.x", "http://10.0.0.1:3000/callback", true},
		{"private 192.168.x", "http://192.168.1.1:3000/callback", true},
		{"private 172.16.x", "http://172.16.0.1:3000/callback", true},
		{"cloud metadata", "http://169.254.169.254/latest/meta-data", true},
		{"link-local", "http://169.254.1.1:3000/callback", true},
		{"unspecified", "http://0.0.0.0:3000/callback", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateOAuthRedirectURI(tt.url)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateOAuthRedirectURI(%q) error = %v, wantErr %v", tt.url, err, tt.wantErr)
			}
		})
	}
}
