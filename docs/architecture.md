# Architecture

This document describes the technical architecture of Nostling.

## Electron Process Model

Nostling follows Electron's three-process architecture:

### Main Process

The Node.js backend that manages the application lifecycle, creates browser windows, and handles system-level operations.

**Responsibilities:**
- Application lifecycle management
- Window creation and management
- Auto-update orchestration and cryptographic verification
- IPC request handling
- File system access (config, logs)
- macOS DMG installation handling

**Key modules:**
- `src/main/index.ts` - Entry point, lifecycle management
- `src/main/update/` - Update controller and platform-specific handlers
- `src/main/security/` - RSA signature and hash verification
- `src/main/ipc/` - IPC handler registration
- `src/main/config.ts` - Configuration management
- `src/main/logging.ts` - Structured logging

### Preload Script

A security bridge running in an isolated context that selectively exposes APIs from the main process to the renderer.

**Security configuration:**
- `contextIsolation: true` - Isolated JavaScript context
- `nodeIntegration: false` - No Node.js APIs in renderer

**Exposed API:**
```typescript
window.api = {
  updates: {
    checkNow(): Promise<void>;
    downloadUpdate(): Promise<void>;
    restartToUpdate(): Promise<void>;
    onUpdateState(callback): () => void;
  },
  config: {
    get(): Promise<AppConfig>;
    set(config): Promise<AppConfig>;
  },
  system: {
    getStatus(): Promise<AppStatus>;
  }
}
```

### Renderer Process

The React application that users interact with. Runs in a sandboxed Chromium environment and communicates with the main process through the preload script's exposed API.

**Stack:**
- React 18 with hooks
- Chakra UI v3 for components
- TypeScript with strict mode
- Vite for bundling

**Key features:**
- Themed status messages using JSON-based configuration with runtime validation
- Memoized message selection for performance optimization
- View mode system: chat view (default) and identities view (profile editor panel)

## Directory Structure

```
src/
├── main/           # Main process (Node.js)
│   ├── index.ts    # Entry point
│   ├── config.ts   # Configuration
│   ├── logging.ts  # Logging system
│   ├── ipc/        # IPC handlers
│   ├── security/   # Crypto verification
│   ├── relay/      # Relay configuration management
│   ├── update/     # Update management
│   └── nostling/   # Nostr protocol features
│       ├── profile-event-builder.ts      # Private profile event creation
│       ├── profile-sender.ts             # NIP-59 gift wrap sending
│       ├── profile-receiver.ts           # NIP-59 unwrapping
│       ├── profile-persistence.ts        # Database operations
│       ├── profile-service-integration.ts # Workflow orchestration
│       └── profile-discovery.ts          # Public profile discovery
├── preload/        # Preload script
│   └── index.ts    # API bridge
├── renderer/       # React frontend
│   ├── main.tsx    # React root
│   ├── index.html  # HTML entry
│   ├── components/ # UI components
│   │   ├── Avatar.tsx            # Base avatar with image/letter
│   │   ├── AvatarWithBadge.tsx   # Avatar + status badge
│   │   ├── avatar-icons.tsx      # Shield icon variants
│   │   ├── RelayManager.tsx      # Relay configuration UI
│   │   ├── ThemeSelectionPanel/  # Theme selection panel
│   │   │   ├── ThemeSelectionPanel.tsx  # Panel container
│   │   │   ├── ThemeCarousel.tsx # Theme preview carousel
│   │   │   ├── ThemePreview.tsx  # Live theme preview
│   │   │   ├── ThemeFilters.tsx  # Brightness/color filters
│   │   │   └── ThemeInfo.tsx     # Theme metadata display
│   │   ├── IdentitiesPanel/      # Identity profile editor
│   │   │   ├── IdentitiesPanel.tsx  # Panel container with state
│   │   │   └── ProfileEditor.tsx # 8-field profile form
│   │   ├── EmojiPicker/          # Emoji insertion with accessibility
│   │   │   ├── EmojiPicker.tsx   # Menu-based emoji grid
│   │   │   ├── EmojiButton.tsx   # Trigger button component
│   │   │   ├── useEmojiInsertion.ts # Cursor insertion logic
│   │   │   └── types.ts          # Emoji set and type definitions
│   │   ├── QrCodeScanner.tsx     # Camera-based QR scanning
│   │   └── QrCodeDisplay.tsx     # QR code display modal
│   ├── themes/     # Theme system
│   │   ├── definitions.ts     # Theme registry and configs
│   │   └── useTheme.ts        # Theme application logic
│   └── utils/      # Utilities
│       ├── themed-messages.ts    # Theme configuration
│       ├── utils.themed.ts       # Update status theming
│       ├── state.themed.ts       # Nostling queue theming
│       └── url-sanitizer.ts      # XSS protection for URLs
└── shared/         # Shared types
    └── types.ts    # TypeScript definitions
```

## IPC Communication

IPC channels use domain-prefixed naming:

| Channel | Purpose |
|---------|---------|
| `system:get-status` | Get app status, logs, update state |
| `updates:check` | Trigger update check |
| `updates:download` | Start download |
| `updates:restart` | Apply update and restart |
| `config:get` | Get configuration |
| `config:set` | Update configuration |
| `relay:load` | Load relay configuration for identity |
| `relay:save` | Save relay configuration with hash verification |
| `nostling:identities:update-theme` | Update theme for identity |
| `update-state` | Broadcast state changes |

## Update System

### State Machine

The update system operates as a state machine with these phases:

1. `idle` - No update activity
2. `checking` - Checking for updates
3. `available` - Update found, awaiting user action
4. `downloading` - Download in progress
5. `downloaded` - Download complete
6. `verifying` - Cryptographic verification
7. `ready` - Verified and ready to install
8. `failed` - Error occurred

**macOS-specific phases:**
- `mounting` - DMG being mounted
- `mounted` - Finder window open for installation

### Verification Flow

1. electron-updater downloads the artifact
2. Fetch `manifest.json` from the release
3. Verify RSA-4096 signature on manifest
4. Validate version is newer than current
5. Compute SHA-256 hash of downloaded file
6. Compare hash with manifest entry
7. Apply update only if all checks pass

### Concurrency Protection

