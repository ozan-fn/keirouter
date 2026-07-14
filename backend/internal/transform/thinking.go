package transform

import (
	"strings"

	"github.com/mydisha/keirouter/backend/internal/core"
)

// thinkStart and thinkEnd are the XML tags some models (MiMo, QwQ, Kiro, etc.)
// embed in the content field to demarcate reasoning/thinking blocks.
// Supports <think>, <thinking>, and <thinking_mode> variants.
var (
	thinkTags = [][2]string{
		{"<think>", "</think>"},
		{"<thinking>", "</thinking>"},
		{"<thinking_mode>", "</thinking_mode>"},
	}
)

// findFirstTag returns the index and tag pair (start, end) for whichever tag appears first.
// Returns -1, "", "" if no tag found.
func findFirstTag(s string) (idx int, start, end string) {
	firstIdx := -1
	var firstStart, firstEnd string
	
	for _, tag := range thinkTags {
		if i := strings.Index(s, tag[0]); i >= 0 && (firstIdx < 0 || i < firstIdx) {
			firstIdx = i
			firstStart = tag[0]
			firstEnd = tag[1]
		}
	}
	return firstIdx, firstStart, firstEnd
}

// StripThinkTags extracts content enclosed in <think>, <thinking>, or <thinking_mode> tags from raw text.
// It returns any thinking content found (as a ChunkThinking Delta if non-empty)
// and the remaining text with the tags removed. For non-streaming use where the
// full content is available at once.
func StripThinkTags(content string) (thinkingChunks []core.StreamChunk, cleanContent string) {
	hasTag := false
	for _, tag := range thinkTags {
		if strings.Contains(content, tag[0]) {
			hasTag = true
			break
		}
	}
	if !hasTag {
		return nil, content
	}

	var out strings.Builder
	pos := 0
	inThink := false
	var currentEnd string

	for pos < len(content) {
		if inThink {
			if endIdx := strings.Index(content[pos:], currentEnd); endIdx >= 0 {
				thinkingText := content[pos : pos+endIdx]
				if thinkingText != "" {
					thinkingChunks = append(thinkingChunks, core.StreamChunk{
						Type:  core.ChunkThinking,
						Delta: thinkingText,
					})
				}
				pos += endIdx + len(currentEnd)
				inThink = false
				continue
			}
			// No closing tag — emit remainder as thinking.
			thinkingText := content[pos:]
			if thinkingText != "" {
				thinkingChunks = append(thinkingChunks, core.StreamChunk{
					Type:  core.ChunkThinking,
					Delta: thinkingText,
				})
			}
			return thinkingChunks, out.String()
		}

		idx, startTag, endTag := findFirstTag(content[pos:])
		if idx >= 0 {
			out.WriteString(content[pos : pos+idx])
			pos += idx + len(startTag)
			currentEnd = endTag
			inThink = true
			continue
		}

		// No more think tags — write remainder.
		out.WriteString(content[pos:])
		break
	}

	return thinkingChunks, out.String()
}

// ThinkTagState tracks stateful extraction of thinking tags across streaming
// content chunks. Supports both <think> and <thinking> tags. Tags may arrive
// split across multiple SSE events, so the parser buffers potential tag prefixes/suffixes.
//
// Flush() must be called when the stream ends to emit any remaining buffered
// content.
type ThinkTagState struct {
	thinkingMode bool
	buf          string // buffered text that might be part of a tag
	currentEnd   string // which end tag we're looking for (</think> or </thinking>)
}

