---
epic: link-preview-privacy
created: 2026-03-12T00:00:00Z
status: planned
priority: medium
---

# Link Preview with Privacy Controls

## Problem Statement

When a message contains a URL, Nostling currently renders it as clickable text with no preview. This is both a UX gap (users expect to see a preview of linked content) and a hidden privacy opportunity.

Research published at EuroS&P 2025 and presented at Black Hat USA 2025 ("Not in The Prophecies: Practical Attacks on Nostr") documented a link preview confidentiality attack: when a messaging client generates a link preview by fetching URL metadata, the domain name is leaked to the server hosting the link. This metadata leak affects virtually ALL current messaging clients that generate previews — including Signal (which proxies previews but still leaks to Signal's proxy server), and every Nostr client that fetches OpenGraph metadata.

No Nostr client has publicly addressed this attack. Nostling has an opportunity to be the first messaging application — Nostr or otherwise — to offer configurable, privacy-aware link previews.

## Core Functionality

Detect URLs in message content and optionally render rich previews (title, description, image) with configurable privacy controls. Users choose between: no previews (maximum privacy), local-only previews (render using locally available data without network requests), or full previews (fetch metadata with privacy implications acknowledged).

## Functional Requirements

### FR-1: URL Detection

- Detect HTTP/HTTPS URLs in message content using URL pattern matching
- Render detected URLs as clickable links (existing behavior, enhanced)
- URLs detected in both outgoing and incoming messages

### FR-2: Preview Generation Modes (Per-Identity Setting)

Three modes, selectable per identity:

**Mode: Off (default)**
- URLs rendered as clickable text only (current behavior)
- No metadata fetching, no preview rendering
- Zero network requests for link content
- Maximum privacy — no domain leakage

**Mode: Local Only**
- Generate preview from locally available information only
- For Blossom/media URLs: show cached image thumbnail if available
- For other URLs: show domain name and URL path as structured text (no fetch)
- No network requests beyond what the user explicitly initiated
- Moderate privacy — domain visible in structured display but no server contacted

**Mode: Full Preview**
- Fetch OpenGraph/meta tags from the URL to generate rich preview (title, description, image)
- Preview fetched in the main process (not renderer, to avoid CORS issues)
- Clear UI indicator that preview fetching contacts the linked server
- User explicitly opts into this mode with an acknowledgment of the privacy tradeoff
- Fetch timeout: 5 seconds
- Preview data cached locally to avoid repeated fetches

### FR-3: Preview Display

- Preview appears below the message text as a compact card
- Card shows: site favicon (if available), page title, description snippet (first 150 chars), preview image (if available)
- Card is visually contained (border, rounded corners, theme-aware background)
- Clicking the card opens the URL in the default browser (via `shell.openExternal`)
- Loading state shown while preview is being fetched (full preview mode)

### FR-4: Security Controls

- All preview image URLs validated through existing `sanitizePictureUrl()` (HTTP/HTTPS only)
- Preview fetch uses a separate, isolated network context (no cookies, no credentials)
- Preview images rendered in `<img>` tags (no iframes, no script execution)
- Preview fetch respects CSP policy
- User-Agent header for preview fetch should be generic (not identifying as Nostling)

### FR-5: Configuration

- Per-identity setting in the identity configuration panel
- Three-option selector: Off / Local Only / Full Preview
- Default: Off (privacy-first default)
- Setting persisted in database

## Non-Functional Requirements

- Default mode (Off) must make zero network requests for link content
- Full Preview mode must clearly communicate the privacy tradeoff in the settings UI
- Preview fetching must not block message rendering (async, non-blocking)
- Preview cache must respect the existing image cache limits (LRU eviction)

## Acceptance Criteria

- URLs in messages are rendered as clickable links in all modes
- Off mode: no preview card, no network requests
- Local Only mode: shows structured URL info without contacting any server
- Full Preview mode: fetches and displays rich preview with title, description, image
- Settings UI clearly explains privacy implications of each mode
- Preview fetching errors degrade gracefully (show URL text only)
- Per-identity preview preference persists across restarts

## Competitive Differentiation

This feature, implemented with the privacy-first default and clear documentation of the link preview attack vector, positions Nostling as the first messaging client to transparently address this metadata leakage. The documentation should reference the EuroS&P 2025 research for credibility.