The update system includes guards to prevent race conditions:
- Only one update check at a time
- Only one download at a time
- Manual refresh disabled during active operations

## Build System

### Build Tools

| Tool | Purpose |
|------|---------|
| tsup | Bundles main and preload processes |
| Vite | Bundles renderer (React app) |
| electron-builder | Creates distributable packages |

### Build Configuration

**tsup** (`tsup.config.ts`):
- Target: Node 18
- Embeds RSA public key at build time
- External: electron, electron-updater

**Vite** (`vite.renderer.config.ts`):
- Port: 5173 (dev server)
- React plugin enabled
- Output: `dist/renderer`

### Output Structure

```
dist/
├── main/           # Main process bundle
├── preload/        # Preload script bundle
└── renderer/       # React app (HTML, JS, CSS)

release/            # After packaging
├── Nostling-x.y.z.dmg      # macOS installer
├── Nostling-x.y.z.zip      # macOS zip
├── Nostling-x.y.z.AppImage # Linux portable
└── manifest.json           # Signed manifest
```

## Security Model

### Renderer Isolation

- No direct Node.js access from renderer
- All system operations via IPC
- Typed channels with input validation
- No generic eval or dynamic code loading

### Update Security

- RSA-4096 signature verification on manifests
- SHA-256 hash verification on artifacts
- Version validation (no downgrades)
- HTTPS-only in production
- Error messages sanitized in production

### Secret Storage

The application uses OS-provided secure storage for identity secrets (private keys).

**Storage Mechanisms:**

- **Production mode**: Uses Electron's `safeStorage` API backed by OS keychain
  - macOS: Keychain Services
  - Linux: libsecret (Secret Service API)
- **Dev mode**: Detected via `NOSTLING_DATA_DIR` environment variable
  - Uses base64 encoding without encryption
  - Prevents session-specific encryption key conflicts during development

**Error Handling:**

- **SecretDecryptionError**: Thrown when decryption fails (corrupted data, wrong key)
- **SecureStorageUnavailableError**: Thrown when OS keychain unavailable
- Errors propagated through IPC with structured error types
- UI displays clear error messages with recovery guidance
- No plaintext fallback in production mode

**Error Propagation Flow:**

1. Secret storage layer (`secret-store.ts`) throws typed errors
2. Service layer (`service.ts`) catches and re-throws with context
3. IPC handlers (`handlers.ts`) serialize errors to structured format
4. Renderer (`IdentitiesPanel.tsx`) receives and displays error messages
5. User sees actionable error (e.g., "Failed to decrypt secret - keychain access denied")

### Key Management

- **Private key**: CI secret only, never in repo
- **Public key**: Embedded at build time from `keys/nostling-release.pub`
- Override via `RSA_PUBLIC_KEY` environment variable for testing

## Platform-Specific Handling

### macOS

- Uses manual DMG installation (bypasses Squirrel.Mac)
- Mounts DMG and opens Finder for drag-to-Applications
- Cleans up stale mounts on startup
- Unsigned (`identity: null`) to avoid Gatekeeper issues with auto-updates

### Linux

- AppImage format for portability
- No root required for installation or updates
- Standard electron-updater flow

## Relay Configuration System

The relay manager provides per-identity relay configuration with filesystem-based persistence and conflict detection.

### Architecture

**Filesystem-Based Storage:**
- Configuration stored at `~/.config/nostling/identities/<identityId>/relays.json`
- One file per identity, isolated from database
- Human-readable JSON format for manual editing
- Automatic directory creation on first save

**File Format:**
```json
{
  "relays": [
    {
      "url": "wss://relay.example.com",
      "read": true,
      "write": true
    }
  ]
}
```

**Hash-Based Overwrite Protection:**
- SHA-256 hash computed on load and before save
- Detects external modifications to relay configuration files
- On conflict: presents modal with Reload/Overwrite/Cancel options
- Prevents accidental loss of manual edits

**Migration from Database:**
- One-time idempotent migration from SQLite `relays` table
- Runs automatically on first relay:load for each identity
- Creates filesystem config from database records
- Database records remain unchanged (safe rollback)

### UI Components

**Compact Table Layout:**
- High-density rows (≤36px) using @tanstack/react-table
- Columns: Status indicator, URL, Read checkbox, Write checkbox, Actions
- Drag handle for reordering
- Delete button per row

**Drag-and-Drop Reordering:**
- Implemented with dnd-kit library
- Visual feedback during drag operations
- Preserves read/write policies during reorder
- Updates configuration order immediately

**Read/Write Policies:**
- Read checkbox: controls relay subscription (receiving events)
- Write checkbox: controls relay publishing (sending events)
- Independent controls per relay
- Persisted in relays.json

**Live Status Indicators:**
- Green dot: connected
- Yellow dot: connecting/reconnecting
- Red dot: disconnected/error
- Based on WebSocket connection state

### Conflict Resolution

When external modifications detected:

1. **Reload**: Discard UI changes, load file from disk
2. **Overwrite**: Save UI state, replace file contents
3. **Cancel**: Keep UI state, remain in conflict state

User must explicitly resolve conflict before saving again.

## Themed Messages System

The application uses ostrich-themed status messages throughout the UI to provide a playful, branded experience while maintaining technical clarity.

### Architecture

**Three-layer system:**

1. **Configuration Layer** (`themed-messages.ts`):
   - JSON-based theme definition with 2-3 alternatives per status type
   - Runtime validation with schema checking
   - Graceful fallback to default messages on validation failure
   - Single source of truth for all themed messages

2. **Update Status Theming** (`utils.themed.ts`):
   - Themes update-related status messages (checking, downloading, up to date, etc.)
   - Preserves dynamic content (version numbers, progress percentages, download speeds)
   - Random selection from configured alternatives on each display
   - Memoized with React.useMemo for performance

3. **Nostling Queue Theming** (`state.themed.ts`):
   - Themes Nostling message queue status (queued, sending, receiving, etc.)
   - Preserves dynamic content (message counts, error details)
   - Consistent random selection behavior
   - Integrated with queue state display components

### Message Categories

**Update Status Messages:**
- Idle states: "Standing tall", "Tall and proud", "Head held high"
- Active states: "Eyes peeled", "Pecking up", "Looking sharp"
- Error states: "Ruffled feathers", "Tangled nest"

