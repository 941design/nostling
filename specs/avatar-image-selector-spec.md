# Avatar Image Selector - Requirements Specification

## Problem Statement

Users currently must manually find, host, and enter URLs for profile pictures. This creates friction in the profile setup process and limits avatar selection to users who can host images externally. By integrating with an external avatar image server, users can browse and select from a curated collection of avatars, improving the onboarding experience and profile customization.

## Core Functionality

Add an avatar browser modal that allows users to:
1. Browse avatars from an external image API
2. Filter avatars by subject
3. Preview and select avatars with pagination
4. Auto-populate the picture URL field when an avatar is selected
5. See a placeholder for future file upload functionality (currently disabled)

The feature integrates with the existing profile editing workflow, specifically when editing an identity's profile picture.

## Functional Requirements

### FR1: Avatar Browser Modal
- **Trigger**: Add a "Browse" button next to the picture URL input field in the ProfileEditor component
- **Layout**: Modal with two tabs:
  - "Browse Server" (active/enabled): Shows avatar search interface
  - "Upload File" (disabled): Placeholder tab with tooltip indicating "Coming soon" or similar
- **Acceptance Criteria**:
  - Modal opens when "Browse" button is clicked
  - Modal follows existing Chakra UI Dialog pattern
  - Disabled "Upload File" tab is visible but not clickable
  - Modal can be closed via close button, ESC key, or backdrop click

### FR2: Avatar Search and Display
- **API Integration**: Connect to avatar image server documented in `docs/avatar-image-api.md`
  - Base URL: `https://wp10665333.server-he.de`
  - Search endpoint: `/cgi/search?<query-parameters>`
  - Vocabulary endpoint: `/vocab.json`
- **Display**: Show avatars in a grid layout (4x5 = 20 avatars per page)
- **Acceptance Criteria**:
  - Avatars display as clickable thumbnail images
  - Grid is responsive and visually consistent with app theme
  - Loading state shown while fetching from API
  - Error state shown if API request fails
  - Empty state shown if no results match filters

### FR3: Subject Filter
- **Filter UI**: Dropdown or select input for "subject" filter
- **Vocabulary Loading**: Fetch available subject values from `/vocab.json` on modal open
- **Acceptance Criteria**:
  - Subject filter options populated from API vocabulary
  - Default state shows all avatars (no filter applied)
  - Changing filter re-fetches results and resets to page 1
  - Filter selection persists while browsing pages

### FR4: Pagination
- **Page Size**: 20 avatars per page (limit=20)
- **Controls**: Previous/Next buttons (and optionally page number display)
- **Acceptance Criteria**:
  - "Previous" button disabled on first page
  - "Next" button disabled when no more results available (items.length < limit)
  - Page navigation maintains current filter selection
  - Loading state shown during page navigation

### FR5: Avatar Selection
- **Interaction**: Click on avatar thumbnail to select
- **Behavior**: Auto-fill picture URL field and close modal
- **URL Construction**: Prepend base URL to relative path from API
  - API returns: `{"url": "/avatars/uuid.png"}`
  - Full URL: `https://wp10665333.server-he.de/avatars/uuid.png`
- **Acceptance Criteria**:
  - Clicking avatar immediately populates picture URL field
  - Modal closes automatically after selection
  - Selected URL is sanitized via existing `sanitizePictureUrl()` function
  - ProfileEditor shows image preview after selection

### FR6: Image Caching
- **Caching Strategy**: Use existing `image-cache-service` for avatar images
- **Scope**: Cache both thumbnail displays in browser and final selected avatar
- **Acceptance Criteria**:
  - Avatar images cached using existing IPC handlers (`nostling:image-cache:cache`)
  - Cached images improve performance on repeat modal opens
  - Cache respects existing LRU eviction policy (100MB max)

## Critical Constraints

### Security
- All avatar URLs must pass through existing `sanitizePictureUrl()` validation
- Only HTTP/HTTPS protocols allowed
- API requests must use existing fetch pattern with 30-second timeout (from image-fetcher.ts)

### Performance
- Pagination keeps memory footprint low (20 images at a time)
- Image caching prevents redundant network requests
- Loading states prevent UI blocking during API calls

### API Limits (from API documentation)
- Respect API constraints: max 500 limit, max 10 filter keys, max 50 values per key
- Handle 400 errors (invalid query) gracefully with user-friendly messages
- Handle 500 errors (server error) with retry or error message

### UI Consistency
- Modal must follow existing Chakra UI Dialog pattern
- Theme integration via `useThemeColors()` hook
- Button styling consistent with existing app patterns
- Grid layout responsive to different window sizes

## Integration Points

### Profile Editing Flow
- **Component**: `src/renderer/components/IdentitiesPanel/ProfileEditor.tsx`
- **Location**: Add "Browse" button in HStack alongside picture URL input field
- **Pattern**: Similar to QR scanner button in ContactModal

### Modal Implementation
- **Pattern**: Chakra UI Dialog.Root with Dialog.Content, Dialog.Body, Dialog.Footer
- **Reference**: See ContactModal, QrCodeScannerModal for nested modal patterns
- **Tabs**: Use Chakra Tabs.Root for "Browse Server" / "Upload File" tabs

### API Communication
- **Layer**: Implement in main process (similar to image-cache) OR renderer process
- **HTTP Client**: Use native fetch with AbortController for timeout
- **IPC**: If main process, add new handlers like `nostling:avatar-api:search`, `nostling:avatar-api:vocab`

### Image Display
- **Component**: Use CachedImage component for avatar thumbnails
- **Grid**: Chakra UI Grid or SimpleGrid component
- **Fallback**: Show placeholder or error icon if avatar image fails to load

## User Preferences

1. **Simple Filter UI**: Only expose subject filter (not all vocabulary keys) to keep UI uncluttered
2. **Quick Selection**: Auto-fill and close on selection (no confirmation step)
3. **Future-Ready**: Show disabled "Upload File" tab to indicate upcoming feature
4. **Familiar Pattern**: Button alongside input (not replacing it) to preserve existing URL entry workflow

## Codebase Context

See `.exploration/avatar-image-selector-context.md` for exploration findings including:
- Existing modal patterns and Chakra UI architecture
- Profile editing components and IPC communication
- Image caching service and CachedImage component
- HTTP fetch patterns with timeout and security

## Related Artifacts

- **Exploration Context**: `.exploration/avatar-image-selector-context.md`
- **API Documentation**: `docs/avatar-image-api.md`

## Out of Scope

### Not Included in This Feature
- File upload functionality (tab present but disabled)
- Filters other than "subject" (color, style, etc.)
- Advanced search or text-based search
- Avatar favoriting or history
- Avatar editing or customization
- Multiple avatar selection
- Infinite scroll (using pagination instead)
- Banner image selection (only profile picture)

### Future Enhancements (Not Required Now)
- Enable "Upload File" tab with Electron dialog integration
- Add more filter types (color, style, etc.)
- Avatar preview hover effects or zoom
- Recently selected avatars history
- Integration with other image sources (Gravatar, Nostr media servers, etc.)

---

**Note**: This is a requirements specification, not an architecture design. Implementation details such as exact component structure, state management approach, error handling specifics, and testing strategy will be determined by the integration-architect during Phase 2 of the execution workflow.
