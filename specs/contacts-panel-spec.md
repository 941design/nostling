# Contacts Panel - Requirements Specification

## Problem Statement

Users need a way to view detailed profile information for their contacts within each identity. Currently, contacts are only visible in the sidebar with minimal information. This feature enables users to:
- View complete contact profile information (name, bio, picture, banner, website, NIP-05, Lightning address)
- Access contact profiles in a dedicated view similar to the identities panel
- Have reliable offline access to contact profile images through local caching

## Core Functionality

Create a contacts sub-panel that displays full contact profile information for the selected identity. The panel follows the same UX pattern as the existing identities panel but is read-only (contacts cannot edit other contacts' profiles). Profile images and banners are cached to disk for offline access and faster loading.

## Functional Requirements

### FR-1: Contacts Panel View
- Add new view mode 'contacts' to application view state (alongside 'chat', 'identities', 'about', etc.)
- When in contacts view, display ContactsPanel component in main content area
- Sidebar shows list of contacts for the selected identity (replaces identity list, similar to identities view pattern)
- Menu option to access contacts view: "View Contact Profiles" in hamburger menu

### FR-2: Contact Selection and Display
- Sidebar displays contact list filtered by currently selected identity
- Each contact item shows:
  - Profile picture (cached)
  - Display name (following precedence: alias > private profile name > public profile name > npub)
  - Alias (if different from display name)
- Selected contact highlighted with border color and background
- Clicking contact in sidebar loads their full profile in main panel

### FR-3: Profile Information Display
- Display all profile fields for selected contact:
  - Name (display_name or name from profile)
  - About (bio/description)
  - Picture (avatar/profile picture)
  - Banner (header image)
  - Website URL
  - NIP-05 identifier (verification)
  - LUD16 (Lightning address)
- All fields are read-only (display only, no editing)
- Banner displayed as header background image at top of panel (social media style)
- Profile picture overlaid on banner (if banner present) or displayed prominently
- Fields with no data show as empty/hidden (graceful degradation)

### FR-4: Image Caching to Disk
- **Cache Location**: Electron userData directory (or custom NOSTLING_DATA_DIR)
- **Cache Structure**: Subdirectory structure for organization (e.g., `image-cache/`)
- **Cache Strategy**:
  - When profile image/banner URL encountered, check cache first
  - Cache key derived from URL (e.g., SHA-256 hash of URL)
  - Store metadata: original URL, cached file path, timestamp, size
  - Only re-fetch if URL has changed (compare stored URL with current URL)
- **Cache Limits**: LRU (Least Recently Used) eviction with 100MB size limit
- **Cache Invalidation**:
  - When contact profile URL changes, invalidate old cached image
  - Remove from cache and fetch new image
  - Update metadata with new URL

### FR-5: Image Loading Behavior
- On contact profile load:
  1. Check if image URL is in cache and URL matches
  2. If cached and URL matches, load from disk
  3. If not cached or URL changed, fetch from network
  4. Save to cache and update metadata
  5. Display image (or fallback to letter circle for avatar)
- Handle load errors gracefully (network failure, invalid URL, etc.)
- Use existing URL sanitization (url-sanitizer.ts) for XSS prevention
- Show loading state while fetching images

### FR-6: Navigation and Integration
- Return to chat view via:
  - Cancel/Back button in panel header
  - Escape key
- Navigation does not require unsaved changes handling (read-only view)
- Sidebar behavior:
  - When entering contacts view, sidebar shows contact list
  - Contact list persists until user exits contacts view
  - Identity selection remains active (determines which contacts shown)

## Critical Constraints

### CC-1: Data Isolation
- Contacts are always scoped to the selected identity
- Contact list filtered by `identity_id`
- No cross-identity contact viewing

### CC-2: Read-Only Profiles
- Contact profiles are display-only
- Users cannot edit contact profile information
- Only contact alias can be edited (existing feature, not part of this panel)

### CC-3: Image Cache Performance
- LRU cache with 100MB limit ensures bounded disk usage
- Cache metadata tracked in memory or lightweight DB for fast lookup
- Cache eviction does not impact app responsiveness

### CC-4: Security
- All image URLs sanitized before display (existing url-sanitizer.ts)
- Only http/https protocols allowed
- Cache files have appropriate permissions (not world-readable)

### CC-5: Offline Graceful Degradation
- Cached images available offline
- If image not cached and network unavailable, show fallback (letter circle for avatar, no banner)
- No blocking or error states due to network issues

## Integration Points

### IP-1: Existing Components
- **SubPanel**: Reuse for consistent layout (header with title, scrollable content)
- **Avatar**: Reuse with cache-aware image loading
- **ContactList pattern**: Follow IdentityList pattern from main.tsx:585-735
- **Field components**: Use Chakra UI Field.Root, Field.Label for read-only display

### IP-2: Data Layer
- **Service**: Use `NostlingService.listContacts(identityId)` to fetch contacts
- **Profile Enhancement**: Use `enhanceContactsWithProfilesSqlJs` to populate profile data
- **Profile Fields**: ProfileContent interface from shared/profile-types.ts

### IP-3: IPC API
- Use existing `window.api.nostling.contacts.*` methods
- May need new method: `getContactProfile(contactId)` if enhancement insufficient
- Image cache operations via new API namespace: `window.api.nostling.imageCache.*`
  - `getCachedImage(url): Promise<CachedImage | null>`
  - `cacheImage(url, data): Promise<void>`
  - `invalidateCache(url): Promise<void>`

### IP-4: View State Management
- Add 'contacts' to currentView type in main.tsx
- Add menu item in Header component (hamburger menu)
- Handle view transitions in main view routing logic

## User Preferences

- Follow existing patterns from identities panel for consistency
- Social media-style banner display (as header background)
- Clean, uncluttered layout focusing on profile information
- Fast image loading with caching for good UX

## Codebase Context

See `.exploration/contacts-panel-context.md` for exploration findings.

### Key Reference Implementations
- **IdentitiesPanel.tsx**: Template for panel structure, state management
- **ProfileEditor.tsx**: Template for field display (adapt to read-only)
- **IdentityList** (main.tsx:585-735): Sidebar list pattern
- **Avatar.tsx**: Image display with fallback
- **url-sanitizer.ts**: URL validation

## Out of Scope

- Editing contact profiles (read-only only)
- Adding/removing contacts (existing features, not modified)
- Editing contact alias (existing feature in contacts list, not added to panel)
- Public profile discovery or refresh (uses existing cached profile data)
- Real-time profile updates (loads profile on panel open, no live sync)
- Image optimization/compression (stores images as-is from URLs)
- Multiple image formats or conversions
- Animated/GIF support (treat as static images)

## Related Artifacts

- **Exploration Context**: `.exploration/contacts-panel-context.md`

---

**Note**: This is a requirements specification, not an architecture design.
Edge cases, error handling details, and implementation approach will be
determined by the integration-architect during Phase 2.