**Nostling Queue Status:**
- Queue states: "Flock gathered", "Nestling in"
- Active states: "Wings spread", "Feathers flying"
- Completion states: "Nest secured", "Roost reached"

### Design Principles

- **Preserve technical information**: All version numbers, counts, and error details remain intact
- **Random variety**: Each display randomly selects from available alternatives to keep experience fresh
- **Graceful degradation**: Invalid configuration falls back to default messages without breaking UI
- **Performance**: Message selection memoized to avoid unnecessary recalculation
- **Testability**: Property-based tests verify message structure, dynamic content preservation, and randomness

## Theme System

The application provides per-identity theme customization with 10 distinctive color schemes, allowing users to personalize their visual experience and distinguish identities at a glance.

### Architecture

**Theme Registry:**
- Centralized theme definitions in `src/renderer/themes/definitions.ts`
- 10 predefined themes with complete Chakra UI v3 color token sets
- Each theme includes metadata for UI display (name, description, preview colors)
- Type-safe theme IDs via TypeScript union type

**Theme Application:**
- Theme stored per-identity in SQLite database (identities table, theme column)
- Automatic theme loading on identity selection
- Real-time theme switching via React state propagation
- Invalid/missing themes fall back to dark theme

**Integration Points:**
1. **Database Layer** (`src/main/ipc/nostling.ts`):
   - `identities.updateTheme(identityId, themeId)` - Persists theme to database
   - Identity records include optional `theme` field

2. **UI Layer** (`src/renderer/main.tsx`):
   - `ChakraProvider` wraps app with dynamic theme system
   - `useTheme` hook manages theme state and identity-based resolution
   - Theme changes trigger immediate UI re-render

3. **Theme Selection Panel** (`src/renderer/components/ThemeSelectionPanel/`):
   - Full-panel theme selection (replaces modal)
   - Live preview with composed UI elements
   - Carousel navigation with keyboard support
   - Brightness and color family filters
   - Disabled when no identity selected

### Theme Definitions

**Available Themes:**
- **Light** - Clean bright interface with dark text on light background
- **Dark** - Default dark theme with light text on dark background
- **Sunset** - Warm oranges and pinks
- **Ocean** - Cool blues and teals
- **Forest** - Natural greens
- **Purple Haze** - Deep purples
- **Ember** - Fiery reds and oranges
- **Twilight** - Muted blues and purples
- **Mint** - Fresh mint greens
- **Amber** - Golden yellows

**Color Token Requirements:**
- WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
- Complete Chakra UI v3 color token set
- Compatible with all existing UI components
- Distinctive visual identity per theme

### User Workflow

1. User selects identity from identity list
2. App loads theme from database for that identity (or defaults to dark)
3. Theme system creates Chakra configuration from theme ID
4. UI re-renders with new theme applied
5. User can change theme via hamburger menu → Theme selector
6. Theme change persists to database and updates UI immediately
7. When switching identities, app applies the new identity's saved theme

### Design Principles

- **Per-identity isolation**: Each identity maintains its own theme preference
- **Immediate feedback**: Theme changes apply instantly without save button
- **Graceful fallback**: Invalid themes default to dark without breaking UI
- **Type safety**: Theme IDs validated at compile-time via TypeScript
- **Performance**: Theme system creation memoized to avoid unnecessary recalculation
- **Testability**: Property-based tests verify persistence, application, fallback, and identity switching

## QR Code Contact Management

The application provides camera-based QR code scanning for adding contacts and QR code display for sharing identity npub values.

### Architecture

**Dual Functionality:**
1. **QR Code Scanning** - Camera-based scanning to add contacts
2. **QR Code Display** - Show identity npub as scannable QR code

**Scanner Integration:**
- Integrated into contact modal via camera icon button
- Uses html5-qrcode library for cross-platform camera access
- Frame rate limited to 20fps for performance optimization
- Automatic camera cleanup on modal close or component unmount

**Display Integration:**
- Accessible from identity list via QR code icon
- Uses qrcode library to generate QR code from npub
- Rendered as canvas element in modal dialog

### Scanner Lifecycle

**Initialization:**
1. User clicks camera icon in contact modal
2. Scanner requests camera permissions
3. Camera stream starts at 20fps
4. QR code detection begins

**Detection:**
1. Frame capture and QR code detection via html5-qrcode
2. Successful detection extracts npub from QR code
3. Scanner populates npub field in contact form
4. User reviews and verifies npub before adding contact

**Cleanup:**
1. User closes modal or stops scanner
2. Camera stream stopped via html5-qrcode.stop()
3. Camera permissions released
4. Lifecycle guards prevent double-cleanup

### QR Code Display

**Generation:**
1. User clicks QR icon next to identity in identity list
2. npub extracted from identity record
3. QR code generated via qrcode.toCanvas()
4. Canvas rendered in modal dialog

**Theme Adaptation:**
- QR codes adapt colors based on current theme
- Light themes: dark foreground, light background
- Dark themes: light foreground, dark background
- Ensures scanability across all theme combinations

### Data Integrity

**Database Constraint:**
- UNIQUE constraint on (identity_id, contact_npub) in contacts table
- Prevents duplicate contacts within same identity
- Different identities can have same contact (isolation)
- Constraint enforced at database level for reliability

### Performance Optimizations

**Scanner Performance:**
- Frame rate limited to 20fps (50ms between frames)
- Prevents excessive CPU usage during scanning
- Balances detection speed with resource efficiency

**Resource Management:**
- Camera cleanup on all exit paths (modal close, unmount, error)
- Lifecycle guards prevent resource leaks
- Proper async cleanup handling

### User Workflow

**Adding Contact via QR Scan:**
1. User opens contact management modal
2. Clicks camera icon to activate scanner
3. Points camera at QR code containing npub
4. Scanner detects QR code and populates npub field
5. User reviews populated npub
6. User adds contact (duplicate detection via database constraint)

**Displaying Identity QR Code:**
1. User navigates to identity list
2. Clicks QR code icon next to desired identity
3. Modal opens showing npub as scannable QR code
4. Other users scan with their camera to add contact

### Design Principles

