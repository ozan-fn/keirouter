package gateway

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// ipLimiter tracks per-IP request counts for rate limiting.
type ipLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     int           // max requests per window
	window   time.Duration // time window
}

type visitor struct {
	count    int
	lastSeen time.Time
}

// newIPLimiter creates a rate limiter that allows `rate` requests per `window`
// per IP address.
func newIPLimiter(rate int, window time.Duration) *ipLimiter {
	l := &ipLimiter{
		visitors: make(map[string]*visitor),
		rate:     rate,
		window:   window,
	}
	// Cleanup old entries periodically
	go l.cleanup()
	return l
}

// Allow checks if the request from the given IP should be allowed.
func (l *ipLimiter) Allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	v, exists := l.visitors[ip]
	now := time.Now()

	if !exists || now.Sub(v.lastSeen) > l.window {
		l.visitors[ip] = &visitor{count: 1, lastSeen: now}
		return true
	}

	if v.count >= l.rate {
		return false
	}

	v.count++
	v.lastSeen = now
	return true
}

// cleanup removes expired entries every minute.
func (l *ipLimiter) cleanup() {
	for {
		time.Sleep(time.Minute)
		l.mu.Lock()
		for ip, v := range l.visitors {
			if time.Since(v.lastSeen) > l.window*2 {
				delete(l.visitors, ip)
			}
		}
		l.mu.Unlock()
	}
}

// extractIP extracts the client IP from the request.
func extractIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// loginRateLimiter creates a rate limiting middleware for the login endpoint.
// Allows 5 attempts per minute per IP.
func (s *Server) loginRateLimiter(next http.Handler) http.Handler {
	limiter := newIPLimiter(5, time.Minute)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r)
		if !limiter.Allow(ip) {
			writeError(w, http.StatusTooManyRequests, "rate limit exceeded: too many login attempts, please try again later")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// apiKeyRateLimiter creates a rate limiting middleware for API key auth failures.
// Allows 20 failed attempts per minute per IP.
func (s *Server) apiKeyRateLimiter(next http.Handler) http.Handler {
	limiter := newIPLimiter(20, time.Minute)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r)
		if !limiter.Allow(ip) {
			writeError(w, http.StatusTooManyRequests, "rate limit exceeded: too many authentication failures")
			return
		}
		next.ServeHTTP(w, r)
	})
}