// ProcessFeed ingests one streaming content delta and returns thinking and/or
// text chunks. The caller must call Flush() when the stream ends.
func (ts *ThinkTagState) ProcessFeed(delta string) []core.StreamChunk {
	// Fast path: when no tag scan is in flight (not inside a think block and
	// nothing buffered as a potential partial tag) and the delta carries no
	// '<' that could open one, forward it verbatim with no buffering and no
	// allocation. This is the common case for models that never emit inline
	// think tags, so per-chunk overhead stays at zero and no token is ever
	// held back waiting for the next frame.
	if !ts.thinkingMode && ts.buf == "" {
		if delta == "" {
			return nil
		}
		if !strings.ContainsRune(delta, '<') {
			return []core.StreamChunk{{Type: core.ChunkText, Delta: delta}}
		}
	}

	ts.buf += delta
	var chunks []core.StreamChunk

	for len(ts.buf) > 0 {
		if !ts.thinkingMode {
			// Not in thinking mode — look for start tag (either <think> or <thinking>).
			idx, startTag, endTag := findFirstTag(ts.buf)
			if idx >= 0 {
				// Emit text before the tag.
				if idx > 0 {
					chunks = append(chunks, core.StreamChunk{
						Type:  core.ChunkText,
						Delta: ts.buf[:idx],
					})
				}
				ts.buf = ts.buf[idx+len(startTag):]
				ts.currentEnd = endTag
				ts.thinkingMode = true
				continue
			}

			// No start tag found. Check if suffix of buf could be partial tag.
			partial := longestTagPrefix(ts.buf)
			if partial == len(ts.buf) {
				// Entire buf is a potential tag prefix — hold.
				return chunks
			}
			// Emit safe portion, keep potential prefix.
			safe := len(ts.buf) - partial
			if safe > 0 {
				chunks = append(chunks, core.StreamChunk{
					Type:  core.ChunkText,
					Delta: ts.buf[:safe],
				})
			}
			ts.buf = ts.buf[safe:]
			return chunks
		}

		// In thinking mode — look for end tag.
		if idx := strings.Index(ts.buf, ts.currentEnd); idx >= 0 {
			thinkingText := ts.buf[:idx]
			if thinkingText != "" {
				chunks = append(chunks, core.StreamChunk{
					Type:  core.ChunkThinking,
					Delta: thinkingText,
				})
			}
			ts.buf = ts.buf[idx+len(ts.currentEnd):]
			ts.thinkingMode = false
			continue
		}

		// No end tag. Check for partial end tag suffix.
		partial := longestTagSuffix(ts.buf, ts.currentEnd)
		if partial == len(ts.buf) {
			return chunks // entirely potential suffix
		}
		safe := len(ts.buf) - partial
		if safe > 0 {
			chunks = append(chunks, core.StreamChunk{
				Type:  core.ChunkThinking,
				Delta: ts.buf[:safe],
			})
		}
		ts.buf = ts.buf[safe:]
		return chunks
	}

	return chunks
}

// Flush emits any remaining buffered content. Must be called at stream end.
func (ts *ThinkTagState) Flush() []core.StreamChunk {
	if len(ts.buf) == 0 {
		return nil
	}
	var chunks []core.StreamChunk
	if ts.thinkingMode {
		chunks = append(chunks, core.StreamChunk{
			Type:  core.ChunkThinking,
			Delta: ts.buf,
		})
	} else {
		chunks = append(chunks, core.StreamChunk{
			Type:  core.ChunkText,
			Delta: ts.buf,
		})
	}
	ts.buf = ""
	return chunks
}

// longestTagPrefix returns the length of the longest prefix of s that matches
// a prefix of any supported start tag. Used to detect partial tag arrivals in streaming.
func longestTagPrefix(s string) int {
	max := 0
	for _, tag := range thinkTags {
		for l := min(len(s), len(tag[0])); l > 0; l-- {
			if s[len(s)-l:] == tag[0][:l] {
				if l > max {
					max = l
				}
				break
			}
		}
	}
	return max
}

// longestTagSuffix returns the length of the longest suffix of s that matches
// a prefix of </think> or </thinking>. Used to detect partial end tag arrivals in thinking mode.
func longestTagSuffix(s string, endTag string) int {
	max := 0
	for l := min(len(s), len(endTag)); l > 0; l-- {
		if s[len(s)-l:] == endTag[:l] {
			max = l
			break
		}
	}
	return max
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