- **Camera lifecycle safety**: Proper cleanup on all exit paths
- **Theme consistency**: QR codes adapt to current theme colors
- **Performance**: Frame rate limiting prevents resource exhaustion
- **Data integrity**: Database constraints prevent duplicates
- **User control**: Scanner activation explicit via button click
- **Testability**: Property-based tests verify scanner lifecycle, display, theme adaptation

## Profile Avatars with Status Badges

The application displays visual profile representations with status indicators throughout the UI.

### Architecture

**Avatar Components:**

1. **Avatar.tsx**: Base avatar component
   - Displays profile picture from URL when available
   - Falls back to letter circle (first letter of display name)
   - XSS protection through URL sanitization
   - Image error handling with automatic fallback
   - Circular cropping and aspect ratio preservation

2. **AvatarWithBadge.tsx**: Avatar with profile status overlay
   - Combines base avatar with badge overlay
   - Badge positioned at top-right corner
   - Status determination based on ProfileSource
   - WCAG AA compliant contrast (4.5:1)
   - Enhanced visibility with border and shadow

3. **avatar-icons.tsx**: Status badge icon components
   - ShieldCheckIcon: Private profile (private_authored, private_received)
   - ShieldWarningIcon: Public profile (public_discovered)
   - ShieldOffIcon: No profile data (alias/npub fallback)
   - Custom SVG components following project pattern

4. **url-sanitizer.ts**: XSS protection utility
   - Validates and sanitizes profile picture URLs
   - Allows only http/https protocols
   - Prevents javascript: and data: URL attacks
   - Returns null for invalid URLs

5. **service-profile-status.ts**: Backend profile enhancement
   - Batch SQL queries for efficient profile loading
   - Enriches identity and contact records with profileSource and picture
   - Single query per list (no N+1 query problem)
   - Integration with existing list handlers

### Integration Points

**Identity List:**
- Avatar displays identity's own profile picture
- Badge shows private_authored (private profile) or public_discovered status
- 32px avatar size for list items

**Contact List:**
- Avatar displays contact's shared profile picture
- Badge shows private_received (private profile) or public_discovered status
- Same visual treatment as identity list for consistency

**Profile Data Flow:**
1. Frontend requests identity/contact list
2. Backend queries profiles table with batch SQL
3. Backend enriches records with profileSource and picture fields
4. Frontend receives complete data for rendering
5. Avatar component handles URL sanitization and fallback logic

### Design Principles

- **Security-first**: All profile picture URLs sanitized to prevent XSS
- **Graceful degradation**: Image load failures fall back to letter circle
- **Performance**: Batch queries avoid N+1 problem
- **Accessibility**: WCAG AA contrast, semantic icons, proper alt text
- **Consistency**: Same avatar treatment across all UI locations
- **Theme compatibility**: Works with all 10 theme variants

## Private Profile Sharing

The application enables private profile sharing with contacts via NIP-59 encrypted messages, without publishing profiles to public relays.

### Architecture

**Six Core Components:**

1. **profile-event-builder**: Creates private profile events (kind 30078)
   - Builds signed Nostr events with profile content
   - Ensures deterministic serialization for idempotency
   - Validates profile content structure

2. **profile-sender**: Sends private profiles via NIP-59 gift wrap
   - Wraps profile events for specific recipients
   - Publishes to configured relays
   - Handles send failures gracefully

3. **profile-receiver**: Receives and unwraps incoming profiles
   - Unwraps NIP-59 gift-wrapped messages
   - Validates signatures before storage
   - Handles invalid/malformed messages

4. **profile-persistence**: Database operations for profiles
   - Stores profiles with source tagging (private_authored, private_received, public_discovered)
   - Tracks per-contact send state
   - Records public profile presence checks

5. **profile-service-integration**: Orchestrates profile workflows
   - Coordinates sending on contact addition
   - Broadcasts updates to all contacts
   - Resolves display names with precedence rules

6. **profile-discovery**: Discovers public profiles from relays
   - Hourly checks for kind:0 metadata
   - Updates presence indicators
   - Runs on app startup

### Database Schema

