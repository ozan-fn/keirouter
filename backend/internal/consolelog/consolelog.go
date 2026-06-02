// Package consolelog provides a thread-safe log buffer that captures request
// pipeline output and streams it to dashboard clients via SSE. It mirrors
// 9router's consoleLogBuffer.js behavior for the Go backend.
package consolelog

import (
	"fmt"
	"sync"
	"time"
)

const maxLines = 500

// Listener is called when a new log line is appended or logs are cleared.
type Listener struct {
	OnLine  func(line string)
	OnClear func()
}

// Buffer is a ring buffer of log lines with pub/sub for SSE streaming.
type Buffer struct {
	mu        sync.RWMutex
	lines     []string
	listeners map[*Listener]struct{}
}

// New creates an empty log buffer.
func New() *Buffer {
	return &Buffer{
		lines:     make([]string, 0, 128),
		listeners: make(map[*Listener]struct{}),
	}
}

// Lines returns a snapshot of all buffered log lines.
func (b *Buffer) Lines() []string {
	b.mu.RLock()
	defer b.mu.RUnlock()
	out := make([]string, len(b.lines))
	copy(out, b.lines)
	return out
}

// Append adds a log line and notifies all listeners.
func (b *Buffer) Append(line string) {
	b.mu.Lock()
	b.lines = append(b.lines, line)
	if len(b.lines) > maxLines {
		b.lines = b.lines[len(b.lines)-maxLines:]
	}
	listeners := make([]*Listener, 0, len(b.listeners))
	for l := range b.listeners {
		listeners = append(listeners, l)
	}
	b.mu.Unlock()

	for _, l := range listeners {
		if l.OnLine != nil {
			l.OnLine(line)
		}
	}
}

// Clear resets the buffer and notifies all listeners.
func (b *Buffer) Clear() {
	b.mu.Lock()
	b.lines = b.lines[:0]
	listeners := make([]*Listener, 0, len(b.listeners))
	for l := range b.listeners {
		listeners = append(listeners, l)
	}
	b.mu.Unlock()

	for _, l := range listeners {
		if l.OnClear != nil {
			l.OnClear()
		}
	}
}

// Subscribe registers a listener. Call Unsubscribe when done.
func (b *Buffer) Subscribe(l *Listener) {
	b.mu.Lock()
	b.listeners[l] = struct{}{}
	b.mu.Unlock()
}

// Unsubscribe removes a listener.
func (b *Buffer) Unsubscribe(l *Listener) {
	b.mu.Lock()
	delete(b.listeners, l)
	b.mu.Unlock()
}

// Logf appends a formatted log line with timestamp and level tag.
// Levels: LOG, INFO, WARN, ERROR, DEBUG.
func (b *Buffer) Logf(level, format string, args ...any) {
	ts := time.Now().Format("15:04:05.000")
	msg := fmt.Sprintf(format, args...)
	b.Append(fmt.Sprintf("[%s] [%s] %s", ts, level, msg))
}
