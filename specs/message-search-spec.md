---
epic: message-search
created: 2026-03-12T00:00:00Z
status: planned
priority: high
---

# Message Search

## Problem Statement

Users cannot search their message history. As conversations grow, finding specific messages, links, or information requires manual scrolling. Every mainstream messaging application provides search functionality. For a privacy-focused app where messages are stored locally (not on a searchable server), local full-text search is the only option — and therefore essential.

## Core Functionality

Full-text search across all locally stored message content for the active identity. Search results display matching messages with context, highlighting, and navigation to the original message in the conversation.

## Functional Requirements

### FR-1: Search UI

- Search input field accessible via a search icon in the conversation header area
- Keyboard shortcut to focus search (platform-appropriate: Cmd+F on macOS, Ctrl+F on Linux)
- Search input shows a clear/close button to dismiss search mode
- Escape key closes search and returns to normal conversation view

### FR-2: Search Scope

- Search queries match against message plaintext content
- Search is scoped to the active identity (only messages belonging to the selected identity)
- Optional: filter results by specific contact
- Search does not include deleted contacts' messages (respects soft-delete)

### FR-3: Search Results Display

- Results appear as a list replacing or overlaying the conversation view
- Each result shows: sender name, message snippet with highlighted match, timestamp, contact name
- Results sorted by relevance (match quality) with recency as tiebreaker
- Clicking a result navigates to the message in its original conversation context
- The matching text is highlighted in the conversation view after navigation

### FR-4: Search Engine

- Use SQLite FTS5 (Full-Text Search) for indexed search
- FTS5 index covers the `content` column of `nostr_messages`
- Index updated incrementally as new messages arrive
- Support prefix matching (e.g., "priv" matches "privacy", "private")
- Support phrase matching with quotes (e.g., `"relay config"`)

### FR-5: Search Performance

- Results appear within 200ms for databases up to 100,000 messages
- Search is debounced (300ms after last keystroke before executing query)
- No UI blocking during search execution (async query)
- FTS5 index size overhead must not exceed 30% of the base `nostr_messages` table size

### FR-6: Empty and Error States

- No results: display "No messages found for [query]"
- Empty query: display recent messages or search tips
- Index corruption: log error, rebuild index automatically, display temporary "Search unavailable" message

## Non-Functional Requirements

- Search operates entirely locally — no network requests, no data leaves the device
- FTS5 index must be created via a database migration
- Existing messages must be indexed on first migration run (one-time bulk index)
- New messages indexed automatically on insertion

## Acceptance Criteria

- Typing a query returns matching messages within 200ms
- Clicking a result navigates to the exact message in its conversation
- Search highlights matching text in results and in the conversation
- Search respects identity scoping (no cross-identity result leakage)
- FTS5 index survives application restarts
- Prefix and phrase matching work correctly