**nostr_profiles:**
```sql
id TEXT PRIMARY KEY
owner_pubkey TEXT NOT NULL
source TEXT NOT NULL  -- 'private_authored' | 'private_received' | 'public_discovered'
content_json TEXT NOT NULL
event_id TEXT
valid_signature INTEGER DEFAULT 1
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

**nostr_profile_send_state:**
```sql
identity_pubkey TEXT NOT NULL
contact_pubkey TEXT NOT NULL
last_sent_profile_event_id TEXT
last_sent_profile_hash TEXT
last_attempt_at TEXT
last_success_at TEXT
last_error TEXT
PRIMARY KEY (identity_pubkey, contact_pubkey)
```

**nostr_public_profile_presence:**
```sql
pubkey TEXT PRIMARY KEY
exists INTEGER DEFAULT 0
last_checked_at TEXT
last_check_success INTEGER DEFAULT 0
last_seen_event_id TEXT
```

### Workflows

**Send on Add Contact:**
1. User adds new contact
2. System loads current private profile for identity
3. Check send state - skip if already sent this version
4. Build private profile event (kind 30078)
5. Wrap event with NIP-59 for recipient
6. Publish to configured relays
7. Record send state with profile hash

**Send on Profile Update:**
1. User updates private profile
2. Store new profile version in database
3. Load all contacts for identity
4. For each contact:
   - Build private profile event
   - Wrap with NIP-59
   - Publish to relays
   - Update send state
5. Best-effort delivery (no retry queue)

**Receive Private Profile:**
1. Receive NIP-59 wrapped message (kind 1059)
2. Unwrap to extract inner event
3. Check inner kind == 30078 (private profile)
4. Validate signature matches sender
5. Parse content as profile metadata
6. Store/replace in database as 'private_received'
7. Update display name resolution

**Display Name Resolution:**
1. Check for custom alias (highest priority)
2. Check for private profile (private_received or private_authored)
3. Check for public profile (public_discovered)
4. Fallback to npub (shortened)

### NIP-59 Integration

**Gift Wrap Process:**
- Inner event: Private profile (kind 30078) signed by sender
- Seal layer: Encrypted inner event
- Outer event: Gift wrap (kind 1059) with random keypair
- Addressed to specific recipient pubkey
- Published to configured write relays

**Unwrap Process:**
- Receive kind 1059 event
- Decrypt seal with recipient's secret key
- Extract inner event
- Validate inner event signature
- Process based on inner event kind

### Privacy Guarantees

**What is NOT published publicly:**
- Private profile events (kind 30078) - never published unwrapped
- Profile content - only transmitted via NIP-59 encryption
- List of contacts who received profiles

**What is published publicly:**
- NIP-59 gift wrap envelopes (kind 1059) - encrypted, no readable metadata
- Encrypted seal events - no plaintext content

**What is discovered publicly:**
- Public profiles (kind 0) from contacts - read-only, never published by app

### Send State Tracking

**Purpose:**
- Prevent redundant sends when re-adding contacts
- Track delivery success/failure per contact
- Enable idempotent operations

**State Fields:**
- `last_sent_profile_hash`: SHA-256 hash of sent profile content
- `last_attempt_at`: Timestamp of last send attempt
- `last_success_at`: Timestamp of successful send
- `last_error`: Error message if send failed

**Idempotency:**
- Compare current profile hash with last_sent_profile_hash
- Skip send if hashes match (already sent this version)
- Update state only on successful send

### Public Profile Discovery

**Schedule:**
- On app startup (after initialization)
- Every hour thereafter

**Process:**
1. Query configured relays for kind:0 metadata
2. For each identity and contact:
   - Fetch latest kind:0 event
   - Verify signature
   - Store content as 'public_discovered'
   - Update presence table
3. Update UI indicators based on presence

**Indicator Behavior:**
- Show indicator only after successful check confirms existence
- Hide indicator if latest check fails (no "unknown" state)
- Separate tracking for identities and contacts

### Error Handling

**Send Failures:**
- Log failure with contact pubkey and error
- Store error in send_state table
- Continue sending to remaining contacts
- Surface failure count in UI (optional)

**Receive Failures:**
- Invalid signature: discard, log warning
- Malformed content: discard, log error
- Unwrap failure: discard (not a private profile)

**Discovery Failures:**
- Relay timeout: hide presence indicator
- No kind:0 found: mark as not present
- Invalid signature: ignore event

### Design Principles

- **Privacy-first**: No public profile publishing, encrypted transmission only
- **Best-effort delivery**: No retry queues, sends once per update
- **Idempotent sends**: Track state to prevent redundant sends
- **Graceful degradation**: Send failures don't block normal operation
- **Display precedence**: Clear hierarchy (alias > private > public > npub)
- **Zero regressions**: All implementations preserve existing test suite
- **Comprehensive testing**: 121 tests (109 unit + 12 integration)

## Identity Profile Editor Panel

The application provides a full-featured profile editing interface for identities, allowing users to edit all profile fields with live preview and staged updates.

### Architecture

**View Mode System:**
- Application supports two view modes: `chat` (default) and `identities` (profile editor)
- View mode stored in `AppView` state: `{ view: 'chat' | 'identities' }`
- View switching controlled by menu actions and panel close operations
- Main content pane swaps between ConversationPane and IdentitiesPanel based on view mode

**Sidebar Content Swap Pattern:**
- Normal chat view: hamburger menu visible in sidebar header
- Identities panel open: Cancel and Apply buttons replace hamburger menu
- State tracked via `isIdentitiesMode` boolean derived from `appView.view === 'identities'`
- Sidebar header content swap implemented in Sidebar.tsx

**Panel Components:**

1. **IdentitiesPanel.tsx**: Panel container
   - Manages profile state loading and saving
   - Tracks dirty state (changes detected)
   - Coordinates Apply/Cancel actions
   - Integrates with private profile broadcast system
   - Handles save operation locking to prevent conflicts

2. **ProfileEditor.tsx**: Form component
   - 8 profile fields: Label, Name, About, Picture URL, Banner URL, Website, NIP-05, Lightning Address (lud16)
   - Staged editing: onChange handlers immediately update staged state
   - Live image preview for Picture and Banner URL fields
   - Error handling for invalid/broken image URLs
   - Automatic fallback when image fails to load
   - Text input for single-line fields (Label, Name, Picture, Banner, Website, NIP-05, lud16)
   - Textarea for multiline field (About)

### Integration Points

**Menu Integration:**
- Hamburger menu includes "Edit Identity Profile" menu item
- Menu item triggers view mode change: `setAppView({ view: 'identities' })`
- Menu item disabled when no identity selected
- Menu rendered with `data-testid="identities-panel-trigger"` for testing

**Profile Service Integration:**
- Panel loads current profile via IPC: `identities.getIdentityProfile(identityId)`
- Panel saves updates via IPC: `identities.updateIdentityProfile(identityId, profile)`
- Save operation triggers automatic broadcast to all contacts
- Broadcast uses existing private profile sharing infrastructure (NIP-59)

**View Mode Control:**
- Open panel: `setAppView({ view: 'identities' })`
- Close panel (Cancel/Escape): `setAppView({ view: 'chat' })`
- Close panel (Apply): save profile, then `setAppView({ view: 'chat' })`
- Main pane render logic: `appView.view === 'identities' ? <IdentitiesPanel /> : <ConversationPane />`

### User Workflows

**Opening Panel:**
1. User has identity selected
2. User clicks hamburger menu
3. User clicks "Edit Identity Profile"
4. View switches to identities mode
5. IdentitiesPanel replaces conversation pane
6. Sidebar header shows Cancel/Apply buttons

**Editing Profile:**
1. Panel loads current profile from database
2. ProfileEditor displays all 8 fields with current values
3. User edits any field (name, about, picture URL, etc.)
4. Changes staged immediately (dirty state tracked)
5. Apply button enables when changes detected
6. Live preview shows picture/banner images as URLs typed

**Saving Changes:**
1. User clicks Apply button
2. Panel locks (buttons disabled, escape key blocked)
3. Profile saved to database via IPC
4. Profile broadcast to all contacts via NIP-59
5. View switches back to chat mode
6. Sidebar returns to normal state (hamburger menu visible)

**Canceling Changes:**
1. User clicks Cancel button or presses Escape
2. Staged changes discarded
3. View switches back to chat mode
4. No profile update or broadcast

**Escape Key Behavior:**
- Escape closes panel when not saving (same as Cancel)
- Escape blocked during save operation (prevent data conflicts)
- Implemented via `onKeyDown` handler checking `isSaving` state

### State Management

**Panel State:**
- `currentProfile`: Profile loaded from database
- `stagedProfile`: Profile with user's edits
- `isDirty`: Boolean, true when stagedProfile differs from currentProfile
- `isSaving`: Boolean, true during save operation
- `isLoading`: Boolean, true while fetching profile

**Dirty Detection:**
- Compare stagedProfile to currentProfile on every field change
- Enable Apply button only when isDirty === true
- Disable Apply button when clean (no changes)

**Save Operation Locking:**
- Set `isSaving = true` when Apply clicked
- Disable Cancel and Apply buttons during save
- Block Escape key during save
- Set `isSaving = false` after save completes (success or error)

### Profile Fields

**8 Editable Fields:**

1. **Label** (internal name, not shared in profile metadata)
   - Single-line text input
   - Used for identity identification in UI
   - Not included in shared profile events

2. **Name** (display name)
   - Single-line text input
   - Shared via private profile to contacts
   - Display name precedence: alias > private profile name > public profile name > npub

3. **About** (biography)
   - Multiline textarea
   - Supports multiple lines and blank lines
   - Shared via private profile

4. **Picture** (profile picture URL)
   - Single-line text input
   - Live preview: image displayed when URL valid
   - Preview error handling: hide preview on broken/invalid URL
   - Shared via private profile
   - URL sanitized before display (XSS protection)

5. **Banner** (banner image URL)
   - Single-line text input
   - Live preview with same behavior as Picture
   - Shared via private profile

6. **Website** (personal website URL)
   - Single-line text input
   - Shared via private profile

7. **NIP-05** (Nostr address verification)
   - Single-line text input
   - Format: user@domain.com
   - Shared via private profile

8. **Lightning Address (lud16)** (Lightning payment address)
   - Single-line text input
   - Format: address@domain.com
   - Shared via private profile

### Live Preview Implementation

**Picture Preview:**
- Rendered as `<img>` element when Picture URL field non-empty
- `data-testid="profile-editor-picture-preview"` for testing
- `onError` handler hides preview on load failure
- Preview hidden by default until valid URL provided

**Banner Preview:**
- Same implementation pattern as Picture preview
- `data-testid="profile-editor-banner-preview"`
- Independent state from Picture preview

**Preview Lifecycle:**
1. User types URL into Picture/Banner field
2. onChange handler updates stagedProfile
3. React re-renders preview with new URL
4. Browser attempts image load
5. On success: image displays
6. On failure: onError hides preview element

### Error Handling

**Profile Load Errors:**
- Display error message in panel
- Keep panel open, allow user to retry
- Log error to console

**Profile Save Errors:**
- Display error message to user
- Unlock panel (set isSaving = false)
- Keep staged changes (allow user to retry)
- Log error details

**Image Preview Errors:**
- Hide preview element (no error message to user)
- Field remains editable
- User can correct URL and preview will retry

### Testing

**E2E Integration Tests (14 tests):**
- Menu access and panel opening
- All 8 fields present and editable
- Apply button enable/disable based on dirty state
- Apply saves changes and returns to chat view
- Cancel discards changes and returns to chat view
- Escape key closes panel
- Save operation locking (buttons disabled, escape blocked)
- Image preview display for valid URLs
- Profile persistence across panel close/reopen
- Empty profile handling
- Loading state display
- Multiline text in About field

**Test Coverage:**
- Total test suite: 1435 tests
- All tests passing
- Zero regressions detected

### Design Principles

- **Staging pattern**: Changes tracked immediately, explicit Apply required to save
- **Save locking**: Prevent conflicts during async save operations
- **View mode isolation**: Clear separation between chat view and identities view
- **Sidebar content swap**: Context-aware UI (hamburger menu vs Cancel/Apply)
- **Live preview**: Immediate visual feedback for image URLs
- **Graceful degradation**: Image preview errors don't block editing
- **Integration with existing infrastructure**: Uses private profile sharing system for broadcast
- **Zero regressions**: All existing tests continue passing

## Contacts Panel with Image Cache

The application provides a read-only contacts panel for viewing full contact profiles with disk-based image caching for offline access.

### Architecture

**View Mode System:**
- Application view modes extended to include `contacts`: `'chat' | 'identities' | 'contacts'`
- Contacts view accessible from hamburger menu via "View Contact Profiles"
- Main content pane swaps to ContactsPanel when in contacts view mode
- Sidebar displays contact list filtered by selected identity (replaces identity list)

**Image Cache Architecture:**
- Disk-based cache with LRU eviction (100MB limit)
- Cache location: Electron userData directory with secure permissions
- SHA-256 URL hashing for cache keys
- SQLite metadata tracking for fast lookups
- IPC namespace: `window.api.nostling.imageCache.*`

**Panel Components:**

1. **ContactsPanel.tsx**: Main panel container
   - Displays full contact profile information
   - Read-only view (no editing)
   - Banner displayed as header background (social media style)
   - Profile picture overlaid on banner with letter circle fallback
   - Sidebar integration for contact selection
   - Escape key and Cancel button to return to chat view

2. **CachedImage.tsx**: React component for cached image display
   - Loads images from cache via IPC
   - Falls back to network fetch if not cached
   - Automatic caching of fetched images
   - Loading states and error handling
   - XSS protection via url-sanitizer integration

**Image Cache Components:**

3. **ImageCacheService**: Core cache service
   - LRU eviction with 100MB size limit
   - Cache lookup and storage operations
   - URL-based cache key generation (SHA-256)
   - File system operations with secure permissions (0o700/0o600)
   - Concurrency protection via p-queue (serialized operations)

4. **CacheDatabase**: SQLite metadata persistence
   - Stores cache metadata: URL, file path, timestamp, size
   - Fast cache lookups without file system scanning
   - Supports LRU eviction queries
   - Defensive programming for test compatibility

5. **ImageFetcher**: HTTP/HTTPS image fetcher
   - Fetches images with 30-second timeout
   - Protocol validation (http/https only)
   - Returns image data as Buffer
   - Error handling for network failures

6. **image-cache-handlers.ts**: IPC handler registration
   - Channel prefix: `nostling:image-cache:*`
   - Three operations: `getCachedImage`, `cacheImage`, `invalidateCache`
   - Registered during app initialization in main process

### Integration Points

**IPC API:**
- `window.api.nostling.imageCache.getCachedImage(url)` - Retrieve cached image or null
- `window.api.nostling.imageCache.cacheImage(url)` - Fetch and cache image
- `window.api.nostling.imageCache.invalidateCache(url)` - Remove from cache

**Preload Bridge:**
- Exposes `nostling:image-cache:*` channels to renderer
- Type-safe IPC communication with structured responses
- Handles errors gracefully with null returns

**Main Process Initialization:**
- ImageCacheService instantiated during app startup
- Handler registration in app.on('ready') event
- Cache database initialized with userData directory path

### Cache Behavior

**Lookup Strategy:**
1. Check in-memory metadata map for URL
2. If found and URL matches, return cached file path
3. If not found or URL changed, fetch from network
4. Save to cache and update metadata
5. Display image (or fallback to letter circle)

**LRU Eviction:**
- Triggered when cache exceeds 100MB size limit
- Evicts least recently accessed entries first
- Updates metadata to reflect removal
- Deletes files from disk

**Cache Invalidation:**
- When contact profile URL changes, old cached image invalidated
- Removes file from disk and metadata from database
- Next access fetches new image from network

**URL Change Detection:**
- Cache metadata stores original URL alongside cached file
- On lookup, compares current URL with cached URL
- If URLs differ, invalidates old cache entry and fetches new image
- Ensures cached images always match current URLs

**Known Limitation — No HTTP Revalidation:**
- Cache uses URL as the sole cache key (no ETag/Last-Modified validation)
- If remote content changes at the same URL, cached version persists until LRU eviction
- No TTL-based expiration; images remain cached indefinitely within size limits
- Workaround: users can manually clear cache or wait for LRU eviction

### File Structure

**Cache Directory:**
```
~/Library/Application Support/Nostling/image-cache/  (macOS)
~/.config/Nostling/image-cache/                       (Linux)

├── cache.db                  # SQLite metadata
├── <hash1>                   # Cached image file
├── <hash2>                   # Cached image file
└── ...
```

**File Permissions:**
- Cache directory: 0o700 (owner read/write/execute only)
- Image files: 0o600 (owner read/write only)
- Database file: 0o600
- Prevents world-readable access (security requirement)

**Cache Metadata Schema:**
```typescript
interface CacheMetadata {
  url: string;           // Original URL
  filePath: string;      // Absolute path to cached file
  cachedAt: number;      // Timestamp (milliseconds)
  lastAccessed: number;  // LRU tracking
  size: number;          // File size in bytes
}
```

### Concurrency Protection

**Race Condition Prevention:**
- All cache operations serialized via p-queue (concurrency: 1)
- Prevents TOCTOU vulnerabilities in LRU eviction
- Ensures atomic database + memory updates
- Protects shared Map<string, CacheMetadata> from concurrent access

**Operation Serialization:**
```typescript
queue.add(() => {
  // 1. Check cache
  // 2. Fetch if needed
  // 3. Update database
  // 4. Update in-memory map
  // All operations atomic
});
```

### Contact Profile Display

**Profile Fields Displayed:**
- Name (display_name or name from profile)
- About (bio/description)
- Picture (avatar/profile picture)
- Banner (header image)
- Website URL
- NIP-05 identifier (verification)
- LUD16 (Lightning address)

**Display Patterns:**
- Banner as full-width header background
- Profile picture overlaid on banner (or prominent if no banner)
- All fields read-only (display only, no editing)
- Fields with no data show as empty/hidden
- Uses existing Avatar component with cache-aware loading

**Contact Selection:**
- Sidebar shows contact list filtered by selected identity
- Each contact item shows: picture (cached), display name, alias
- Selected contact highlighted with border and background
- Clicking contact loads their profile in main panel

### User Workflows

**Opening Contacts Panel:**
1. User clicks hamburger menu
2. User clicks "View Contact Profiles"
3. View switches to contacts mode
4. ContactsPanel replaces conversation pane
5. Sidebar shows contact list for selected identity

**Viewing Contact Profile:**
1. Panel displays contact list in sidebar
2. User clicks contact to select
3. Full profile loads in main panel
4. Banner displayed as header background (if available)
5. Profile picture overlaid on banner
6. All profile fields displayed (name, about, website, etc.)
7. All images loaded from cache (or fetched if not cached)

**Offline Behavior:**
1. User opens contacts panel while offline
2. Cached images load instantly from disk
3. Non-cached images show fallback (letter circle for avatar)
4. No error states or blocking due to network unavailability
5. Profile metadata always available (stored in database)

**Returning to Chat View:**
1. User presses Escape or clicks Cancel
2. View switches back to chat mode
3. Sidebar returns to normal state

### Security

**URL Sanitization:**
- All image URLs sanitized via url-sanitizer.ts
- Only http/https protocols allowed
- Prevents XSS attacks via javascript: or data: URLs
- Invalid URLs return null, trigger fallback

**File Permissions:**
- Cache directory created with 0o700 (owner only)
- Image files written with 0o600 (owner read/write only)
- Database file has 0o600 permissions
- Prevents other users from reading cached images

**IPC Channel Isolation:**
- Image cache operations use dedicated namespace
- No cross-contamination with other IPC channels
- Type-safe boundaries between renderer and main

### Performance Optimizations

**Batch Profile Loading:**
- Contact profiles loaded with existing enhancement functions
- Single query per list (no N+1 problem)
- Profile data includes all fields for display

**Cache Efficiency:**
- In-memory metadata map for fast lookups
- Avoids disk scanning on every cache check
- LRU tracking ensures frequently accessed images stay cached
- 100MB limit prevents unbounded disk usage

**Network Optimization:**
- Only fetches images when not cached
- URL change detection prevents unnecessary re-fetches
- 30-second timeout prevents hanging requests

### Testing

**Unit Tests (268 tests):**
- ImageCacheService: 62 tests covering LRU, eviction, concurrency, file permissions
- CacheDatabase: 48 tests covering metadata operations, queries, error handling
- ImageFetcher: 32 tests covering HTTP fetch, timeouts, protocol validation
- image-cache-handlers: 46 tests covering IPC operations, error handling
- CachedImage: 38 tests covering React component, loading states, fallbacks
- ContactsPanel: 42 tests covering profile display, contact selection, navigation

**Integration Tests (5 tests):**
- IPC channel correctness (prevents channel mismatch regressions)
- Service method invocation through IPC
- End-to-end cache flow with concurrency
- Cache invalidation across IPC boundary
- Concurrent IPC request safety

**Test Coverage:**
- Total test suite: 1740 tests
- All tests passing
- Zero regressions from baseline (1735 tests)

### Design Principles

- **Offline-first**: Cached images available without network
- **Security-first**: File permissions enforce privacy, XSS protection on all URLs
- **Read-only profiles**: Contacts cannot edit other contacts' information
- **Graceful degradation**: Network failures don't block UI or cause error states
- **Performance**: LRU caching with bounded disk usage
- **Concurrency safety**: Serialized operations prevent race conditions
- **Integration with existing patterns**: Uses Avatar, SubPanel, url-sanitizer, profile enhancement
- **Zero regressions**: All existing tests continue passing

## Emoji Picker

The emoji picker provides an integrated, accessible way to insert emojis into messages. The component prioritizes accessibility and layout resilience, ensuring compatibility with keyboard navigation, screen readers, and responsive layouts.

### Architecture

**Component Structure:**

1. **EmojiPicker** (`src/renderer/components/EmojiPicker/EmojiPicker.tsx`):
   - Menu-based dropdown with Portal positioning for proper z-index layering
   - 4×7 grid layout displaying 26 emojis from ALL_EMOJIS constant
   - Keyboard navigation with arrow keys (Right/Left/Up/Down)
   - Enter or Space key to select focused emoji
   - Automatic menu close on selection or outside click

2. **EmojiButton** (`src/renderer/components/EmojiPicker/EmojiButton.tsx`):
   - Trigger button displaying emoji icon (😀)
   - Positioned in bottom-right corner of textarea using relative units (rem)
   - Theme-aware colors via useThemeColors() hook

3. **useEmojiInsertion** (`src/renderer/components/EmojiPicker/useEmojiInsertion.ts`):
   - Custom hook managing emoji insertion logic
   - Inserts emoji at current cursor position
   - Preserves surrounding text and advances cursor
   - Handles edge cases (empty input, cursor at start/end)

### Integration Points

**Message Input Integration:**
- Emoji button overlaid on textarea in ConversationPane
- Positioned using absolute positioning with pointer-events coordination
- Outer wrapper: `pointerEvents: none` (allows clicks to pass through to textarea)
- Inner button: `pointerEvents: auto` (button remains clickable)
- Button only rendered when identity and contact are selected

**Theme Integration:**
- All colors sourced from useThemeColors() hook
- Menu background, borders, hover states adapt to active theme
- Consistent with existing themed components

### Accessibility

**WCAG Level A Compliance:**
- Grid has `role="grid"` with `aria-label="Emoji picker grid"`
- Each emoji button has `role="gridcell"` with descriptive `aria-label="Insert emoji [emoji]"`
- Keyboard navigation fully functional (arrow keys, Enter, Space)
- Screen reader support via ARIA labels
- Focus management with visual focus indicators

**Keyboard Navigation:**
- Arrow Right: Move focus to next emoji (bounds at grid edge)
- Arrow Left: Move focus to previous emoji (bounds at grid edge)
- Arrow Down: Move focus down one row (4 emojis)
- Arrow Up: Move focus up one row (4 emojis)
- Enter or Space: Select focused emoji and close menu
- Tab: Navigate to emoji button from outside
- Focus state indicated with outline and background color

### Layout Resilience

**Positioning Strategy:**
- Button positioned using rem units (0.5rem from bottom-right)
- Avoids fixed pixel positioning for better scaling across viewport sizes
- Menu uses Portal rendering to prevent z-index conflicts
- Grid layout uses CSS Grid with responsive gap spacing

**Pointer Events Coordination:**
- Outer Box wrapper allows clicks to pass through to textarea
- Inner emoji button remains clickable via `pointerEvents: auto`
- Prevents blocking text input interactions
- Button always within textarea bounds

### User Workflow

1. User composes message in textarea with cursor at insertion point
2. User clicks emoji button (😀) in bottom-right corner
3. Emoji picker menu opens displaying 26 emojis in grid
4. User navigates with mouse click or keyboard (arrow keys)
5. User selects emoji (click or Enter/Space)
6. Emoji inserted at cursor position, cursor advances
7. Menu closes automatically
8. User continues composing message

### Emoji Set

**26 Emojis across mixed categories:**
- Reactions: 😀 😂 😊 😢 😍 🥰 😎 🤔
- Gestures: 👍 👋 🙏 ✌️ 👏 💪
- Symbols: ❤️ ✨ 🔥 💯 ✅ ❌
- Objects: 🎉 💡 📌 🔔 📝 ✉️

**Storage format:**
- Emojis stored as standard Unicode characters in message content
- No custom encoding or special handling
- Compatible with NostlingMessage interface (content: string)
- Renders in MessageBubble with existing whiteSpace="pre-wrap" styling

### Testing

**Property-Based Integration Tests:**
- 30 tests covering insertion logic, cursor positioning, keyboard navigation, and accessibility
- Fast-check generators for arbitrary text and cursor positions
- Coverage includes:
  - Text integrity (before/after cursor preserved)
  - Cursor position advancement
  - Sequential emoji insertion
  - Edge cases (empty text, start/end positions)
  - Keyboard navigation bounds checking
  - ARIA role verification
  - Button positioning properties

**Total test suite:** 1801 tests, all passing with zero regressions

### Design Principles

- **Accessibility-first**: WCAG Level A compliant with full keyboard and screen reader support
- **Layout resilience**: Uses relative units and pointer-events coordination
- **Theme-aware**: Colors adapt to active theme via useThemeColors()
- **Non-intrusive**: Lightweight menu pattern that doesn't interrupt composition flow
- **Text integrity**: Emoji insertion preserves surrounding content and cursor position
- **Integration with existing patterns**: Uses Chakra Menu, Portal, theme hooks
- **Zero regressions**: All existing tests continue passing
