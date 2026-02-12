# Nostling Desktop Application - Software Specification

> **Specification Scope**: This document describes **currently implemented** functionality in the Nostling desktop application. It consolidates all implemented features into a comprehensive specification optimized for AI coding agents. For planned/unimplemented features, see section 20. For user-centric feature descriptions, see `user-stories.md`.

---

## 1. Purpose & Scope

### 1.1 Purpose

Nostling is a cross-platform desktop application for private, encrypted messaging over the Nostr protocol. The application provides:

* **Secure identity management** with mnemonic backup and multiple identities per user
* **NIP-17/59 encrypted messaging** for private communication with whitelist-based contact management
* **Relay pool management** with per-identity relay configuration and automatic reconnection
* **Rich UI customization** through a comprehensive theme system with per-identity theming
* **Profile sharing and discovery** via QR codes and private profile exchange
* **Offline-first architecture** with message queueing and local persistence
* **Self-updating infrastructure** using RSA-signed manifests and automatic version checking

The application is designed for privacy-conscious users who want full control over their communication infrastructure without relying on centralized platforms.

### 1.2 Scope

**In scope:**

* Electron desktop app (TypeScript) with:
  * **macOS** support (unsigned bundle; Gatekeeper bypass required once)
  * **Linux** support via **AppImage**
* Nostr protocol integration:
  * NIP-04 (deprecated, receive-only for backward compatibility)
  * NIP-17/59 (current, all outgoing messages)
  * NIP-01, NIP-19 (event signing, key encoding)
* Identity management:
  * BIP-39 mnemonic generation and import
  * Multiple identities with per-identity relay and theme configuration
  * Secure key storage via OS keychain (safeStorage API)
* Contact management:
  * Whitelist-based access control
  * QR code scanning and display
  * Profile exchange (NIP-59 wrapped private profiles)
* Messaging:
  * Encrypted DMs with offline queueing
  * Emoji picker with accessibility support
  * Message status tracking (queued, sending, sent, error)
* Relay infrastructure:
  * WebSocket relay pool with read/write policies
  * Automatic reconnection with exponential backoff
  * Real-time status monitoring
* UI system:
  * 17 predefined themes with per-identity selection
  * Avatar display with status badges
  * Image caching for offline access
  * Responsive panel-based layout
* Configuration:
  * YAML format with JSON backward compatibility
  * Filesystem-based relay configs
  * Per-identity configuration isolation
* Self-updater:
  * GitHub Releases backend
  * RSA-4096 signed manifest verification
  * Automatic update checks with configurable intervals

### 1.3 Explicit Non-goals

* No **Windows** support in current release
* No **Apple ID** or macOS notarization
* No **remote telemetry or analytics**
* No **multi-language UI** (English only)
* No **group chats or channels** (1:1 DMs only)
* No **media attachments** (text-only messages)

### 1.4 Target Users

* Privacy-focused individuals comfortable with:
  * Managing cryptographic keys and mnemonic phrases
  * Configuring Nostr relays
  * Downloading and installing desktop applications from GitHub
  * Bypassing macOS Gatekeeper warnings for unsigned apps
* Power users who want:
  * Multiple identity management
  * Full control over relay selection
  * Offline-first messaging capabilities
  * Visual customization through themes

---

## 2. Architecture Overview

### 2.1 Tech Stack

* **Main process**: Electron with TypeScript, Node.js runtime
* **Renderer**: React 18 with TypeScript, Vite bundler
* **UI framework**: Chakra UI v3
* **Database**: SQLite via better-sqlite3
* **Cryptography**:
  * nostr-tools for Nostr protocol operations
  * RSA-4096 for update signatures
  * OS keychain (safeStorage) for secret storage
* **Packaging**: electron-builder with GitHub Releases

### 2.2 Supported Platforms

* **macOS**: Minimum macOS 12+, unsigned binary (.dmg installer, .zip for updates)
* **Linux**: AppImage for modern distributions (portable, no root required)

### 2.3 Process Model

Electron's three-process architecture with strict security boundaries:

* **Main process**:
  * Controls application lifecycle and window management
  * Owns auto-update logic and cryptographic verification
  * Handles IPC requests with domain-prefixed channels
  * Manages database operations and filesystem access
  * Maintains relay connections and Nostr subscriptions
  * Encrypts/decrypts messages using NIP-04/17/59

* **Preload script**:
  * Security bridge with `contextIsolation: true` and `nodeIntegration: false`
  * Exposes typed IPC facade via `contextBridge`
  * No direct Node.js or Electron API access from renderer

* **Renderer process**:
  * React application in sandboxed Chromium environment
  * Communicates exclusively via preload API
  * Stateful UI with hooks-based state management
  * Theme-aware component system

---

## 3. Nostr Protocol Integration

### 3.1 Purpose

Enable secure, encrypted messaging over the Nostr protocol with support for modern privacy standards (NIP-17/59) while maintaining backward compatibility with legacy messages (NIP-04).

### 3.2 Core Behavior

**Key management:**
* Derive keypairs from BIP-39 mnemonic phrases (12 or 24 words)
* Support nsec import for external key compatibility
* Generate new keypairs with secure randomness
* Store secret keys in OS keychain (never in plaintext)
* Expose npub for sharing and public operations

**Message encryption:**
* **Outgoing messages**: Always use NIP-17 encryption wrapped in NIP-59 gift wrap (kind:1059)
* **Incoming messages**: Support both kind:4 (NIP-04, legacy) and kind:1059 (NIP-17/59)
* **Backward compatibility**: Decrypt kind:4 messages but never create new ones

**Relay operations:**
* Connect to configured relays on application startup
* Subscribe to kind:4 and kind:1059 events for all identity pubkeys
* Publish only kind:1059 events (NIP-17/59 protocol)
* Filter incoming events against contact whitelist
* Auto-reconnect on disconnect with exponential backoff (max 30s)

### 3.3 Key Requirements

**FR-1: Key Derivation**
* `deriveKeypair(nsec: string): NostrKeypair` - Import from bech32 nsec
* `generateKeypair(): {nsec: string, mnemonic: string, keypair: NostrKeypair}` - Generate new identity
* `isValidNsec(nsec: string): boolean` - Validate nsec format
* `isValidNpub(npub: string): boolean` - Validate npub format
* Secret keys remain in memory only during crypto operations

**FR-2: NIP-17/59 Encryption (Current Protocol)**
* `encryptNIP17(plaintext, senderSk, recipientPk): Promise<Kind14Event>` - Create kind:14 event
* `wrapNIP59(kind14Event, recipientPk): Promise<Kind1059Event>` - Wrap in gift wrap
* `unwrapNIP59(kind1059Event, recipientSk): Promise<Kind14Event>` - Unwrap gift wrap
* `decryptNIP17(kind14Event, recipientSk, senderPk): Promise<string>` - Decrypt content
* Supports conversation key for reply handling

**FR-3: NIP-04 Decryption (Legacy, Receive-Only)**
* `decryptNIP04(ciphertext, recipientSk, senderPk): Promise<string>` - Decrypt kind:4 messages
* Used only for incoming message compatibility
* No new kind:4 event creation

**FR-4: Relay Pool Management**
* `RelayPool.connect(urls: string[]): Promise<void>` - Establish connections
* `RelayPool.publish(event: NostrEvent): Promise<PublishResult[]>` - Send to write-enabled relays
* `RelayPool.subscribe(filters: Filter[], onEvent): Subscription` - Listen on read-enabled relays
* `RelayPool.getStatus(): Map<string, RelayStatus>` - Real-time connection status
* Automatic reconnection with backoff, graceful degradation on partial failures

**FR-5: Event Signing and Validation**
* All outgoing events signed with identity's secret key
* Incoming event signatures validated before processing
* Event IDs verified against content hash
* Malformed events rejected silently (logged, not displayed)

### 3.4 Integration Points

* **NostlingService**: Orchestrates crypto, relay pool, and database operations
* **Message service**: Encrypts outgoing, decrypts incoming, updates status
* **Relay subscriptions**: Filter on `kinds: [4, 1059]`, `#p: [identityPubkeys]`
* **IPC channels**: `nostling:message:send`, `nostling:message:received` events

### 3.5 Security Properties

* Secret keys never logged or transmitted
* Encryption/decryption happens in main process only (renderer never sees keys)
* Failed decryption logged with sender pubkey (not ciphertext)
* Whitelist enforced before decryption (unknown senders silently dropped)
* No key material in database (only references to OS keychain)

---

## 4. Identity & Profile Management

### 4.1 Purpose

Enable users to create and manage multiple Nostr identities with secure key storage, mnemonic backup, and profile information exchange.

### 4.2 Core Behavior

**Identity creation:**
* Generate new BIP-39 mnemonic (12 or 24 words) and derive keypair
* Import existing identity via nsec or mnemonic
* Store secret reference in OS keychain (safeStorage)
* Create database record with npub, label, theme, relay config
* Initialize with default relay configuration

**Mnemonic backup:**
* Display mnemonic phrase during identity creation (one-time view)
* Require explicit acknowledgment that user has saved mnemonic
* Support copy-to-clipboard for secure storage in password manager
* Warn that mnemonic cannot be recovered if lost

**Profile editing:**
* Edit 8 profile fields: label (internal), name, about, picture, banner, website, NIP-05, LUD16
* Label updates local database; other fields update profile content
* Live preview with cancel/apply staging pattern
* Identity switching blocked while unsaved changes exist

**Profile sharing:**
* Publish private profile updates as NIP-59 wrapped kind:0 events
* Send profile updates to all whitelisted contacts on apply
* Receive private profiles from contacts via gift wrap unwrapping
* Display profile images with avatar components

**Profile discovery:**
* Query kind:0 events for contact's public profile (fallback if no private profile)
* Cache profile content in `nostr_profiles` table with source tracking
* Precedence: private_received > public_discovered > alias > npub

### 4.3 Key Requirements

**FR-1: Identity Creation Modal**
* Generate new identity with mnemonic backup flow
* Import identity from nsec or mnemonic
* Set identity label (required, user-friendly name)
* Select initial theme (optional, defaults to current theme)
* Display mnemonic with copy button and acknowledgment checkbox

**FR-2: Secure Key Storage**
* Store secret key reference in OS keychain via `safeStorage.setPassword()`
* Retrieve for crypto operations via `safeStorage.getPassword()`
* Fallback to encrypted storage if keychain unavailable (dev mode only)
* Never store secret keys in plaintext or database

**FR-3: Profile Editor Panel**
* Hamburger menu item "Identities" opens dedicated panel
* Sidebar shows identity list (contact list hidden in this view)
* Main panel displays 8-field profile editor for selected identity
* Cancel button reverts changes, Apply button commits and sends updates
* Image URL fields show live preview when valid URLs entered

**FR-4: Profile Exchange**
* Build kind:0 event with profile content (NIP-01 format)
* Wrap in NIP-59 gift wrap addressed to each contact
* Publish to write-enabled relays
* Receive and unwrap kind:1059 events containing kind:0 profiles
* Store in `nostr_profiles` table with source='private_received'

**FR-5: Database Schema**
* `nostr_identities` table: id, npub, secret_ref, label, theme, relays, created_at
* `nostr_profiles` table: id, npub, source, content_json, updated_at
* `profile_content` JSON fields: name, about, picture, banner, website, nip05, lud16

### 4.4 Integration Points

* **IdentitiesPanel**: View mode for profile editing
* **IdentityList**: Sidebar component with avatar and profile name
* **ProfileService**: Orchestrates profile building, sending, receiving, persistence
* **IPC channels**: `nostling:identities:list`, `nostling:identities:create`, `nostling:profiles:update`

### 4.5 Acceptance Criteria

* New identity creation derives correct npub from mnemonic
* Mnemonic backup flow prevents accidental skip (requires acknowledgment)
* Profile changes immediately reflect in UI preview
* Profile updates send to all contacts via NIP-59 gift wrap
* Received profiles update contact display names and avatars
* Identity switching disallowed when unsaved profile changes exist

---

## 5. Contact Management

### 5.1 Purpose

Manage whitelist-based contact access with support for QR code scanning, profile viewing, and alias management.

### 5.2 Core Behavior

**Contact addition:**
* Add contact via manual npub input
* Add contact via QR code scanning (camera modal)
* Validate npub format before creation
* Contacts scoped to identity (each identity has its own contact list)
* Contact creation triggers profile request (gift wrap kind:0 to contact)

**Contact display:**
* Contact list shows avatar with status badge, display name, last message preview
* Display name precedence: alias > private_received profile > public_discovered profile > npub
* Sort by last message timestamp (most recent first)
* Filter to show only contacts with messages (optional)

**Contact profiles:**
* "View Contact Profiles" menu opens contacts panel
* Sidebar shows contact list for selected identity
* Main panel displays read-only profile information for selected contact
* Fields: name, about, picture, banner, website, NIP-05, LUD16, npub
* Images cached to disk for offline access (100MB LRU cache)

**Whitelist enforcement:**
* Only messages from whitelisted contacts are decrypted and stored
* Unknown senders silently discarded (logged for debugging)
* Contact deletion soft-deletes (sets deleted_at timestamp)
* Deleted contacts excluded from message queries

### 5.3 Key Requirements

**FR-1: Contact Addition Modal**
* Text input field with npub validation
* Camera icon button to open QR scanner modal
* Error display for invalid npub format
* Success feedback on contact creation

**FR-2: QR Code Scanning**
* Request camera permissions on first use
* Display live camera feed with scan overlay
* Continuously detect QR codes and validate npub format
* Auto-create contact and close modal on successful scan
* Fallback to manual input if camera denied

**FR-3: QR Code Display**
* QR icon button in identity list items
* Modal displays identity's npub as QR code
* Text representation below QR for reference
* Close on backdrop click or ESC key

**FR-4: Contacts Panel**
* Hamburger menu item "View Contact Profiles"
* View mode transition to 'contacts'
* Sidebar shows contact list with avatars and display names
* Main panel shows 8 profile fields (read-only)
* Banner image as header background, profile picture overlaid
* Return to chat view via Cancel button or ESC key

**FR-5: Image Caching**
* Cache profile pictures and banners to disk (`{userData}/image-cache/`)
* LRU eviction with 100MB size limit
* SHA-256 hash of URL as cache key
* Metadata stored for invalidation (original URL, timestamp, size)
* Cache checked before network fetch (offline-first)

**FR-6: Database Schema**
* `nostr_contacts` table: id, identity_id, npub, alias, state, created_at, last_message_at, deleted_at
* `nostr_profiles` joined for display name resolution
* `image_cache_metadata` table: url_hash, url, file_path, timestamp, size_bytes, last_accessed

### 5.4 Integration Points

* **ContactModal**: Add/edit contact with QR scanning option
* **ContactList**: Sidebar component with filtering and sorting
* **ContactsPanel**: Dedicated view for profile browsing
* **QrCodeScanner**: Camera modal for QR detection
* **QrCodeDisplay**: QR generation modal for identity sharing
* **ImageCacheService**: LRU cache for profile images
* **IPC channels**: `nostling:contacts:add`, `nostling:contacts:list`, `nostling:image-cache:cache`

### 5.5 Acceptance Criteria

* Valid npub creates contact and triggers profile request
* QR scanning creates contact without manual npub entry
* Camera permissions gracefully handled (request, deny fallback)
* Contact profiles display correctly with cached images
* Offline access to cached profile images works without network
* LRU cache evicts oldest images when 100MB limit exceeded
* Unknown senders do not create contacts or store messages

---

## 6. Messaging System

### 6.1 Purpose

Provide secure, encrypted direct messaging with offline queueing, emoji support, and real-time status tracking.

### 6.2 Core Behavior

**Message composition:**
* Text input with emoji picker integration
* Insert emojis at cursor position via menu-based picker
* Submit via Enter key or Send button
* Message immediately stored locally and queued for sending

**Message encryption and sending:**
* Encrypt plaintext using NIP-17, wrap in NIP-59 gift wrap
* Build kind:1059 event addressed to recipient
* Sign event with sender's secret key
* Publish to all write-enabled relays
* Update status based on relay publish results

**Message reception:**
* Subscribe to kind:4 and kind:1059 events for all identity pubkeys
* Validate sender against whitelist before processing
* Unwrap kind:1059 gift wrap, decrypt kind:14 content
* Store decrypted plaintext with status='sent'
* Emit IPC event to notify renderer of new message

**Offline queueing:**
* Messages queued locally when relays disconnected
* Queue persists across app restarts
* Automatic flush when relay connections restored
* Status updates: queued → sending → sent/error
* Retry failed messages with exponential backoff

**Message display:**
* Conversation view shows messages sorted by timestamp
* Outgoing messages right-aligned, incoming left-aligned
* Message bubbles themed with identity's selected theme
* Status indicators: queued (clock), sending (spinner), sent (checkmark), error (warning)
* Deprecation warning for kind:4 messages (dev mode only)

### 6.3 Key Requirements

**FR-1: Emoji Picker**
* Button in message input (bottom-right corner)
* Menu-based UI with 24 emojis in 4x6 grid
* Categories: reactions, gestures, symbols, objects
* Click emoji to insert at cursor position
* Close menu after selection or on backdrop click
* WCAG Level AA accessibility compliance

**FR-2: Message Input**
* Textarea with auto-resize (up to 5 lines)
* Cursor position tracking for emoji insertion
* Submit on Enter (Shift+Enter for newline)
* Clear input after successful send
* Disable send button when empty or no identity/contact selected

**FR-3: Offline Queue Management**
* `enqueueOutgoingMessage(identityId, contactId, plaintext)` - Store locally with status='queued'
* `flushOutgoingQueue()` - Publish all queued messages when relays connected
* `retryFailedMessage(messageId)` - Re-attempt send for error status
* Queue status display in footer: "X queued (offline)", "X sending", "Nostling synced"

**FR-4: Message Status Tracking**
* Database field `status: 'queued' | 'sending' | 'sent' | 'error'`
* Update status on publish result (success/failure per relay)
* Mark as 'sent' if any relay succeeds (partial success acceptable)
* Mark as 'error' if all relays fail
* Expose status in message list for UI rendering

**FR-5: Message Rendering**
* MessageBubble component with theme colors
* Display plaintext with `whiteSpace="pre-wrap"` for multi-line support
* Timestamp in relative format ("2m ago", "yesterday", "Jan 15")
* Avatar with status badge for sender identification
* Info button (dev mode) shows event details (kind, event_id, gift wrap status)

**FR-6: Read Receipts**
* Mark incoming messages as read when conversation opened
* Database field `is_read: boolean`
* Update on conversation view mount
* Unread count badge on contact list items

**FR-7: Database Schema**
* `nostr_messages` table: id, identity_id, contact_id, sender_npub, recipient_npub, content, event_id, timestamp, status, direction, is_read, kind, was_gift_wrapped

### 6.4 Integration Points

* **ConversationPane**: Main messaging UI with input and message list
* **MessageBubble**: Individual message rendering with status
* **EmojiPicker**: Menu-based emoji insertion component
* **NostlingService**: Message encryption, relay publishing, subscription handling
* **IPC channels**: `nostling:message:send`, `nostling:message:received`, `nostling:message:mark-read`

### 6.5 Acceptance Criteria

* Message encrypted with NIP-17/59 before relay publish
* Offline messages queue locally and flush on reconnect
* Emoji picker inserts at cursor position without text loss
* Status updates reflect relay publish results in real-time
* Received messages decrypted and displayed immediately
* Unknown senders silently discarded (whitelist enforced)
* Message history persists across app restarts

---

## 7. Relay Management

### 7.1 Purpose

Manage WebSocket connections to Nostr relays with per-identity configuration, read/write policies, and real-time status monitoring.

### 7.2 Core Behavior

**Relay configuration:**
* Per-identity relay list stored in `~/.config/nostling/identities/<id>/relays.yaml`
* Each relay has: url, read flag, write flag, order (for sorting)
* Default relay list applied to new identities (8-12 relays)
* User can add, remove, reorder, and toggle read/write policies

**Connection management:**
* Connect to all enabled relays on identity selection
* Subscribe to read-enabled relays for kind:4 and kind:1059 events
* Publish to write-enabled relays for outgoing messages
* Independent connection tracking per relay (status, latency, error messages)

**Automatic reconnection:**
* Detect disconnect events (network error, relay closure)
* Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
* Reset backoff on successful connection
* Maintain subscriptions across reconnect cycles

**Status monitoring:**
* Real-time status per relay: connecting, connected, disconnected, error
* Footer summary: "X relays · Y connected · Z failed"
* Visual indicators in relay manager UI (green/yellow/red dots)
* Tooltip shows error message for failed relays

**Configuration format:**
* YAML format with comments explaining options
* Backward compatibility with JSON (auto-migrates on first load)
* Overwrite protection: hash-based conflict detection
* Dual-write during migration (YAML primary, JSON backup)

### 7.3 Key Requirements

**FR-1: Relay Manager UI**
* Hamburger menu item "Relay Configuration" opens relay manager
* Table layout with columns: drag handle, enabled checkbox, status dot, URL (inline editable), read checkbox, write checkbox, remove button
* Row height ≤ 36px for 12-15 visible rows on 13" display
* "Add relay" input at bottom of table
* Visible position numbers for drag-and-drop ordering

**FR-2: Read/Write Policy**
* Separate checkboxes for read and write per relay
* Default: both enabled for new relays
* Read-only: subscribe but don't publish
* Write-only: publish but don't subscribe (rare, for blast relays)
* Backend respects flags when creating subscriptions and publishing events

**FR-3: Drag-to-Reorder**
* Integrate @dnd-kit/core and @dnd-kit/sortable libraries
* Drag handle in leftmost column
* Visual feedback during drag (placeholder, drop indicator)
* Persist new order immediately to YAML file

**FR-4: Connection Status**
* Status dot colors: green (connected), yellow (connecting), red (disconnected/error)
* Tooltip shows status text or error message
* Update within 2 seconds of connection state change
* Footer summary updates in real-time

**FR-5: YAML Configuration**
* Primary format: `relays.yaml` with comments
* Example comment: `# url: WebSocket URL starting with wss://`
* Auto-migration from `relays.json` on first load (lazy migration)
* Dual-write: update both YAML and JSON if JSON exists (for downgrade safety)
* Deprecation warning logged when both formats present

**FR-6: Overwrite Protection**
* Compute SHA-256 hash of file content on load
* Before every write: re-read file, compare hash
* If hash differs: show conflict modal with options [Reload, Overwrite, Cancel]
* Reload: discard in-memory changes, re-render from disk
* Overwrite: save current UI state, replacing external changes

**FR-7: Database Schema**
* No relay data in database (filesystem-based)
* `nostr_identities.relays` field removed (migrated to YAML)
* Relay status stored in memory only (ephemeral)

### 7.4 Integration Points

* **RelayManager**: UI component with table layout and drag-and-drop
* **RelayConfigManager**: Filesystem operations (read, write, migrate, hash verification)
* **RelayPool**: Connection management, subscription, publishing
* **NostlingService**: Initializes relay pool on identity selection
* **IPC channels**: `relay:load`, `relay:save`, `relay:status`

### 7.5 Acceptance Criteria

* Relay connections established within 5 seconds of identity selection
* Status dots update in real-time as connections change
* Read/write flags correctly control subscription and publish behavior
* Drag-and-drop reordering persists across app restarts
* YAML config includes helpful comments for user editing
* Overwrite protection prevents data loss from concurrent edits
* Auto-reconnect recovers from temporary network failures
* Footer summary accurately reflects relay connection status

---

## 8. Theme System

### 8.1 Purpose

Provide visual customization through 17 predefined themes with per-identity selection, live preview, and comprehensive color token coverage.

### 8.2 Core Behavior

**Theme definition:**
* 17 themes total: 5 light, 5 dark, 7 vibrant/colorful
* Each theme defines complete Chakra UI color token set
* Tokens include: brand (50-950 scale), neutral, accent, success, warning, error, info
* Semantic colors mapped for headers, footers, panels, buttons, badges
* WCAG AA contrast ratios for text readability

**Per-identity theming:**
* Each identity has its own theme selection (stored in database)
* Switching identities updates entire UI to match selected theme
* Theme preference persists across app restarts
* New identities default to current theme or prompt selection

**Theme selection UI:**
* Hamburger menu item "Themes" opens theme selection panel
* Carousel navigation with Previous/Next buttons
* Live preview of theme on full UI (no fake preview cards)
* Filters: brightness (all, light, dark) and color categories (warm, cool, neutral, vibrant)
* Theme info displayed: name, description, tags, color swatches
* Cancel/Apply staging pattern (preview updates immediately, commit on Apply)

**Theme application:**
* React state update triggers full UI re-render with new theme
* Chakra UI provider receives updated color token config
* All components inherit theme colors via semantic tokens
* No page reload required (instant theme switch)
* Smooth transition without flash of unstyled content

**Theme persistence:**
* Database field `nostr_identities.theme` stores theme ID
* IPC channel `nostling:identities:update-theme` persists selection
* Theme loaded on identity selection and applied to UI

### 8.3 Key Requirements

**FR-1: Theme Definitions**
* 17 themes with unique names and color palettes:
  * Light: Vanilla Sky, Lavender Haze, Mint Breeze, Peach Sorbet, Sky Blue
  * Dark: Midnight Purple, Deep Ocean, Charcoal Elegance, Forest Night, Crimson Dusk
  * Vibrant: Sunset Vibes, Electric Blue, Neon Nights, Golden Hour, Rose Garden, Teal Dream, Purple Reign
* Each theme includes: id, name, description, tags, colors (light/dark variants)
* Color structure: brand, neutral, accent, success, warning, error, info (each with 50-950 scale)

**FR-2: Theme Selection Panel**
* Menu item in hamburger menu opens panel (view mode 'theme-selection')
* Sidebar shows theme filters (brightness, color category)
* Main panel shows carousel with live preview
* Theme info section shows name, description, tags, color swatches
* Navigation buttons: Previous/Next (wraps around at boundaries)
* Cancel/Apply buttons in footer

**FR-3: Live Preview**
* Theme preview applies to entire application UI (not a fake preview)
* All components inherit new theme colors immediately
* Preview updates on carousel navigation (Next/Previous)
* No UI elements excluded from preview (full application theming)
* Cancel reverts to original theme, Apply commits change

**FR-4: Theme Filters**
* Brightness filter: All, Light, Dark
* Color filter: All, Warm, Cool, Neutral, Vibrant
* Filters combine (AND logic): "Dark + Warm" shows only dark warm themes
* Filter state persists while panel is open (resets on close)
* Filtered themes maintain carousel navigation

**FR-5: Identity Switching**
* Selecting different identity applies that identity's theme
* Theme transition happens immediately (< 100ms perceived delay)
* No flash of unstyled content during switch
* Unsaved theme changes prevent identity switching (same as profile editor)

**FR-6: Database Schema**
* `nostr_identities.theme` field (TEXT, nullable, default: 'midnight-purple')
* Theme ID stored as kebab-case string (e.g., 'sunset-vibes', 'lavender-haze')

### 8.4 Integration Points

* **ThemeSelectionPanel**: Panel container with filters and carousel
* **ThemeCarousel**: Navigation and theme cycling
* **ThemePreview**: Live preview of current theme (entire app)
* **ThemeFilters**: Brightness and color category filtering
* **ThemeInfo**: Display name, description, tags, color swatches
* **useTheme hook**: Applies theme to Chakra UI provider
* **IPC channels**: `nostling:identities:update-theme`, `nostling:identities:list`

### 8.5 Acceptance Criteria

* All 17 themes render correctly with proper contrast
* Theme selection updates entire UI in real-time (live preview)
* Per-identity theme persists across app restarts
* Filters correctly narrow theme carousel options
* Cancel reverts to original theme, Apply commits change
* Identity switching applies new identity's theme immediately
* WCAG AA contrast ratios met for all text elements
* No theme-related rendering bugs across different components

---

## 9. UI Components & Layout

### 9.1 Purpose

Provide consistent, themeable UI components with accessibility support and responsive panel-based layout.

### 9.2 Core Behavior

**Layout structure:**
* Header: App title, identity selector, hamburger menu, relay status
* Sidebar: Identity list (chat view) or contact list (context-dependent)
* Main area: Conversation pane (chat view) or sub-panels (identities, contacts, themes, about)
* Footer: Version, update status, outgoing message queue status, relay connection count

**View modes:**
* `chat`: Default view with conversation pane and contact list
* `identities`: Profile editor panel with identity list in sidebar
* `contacts`: Contact profiles panel with contact list in sidebar
* `theme-selection`: Theme picker panel with filters in sidebar
* `about`: Help/about modal overlay

**Panel pattern:**
* SubPanel component with header, body, footer sections
* Header: Title, close button
* Body: Scrollable content area
* Footer: Action buttons (Cancel, Apply)
* ESC key and Cancel button return to previous view

**Modals:**
* Chakra UI Dialog components for focused interactions
* Identity creation, contact addition, QR scanning/display, help text
* Backdrop click and ESC key to dismiss
* Form validation with error display
* Loading states during async operations

**Navigation:**
* Hamburger menu items: Identities, View Contact Profiles, Themes, Relay Configuration, Help
* View transitions without page reload (React state updates)
* Breadcrumb-style back navigation (implicit via view stack)

### 9.3 Key Components

**Avatar System:**
* `Avatar`: Base component with image or letter circle
* `AvatarWithBadge`: Avatar + status badge overlay
* Badge icons: ShieldCheckIcon (private), ShieldWarningIcon (public), ShieldOffIcon (none)
* Size variants: small (24px), medium (32px), large (48px)
* Letter extraction: first character of display name, uppercase, themed background

**QR Code Components:**
* `QrCodeScanner`: Camera modal with live feed and QR detection
* `QrCodeDisplay`: Modal displaying npub as QR code with text representation
* Camera permission handling with fallback messaging
* QR detection using standard Web APIs (no external dependencies for display)

**Relay Manager:**
* Table component with drag-and-drop reordering (@dnd-kit)
* Inline editable URL field with validation
* Status dot with tooltip (connection state and error messages)
* Read/write checkboxes with instant persistence
* Add relay input at table bottom

**Profile Editor:**
* 8-field form: label, name, about, picture, banner, website, NIP-05, LUD16
* Image URL fields with live preview
* Cancel/Apply staging with unsaved changes protection
* Field validation (URL format, required fields)

**Emoji Picker:**
* Menu-based component with 24 emoji grid (4x6 layout)
* Trigger button in message input (bottom-right corner)
* Categories: reactions, gestures, symbols, objects
* Cursor position preservation for insertion
* Keyboard navigation and WCAG Level AA compliance

### 9.4 Integration Points

* **main.tsx**: Root component with layout and view routing
* **components/**: Reusable UI components (Avatar, QR, RelayManager, etc.)
* **themes/**: Theme definitions and application logic
* **utils/**: Helper functions (themed messages, URL sanitization)

### 9.5 Acceptance Criteria

* Layout responsive to window resizing (min width: 1024px)
* Panel navigation preserves state (no data loss on view switch)
* Modals accessible via keyboard (tab navigation, ESC to close)
* Avatar status badges correctly reflect profile source
* QR scanner gracefully handles camera permission denial
* Relay manager table supports 50+ relays without performance degradation
* Profile editor prevents identity switching with unsaved changes
* Emoji picker inserts at cursor without text loss

---

## 10. Image Caching

### 10.1 Purpose

Provide offline access to profile images with LRU eviction and efficient storage management.

### 10.2 Core Behavior

**Cache location:**
* Directory: `{userData}/image-cache/` (or custom NOSTLING_DATA_DIR)
* Metadata tracked in database for fast lookup
* Files stored with hash-based filenames (SHA-256 of URL)

**Cache strategy:**
* On image load: check cache by URL hash first
* If cached and URL matches: load from disk (offline-first)
* If not cached or URL changed: fetch from network, save to cache
* Update metadata: URL, file path, timestamp, size, last accessed

**LRU eviction:**
* Maximum cache size: 100MB (configurable)
* When limit exceeded: evict least recently accessed images
* Track last_accessed timestamp on every read
* Eviction happens asynchronously (non-blocking)

**Cache invalidation:**
* When contact profile picture URL changes: invalidate old cached image
* Compare stored URL with current URL in metadata
* If different: delete old file, fetch new image, update metadata
* Orphaned files cleaned up on app startup (metadata without file)

**Image loading:**
* Priority: cache > network > fallback (letter avatar)
* Loading states shown during network fetch
* Failed loads gracefully fall back to letter circle
* XSS protection via URL sanitization (whitelist http/https protocols)

### 10.3 Key Requirements

**FR-1: Cache Service**
* `ImageCacheService.getImage(url: string): Promise<string>` - Returns local file path or URL
* `ImageCacheService.cacheImage(url: string): Promise<string>` - Fetch and cache, return path
* `ImageCacheService.evictLRU(): Promise<void>` - Remove oldest images until under limit
* `ImageCacheService.clearCache(): Promise<void>` - Delete all cached images

**FR-2: Metadata Storage**
* Database table: `image_cache_metadata`
* Fields: url_hash (PK), url, file_path, timestamp, size_bytes, last_accessed
* Index on last_accessed for LRU queries
* Index on url_hash for fast lookup

**FR-3: File Operations**
* SHA-256 hash of URL as filename (e.g., `abc123def456.jpg`)
* Preserve file extension from URL or Content-Type header
* Atomic writes: temp file + rename to avoid corruption
* Proper error handling for disk full, permission denied

**FR-4: Integration with Avatar Components**
* Avatar components call `ImageCacheService.getImage()` for picture URLs
* Banner images in ContactsPanel use cache service
* Fallback to letter circle if cache load fails

**FR-5: Cache Statistics**
* Expose cache size and entry count via IPC
* Display in debug/settings UI (optional, not in current scope)
* Log cache hits and misses for debugging (dev mode only)

### 10.4 Integration Points

* **ImageCacheService**: Main process service for cache operations
* **IPC channels**: `nostling:image-cache:cache`, `nostling:image-cache:get`, `nostling:image-cache:clear`
* **Avatar components**: Request cached images for profile pictures
* **ContactsPanel**: Display cached banner images

### 10.5 Acceptance Criteria

* Offline access to cached profile images works without network
* LRU eviction maintains 100MB limit
* Cache invalidation detects URL changes and refetches
* Failed network requests fall back to letter avatars
* Cache survives app restarts (files persist on disk)
* Metadata queries fast enough for real-time UI rendering
* Orphaned files cleaned up on startup

---

## 11. Configuration System

### 11.1 Purpose

Provide user-configurable settings with YAML format, backward compatibility, and per-identity isolation.

### 11.2 Core Behavior

**App configuration:**
* File location: `~/.config/nostling/config.yaml` (or NOSTLING_DATA_DIR)
* Format: YAML with comments explaining each field
* Backward compatibility: reads `config.json`, auto-migrates to YAML
* Dual-write during transition: update both YAML and JSON if JSON exists

**App config fields:**
```yaml
# Automatic update checking
autoUpdate: true

# Update check interval: 1h, 2h, 4h, 12h, 24h, or never
autoCheckInterval: '1h'

# Log level: debug, info, warn, or error
logLevel: 'info'

# Log retention days (0 = keep forever)
logRetentionDays: 30

# Log file size limit in MB
logMaxFileSizeMB: 10

# Message polling interval: 10s, 30s, 1m, 5m, or disabled
messagePollingInterval: '30s'

# Dev mode: show message info button on bubbles
showMessageInfo: false

# Dev mode: show warning icon for non-gift-wrapped messages
showWarningIcon: false
```

**Relay configuration:**
* File location: `~/.config/nostling/identities/<identity-id>/relays.yaml`
* Per-identity relay list (no global defaults file)
* Format: YAML array with comments
* Example:
```yaml
# Relay configuration for this identity
# Each relay has a URL, read flag, write flag, and order (for sorting)

- url: wss://relay.damus.io
  read: true
  write: true
  order: 0

- url: wss://eden.nostr.land
  read: true
  write: false  # Read-only, don't publish here
  order: 1
```

**Configuration migrations:**
* JSON to YAML: lazy migration on first read
* Preserve original JSON file (not deleted, for downgrade safety)
* Deprecation warning logged when both formats present
* User can safely delete JSON after verifying YAML works

**Validation:**
* JSON schema validation for config structure
* Type checking via TypeScript interfaces
* Graceful fallback to defaults on malformed config
* Non-blocking errors (app starts even if config invalid)

### 11.3 Key Requirements

**FR-1: YAML Format Support**
* Read from `config.yaml` and `relays.yaml` files
* Parse YAML with comments preserved on write
* Validate structure against schema
* Error handling for invalid YAML syntax

**FR-2: Auto-Migration**
* Detect presence of `config.json` or `relays.json`
* If only JSON exists: read JSON, write YAML, preserve JSON
* If both exist: prefer YAML, log deprecation warning
* Migration is idempotent (safe to run multiple times)

**FR-3: Dual-Write**
* During transition period: write to both YAML and JSON
* If only YAML exists: write only YAML (migration complete)
* Ensures downgrade path (older versions can read JSON)

**FR-4: Overwrite Protection**
* Hash-based conflict detection for relay configs (already implemented)
* Conflict modal with options: Reload, Overwrite, Cancel
* Prevents data loss from concurrent external edits

**FR-5: Default Values**
* Ship with sensible defaults for all config fields
* New identities get default relay list copied to their directory
* Missing config files created with defaults on first run

**FR-6: Comments in YAML**
* Helpful comments explaining each field
* Examples of valid values
* Links to documentation for complex settings

### 11.4 Integration Points

* **ConfigService**: Reads/writes app config with validation
* **RelayConfigManager**: Reads/writes per-identity relay configs
* **IPC channels**: `config:get`, `config:set`, `relay:load`, `relay:save`

### 11.5 Acceptance Criteria

* YAML files include helpful comments for user editing
* JSON configs auto-migrate to YAML on first load
* Dual-write preserves downgrade path during transition
* Overwrite protection prevents data loss from external edits
* App starts successfully with missing or invalid config
* Default values provide good out-of-box experience

---

## 12. Self-Update System

### 12.1 Purpose

Enable automatic application updates from GitHub Releases with RSA-signed manifest verification and user control.

### 12.2 Core Behavior

(This section retains the content from the original spec.md sections 3, 4, and 9, as these are already comprehensive and agent-focused.)

**Update backend**: GitHub Releases with semantic version tags (`MAJOR.MINOR.PATCH`, no 'v' prefix).

**On application start**:
1. Load configuration
2. Initialize logging
3. Create window and load UI
4. Begin background update check (if enabled)

**Update phases**:

| Phase | Description |
|-------|-------------|
| `idle` | No update activity |
| `checking` | Checking for available updates |
| `available` | Update found, awaiting user action |
| `downloading` | Download in progress |
| `downloaded` | Download complete |
| `verifying` | Cryptographic verification in progress |
| `ready` | Verified and ready to install |
| `failed` | Error occurred |

Platform-specific phases for macOS DMG installation:
| Phase | Description |
|-------|-------------|
| `mounting` | DMG being mounted |
| `mounted` | Finder window open for drag-and-drop |

### 12.3 Footer Update Controls

The footer serves as the central hub for update information and controls:

**Status display formats**:
* Up-to-date: `v{version} • Up to date`
* Checking: `v{version} • Checking for updates...`
* Available: `v{version} • Update available: v{new-version}`
* Downloading: `v{version} • Downloading: {percent}% ({transferred}/{total}) @ {speed}`
* Ready: `v{version} • Update ready: v{new-version}`
* Failed: `v{version} • Update failed: {message}`

**Controls**:
* Manual refresh icon (always visible, disabled during active operations)
* "Download Update" button (when update available)
* "Restart to Update" button (when ready to install)

**Automatic checks**:
* On startup (once window ready)
* At configurable intervals: 1h, 2h, 4h, 12h, 24h, or never
* Default: 1 hour

### 12.4 Cryptographic Verification

Each release includes a signed manifest with:

```json
{
  "version": "1.2.3",
  "createdAt": "2025-01-01T12:00:00Z",
  "artifacts": [
    {
      "platform": "darwin",
      "type": "dmg",
      "url": "Nostling-1.2.3.dmg",
      "sha256": "<hex-encoded-sha256>"
    }
  ],
  "signature": "<base64-rsa-signature>"
}
```

**Signing**: RSA-4096 private key signs canonical JSON of `{version, artifacts, createdAt}` using SHA-256.

**Verification flow**:
1. Download artifact via electron-updater
2. Fetch manifest from release
3. Verify RSA signature on manifest
4. Validate version is newer than current
5. Find artifact for current platform
6. Compute SHA-256 hash of downloaded file
7. Compare hash with manifest
8. Apply update only if all checks pass

### 12.5 State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌──────┐  check   ┌──────────┐  not-available  ┌──────┐ │
│ idle │─────────▶│ checking │────────────────▶│ idle │◀┘
└──────┘          └──────────┘                 └──────┘
    ▲                   │
    │                   │ update-available
    │                   ▼
    │             ┌───────────┐  download
    │             │ available │─────────────┐
    │             └───────────┘             │
    │                                       ▼
    │                              ┌─────────────┐
    │                              │ downloading │
    │                              └─────────────┘
    │                                       │
    │                                       │ download-complete
    │                                       ▼
    │                              ┌────────────┐
    │                              │ downloaded │
    │                              └────────────┘
    │                                       │
    │                                       │ auto
    │                                       ▼
    │                              ┌───────────┐
    │                              │ verifying │
    │                              └───────────┘
    │                                   │
    │               ┌───────────────────┴───────────────────┐
    │               │ verify-success                         │ verify-failed
    │               ▼                                        ▼
    │          ┌─────────┐                             ┌────────┐
    │          │  ready  │                             │ failed │
    │          └─────────┘                             └────────┘
    │               │                                        │
    │               │ restart                                │ retry
    │               ▼                                        │
    │       [App restarts]                                   │
    │                                                        │
    └────────────────────────────────────────────────────────┘

Error from any state → failed
```

**Properties:**
* **Deterministic**: Same event from same state always produces same next state
* **Broadcast Consistency**: Every state change notifies renderer
* **Version Tracking**: Version info preserved through download/verify/ready phases
* **Error Recovery**: All errors result in `failed` state with retry option
* **Concurrency Guard**: Prevents overlapping update operations

### 12.6 Integration Points

* **UpdateController**: Main process coordinator for update lifecycle
* **UpdateVerifier**: RSA signature and SHA-256 hash verification
* **Footer component**: Displays status and controls
* **IPC channels**: `updates:check`, `updates:download`, `updates:restart`, `update-state` (event)

---

## 13. Persistence Layer

### 13.1 Purpose

Provide local SQLite database for application state, identities, contacts, messages, and profiles with automatic schema migrations.

### 13.2 Database Architecture

* **Engine**: better-sqlite3 (synchronous SQLite bindings)
* **Location**: `{userData}/nostling.db` (or custom NOSTLING_DATA_DIR)
* **Migrations**: Knex.js-compatible migration system with versioning
* **Schema versioning**: Automatic migration execution on startup
* **Transaction support**: Atomic commits for complex operations

### 13.3 Schema Overview

**Core tables:**
* `knex_migrations`: Migration tracking (version, timestamp)
* `app_state`: Key-value store for application preferences
* `nostr_identities`: User identities with keys, labels, themes
* `nostr_contacts`: Contact whitelist per identity
* `nostr_messages`: Encrypted message storage with status
* `nostr_profiles`: Cached profile content (private and public)
* `image_cache_metadata`: LRU cache tracking for profile images

**Indexes:**
* `nostr_messages`: (identity_id, contact_id, timestamp) for conversation queries
* `nostr_messages`: (status) for queue processing
* `nostr_contacts`: (identity_id, deleted_at) for active contact filtering
* `nostr_profiles`: (npub, source) for profile lookups
* `image_cache_metadata`: (url_hash) for cache lookups, (last_accessed) for LRU

### 13.4 Migration System

**Migration format**:
```typescript
interface Migration {
  up(knex: Knex): Promise<void>;    // Apply migration
  down(knex: Knex): Promise<void>;  // Rollback migration
}
```

**Properties:**
* Migrations run automatically on application startup
* Migrations are idempotent (safe to run multiple times)
* Each migration runs in a transaction for atomicity
* Migration failures prevent application startup with clear error
* Migrations tracked in `knex_migrations` table
* Migrations run sequentially in filename order

**Limitations:**
* better-sqlite3 does not support WAL mode in all configurations
* Each migration must be self-contained and independent
* No concurrent migration execution (single-process protection)

### 13.5 Key Tables

**nostr_identities:**
```sql
CREATE TABLE nostr_identities (
  id TEXT PRIMARY KEY,
  npub TEXT NOT NULL UNIQUE,
  secret_ref TEXT NOT NULL,
  label TEXT NOT NULL,
  theme TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
```

**nostr_contacts:**
```sql
CREATE TABLE nostr_contacts (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  npub TEXT NOT NULL,
  alias TEXT,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_message_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (identity_id) REFERENCES nostr_identities(id),
  UNIQUE (identity_id, npub)
);
```

**nostr_messages:**
```sql
CREATE TABLE nostr_messages (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  sender_npub TEXT NOT NULL,
  recipient_npub TEXT NOT NULL,
  content TEXT NOT NULL,
  event_id TEXT,
  timestamp TEXT NOT NULL,
  status TEXT NOT NULL,
  direction TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  kind INTEGER,
  was_gift_wrapped INTEGER,
  FOREIGN KEY (identity_id) REFERENCES nostr_identities(id),
  FOREIGN KEY (contact_id) REFERENCES nostr_contacts(id)
);
```

**nostr_profiles:**
```sql
CREATE TABLE nostr_profiles (
  id TEXT PRIMARY KEY,
  npub TEXT NOT NULL,
  source TEXT NOT NULL,
  content_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (npub, source)
);
```

**image_cache_metadata:**
```sql
CREATE TABLE image_cache_metadata (
  url_hash TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  file_path TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  last_accessed TEXT NOT NULL
);
```

### 13.6 State Store API

Key-value store for application preferences and settings:

```typescript
interface StateStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
}
```

**Properties:**
* Values stored as JSON-serialized strings
* Automatic JSON serialization/deserialization
* Key uniqueness enforced by schema
* Upsert semantics for `set` operation

**Schema:**
```sql
CREATE TABLE app_state (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 13.7 Integration Points

* **DatabaseService**: Initialization, migration, query execution
* **IPC channels**: `state:get`, `state:set`, `state:delete`, `state:getAll`
* **NostlingService**: CRUD operations for identities, contacts, messages, profiles

### 13.8 Acceptance Criteria

* Database created automatically on first startup
* Migrations execute successfully on application startup
* State operations (get/set/delete/getAll) work correctly
* Data persists across application restarts
* Migration failures prevent application startup with clear error messages
* No data corruption from concurrent access (single-process guaranteed by Electron)

---

## 14. IPC Interface

### 14.1 API Structure

Nested structure exposed via preload script:

```typescript
interface RendererApi {
  updates: {
    checkNow(): Promise<void>;
    downloadUpdate(): Promise<void>;
    restartToUpdate(): Promise<void>;
    onUpdateState(callback: (state: UpdateState) => void): () => void;
  };
  config: {
    get(): Promise<AppConfig>;
    set(config: Partial<AppConfig>): Promise<AppConfig>;
  };
  system: {
    getStatus(): Promise<AppStatus>;
    openExternal(url: string): Promise<void>;
  };
  state: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    getAll(): Promise<Record<string, string>>;
  };
  nostling: {
    identities: {
      list(): Promise<NostlingIdentity[]>;
      create(params: CreateIdentityParams): Promise<NostlingIdentity>;
      delete(id: string): Promise<void>;
      updateTheme(id: string, theme: string): Promise<void>;
    };
    contacts: {
      list(identityId: string): Promise<NostlingContact[]>;
      add(identityId: string, npub: string, alias: string): Promise<NostlingContact>;
      delete(contactId: string): Promise<void>;
    };
    messages: {
      list(identityId: string, contactId: string): Promise<NostlingMessage[]>;
      send(identityId: string, contactId: string, content: string): Promise<NostlingMessage>;
      markRead(identityId: string, contactId: string): Promise<void>;
    };
    profiles: {
      get(npub: string): Promise<ProfileContent | null>;
      update(identityId: string, profile: ProfileContent): Promise<void>;
    };
    relay: {
      load(identityId: string): Promise<NostlingRelayConfig>;
      save(identityId: string, config: NostlingRelayConfig): Promise<RelayConfigResult>;
      status(): Promise<Map<string, RelayStatus>>;
    };
    imageCache: {
      cache(url: string): Promise<string>;
      get(url: string): Promise<string | null>;
      clear(): Promise<void>;
    };
  };
}
```

### 14.2 Event Channels

Renderer subscribes to events from main process:

* `update-state`: Update lifecycle state changes
* `nostling:message:received`: New message received from relay
* `nostling:relay:status`: Relay connection status change
* `nostling:queue:status`: Outgoing message queue status change

### 14.3 Channel Naming Convention

Domain-prefixed channels for organization:

* `system:*` - System information and external operations
* `updates:*` - Update lifecycle operations
* `config:*` - Application configuration
* `state:*` - Persistent key-value state
* `relay:*` - Relay configuration and status
* `nostling:identities:*` - Identity management
* `nostling:contacts:*` - Contact management
* `nostling:messages:*` - Message operations
* `nostling:profiles:*` - Profile content
* `nostling:image-cache:*` - Image caching

### 14.4 Security Properties

* No direct Node.js or Electron API access from renderer
* All operations via typed IPC channels
* Input validation on main process side
* No generic eval or dynamic code execution
* Error messages sanitized in production (no stack traces exposed)

---

## 15. Security Model

### 15.1 Renderer Isolation

* No direct Node.js access from renderer
* `contextIsolation: true` and `nodeIntegration: false`
* All system operations via IPC with typed channels
* Input validation on main process side
* No generic eval or dynamic code loading
* Content Security Policy enforced (future enhancement)

### 15.2 Update Security

* RSA-4096 signature verification on manifests
* SHA-256 hash verification on artifacts
* Version validation (no downgrades)
* HTTPS-only in production (custom sources disabled)
* Error messages sanitized in production (no stack traces)
* Dev mode features disabled in packaged builds

### 15.3 Secret Storage

**Production mode:**
* Uses Electron's `safeStorage` API backed by OS keychain
* macOS: Keychain Services
* Linux: Secret Service API (libsecret)
* Secret keys never stored in plaintext or database
* References stored in database, secrets in keychain

**Dev mode:**
* Fallback to encrypted storage with warning
* Never use dev mode secrets in production

### 15.4 Cryptographic Operations

**Key management:**
* BIP-39 mnemonic generation with secure randomness
* Keypair derivation using standard BIP-32/BIP-39 libraries
* Secret keys exist in memory only during crypto operations
* No secret key material in logs (use `[REDACTED]` placeholder)

**Message encryption:**
* NIP-17 encryption for message content
* NIP-59 gift wrap for metadata privacy
* Unique random keys for each gift wrap (ephemeral keypairs)
* Conversation keys for reply handling (deterministic from event IDs)

**Update verification:**
* RSA-4096 public key embedded at build time
* Signature verification before applying any update
* Hash verification of downloaded artifacts
* Tamper detection via manifest integrity checks

### 15.5 Network Security

**Relay connections:**
* WebSocket connections over wss:// (TLS encrypted)
* Certificate validation (ignore cert errors disabled in production)
* No plaintext transmission of messages or keys
* Relay URL validation (whitelist wss:// protocol)

**Image loading:**
* URL sanitization for profile pictures and banners
* Whitelist http:// and https:// protocols only
* XSS protection via content type validation
* No execution of remote scripts (images only)

### 15.6 Privacy Properties

* No external telemetry or analytics
* No user data sent to servers (except standard Nostr protocol)
* Logs stored locally only (no remote transmission)
* IP address exposure only to configured relays (user-controlled)
* Metadata privacy via NIP-59 gift wrapping (no plaintext p-tags)

---

## 16. Build & Release

### 16.1 Packaging

* macOS: `.dmg` (installer) and `.zip` (for updates)
* Linux: `.AppImage` (portable, no root required)

### 16.2 Release Process

* Tags in format `MAJOR.MINOR.PATCH` (no 'v' prefix)
* `package.json` version must match tag exactly
* CI builds packages, signs manifest, creates GitHub Release
* Release includes: platform artifacts, signed manifest, electron-updater metadata

### 16.3 Build Tools

| Tool | Purpose |
|------|---------|
| tsup | Bundles main and preload processes |
| Vite | Bundles renderer (React app) |
| electron-builder | Creates distributable packages |

### 16.4 Build Configuration

**tsup** (`tsup.config.ts`):
* Target: Node 18
* Embeds RSA public key at build time
* External: electron, electron-updater

**Vite** (`vite.renderer.config.ts`):
* Port: 5173 (dev server)
* React plugin enabled
* Output: `dist/renderer`

### 16.5 Output Structure

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

---

## 17. Dev Mode & Testing

### 17.1 Dev Mode Features

Dev mode activates when running the development server. Features automatically disabled in production builds:

**Custom update sources:**
* `DEV_UPDATE_SOURCE`: GitHub URL or file:// path for testing updates
* `ALLOW_PRERELEASE`: Enable pre-release versions
* `FORCE_DEV_UPDATE_CONFIG`: Force dev mode in unpacked app

**Debug UI:**
* `showMessageInfo: true` - Show event details on message bubbles
* `showWarningIcon: true` - Highlight non-gift-wrapped messages
* Message info modal displays event_id, kind, gift wrap status

**Certificate handling:**
* `ignoreCertErrors: true` - Ignore TLS errors for local relay testing
* Disabled in production for security

**Configuration relaxation:**
* Custom relay URLs without TLS (ws:// protocol)
* Local relay testing (localhost, 127.0.0.1)
* Verbose error messages with stack traces

### 17.2 Production Safety

Dev mode features are **automatically disabled** in production builds:
* Custom update sources ignored
* Pre-release versions blocked
* file:// URLs rejected
* Only official GitHub releases via HTTPS accepted
* Error messages sanitized (no stack traces)

### 17.3 Dual-Instance Testing

For verifying messaging behavior and UI changes:

* Start with `make dev-dual`
* Two Nostling instances connected to same local relay
* Instance A: CDP endpoint http://127.0.0.1:9222
* Instance B: CDP endpoint http://127.0.0.1:9223
* Playwright MCP controls both instances for verification
* Use `browser_take_screenshot` or `browser_evaluate` for state inspection
* Test scenarios documented in `docs/dual-instance-testing.md`

---

## 18. Non-Functional Requirements

### 18.1 Performance

* Main window visible within 2 seconds on typical hardware
* Update status appears within 5 seconds of startup (network permitting)
* Background checks do not block UI
* Theme switching < 100ms perceived delay
* Relay connections established within 5 seconds
* Message encryption/decryption < 10ms per message
* Subscription setup < 100ms per identity
* Relay manager handles 50+ relays without UI degradation

### 18.2 Reliability

* App functions normally when GitHub unreachable
* Never applies partially downloaded or unverified updates
* Continues using current version when update fails
* Incomplete updates discarded on restart
* Relay disconnects auto-reconnect with backoff
* Partial publish success (some relays fail) still marks message as sent
* Local storage remains authoritative (relay is secondary)
* App functions fully offline with existing data
* Queued messages publish when connectivity restored
* No crashes or errors when all relays unreachable

### 18.3 Accessibility

* WCAG AA contrast ratios for all themes (4.5:1 normal text, 3:1 large text)
* Keyboard navigation for all interactive elements
* Screen reader support for status indicators
* Drag-and-drop with keyboard alternative (dnd-kit provides this)
* Status indicators not solely color-dependent (include text/icons)
* Emoji picker with WCAG Level AA compliance

### 18.4 Privacy

* No external telemetry
* No user data sent to servers (except standard GitHub update requests and Nostr protocol)
* Logs stored locally only
* Secret keys never logged or exposed
* Metadata privacy via NIP-59 gift wrap (no plaintext recipient tags)

---

## 19. Acceptance Criteria Summary

### 19.1 Installation & Startup

* App installs and starts on macOS 12+ and supported Linux distributions
* Layout visible: header, footer, sidebar, main area
* Footer displays version, update status, relay status, queue status
* Database created automatically on first run
* Migrations execute successfully

### 19.2 Identity Management

* New identity creation derives correct npub from mnemonic
* Mnemonic backup flow prevents accidental skip
* Profile editor displays all 8 fields with live preview
* Profile updates send to all contacts via NIP-59 gift wrap
* Received profiles update contact display names and avatars
* Identity switching applies new identity's theme

### 19.3 Contact Management

* Valid npub creates contact and triggers profile request
* QR scanning creates contact without manual input
* Camera permissions gracefully handled
* Contact profiles display with cached images
* Offline access to cached images works without network
* Unknown senders do not create contacts or store messages

### 19.4 Messaging

* Message encrypted with NIP-17/59 before relay publish
* Offline messages queue locally and flush on reconnect
* Emoji picker inserts at cursor position without text loss
* Status updates reflect relay publish results in real-time
* Received messages decrypted and displayed immediately
* Whitelist enforced before decryption
* Message history persists across app restarts

### 19.5 Relay Management

* Relay connections established within 5 seconds
* Status dots update in real-time as connections change
* Read/write flags correctly control subscription and publish
* Drag-and-drop reordering persists across restarts
* YAML config includes helpful comments
* Overwrite protection prevents data loss from concurrent edits
* Auto-reconnect recovers from temporary network failures

### 19.6 Theme System

* All 17 themes render correctly with proper contrast
* Theme selection updates entire UI in real-time (live preview)
* Per-identity theme persists across app restarts
* Filters correctly narrow theme carousel options
* Cancel reverts to original theme, Apply commits change
* WCAG AA contrast ratios met for all text elements

### 19.7 Update Behavior

* New release triggers: `idle → checking → available → downloading → downloaded → verifying → ready`
* Footer reflects states with appropriate labels and progress
* "Restart to Update" button appears when ready
* Update failures logged, retry available, app remains usable
* Update blocked if: signature fails, hash fails, or version not newer

### 19.8 Security

* Renderer has no direct Node access
* All operations via IPC
* Update blocked if signature/hash verification fails
* Secret keys stored in OS keychain, never in plaintext
* Dev features disabled in production builds

### 19.9 Configuration

* YAML files include helpful comments
* JSON configs auto-migrate to YAML on first load
* Dual-write preserves downgrade path
* App starts successfully with missing or invalid config

---

## 20. Related Specifications & Documentation

This document consolidates all currently implemented features into a comprehensive specification. Additional documentation exists for specific purposes:

### 20.1 Unimplemented/Planned Features

These features are specified but not yet fully implemented:

* [bug-relay-status-indicator-not-updating.md](bug-relay-status-indicator-not-updating.md) - **[Bug]** Footer relay status indicator doesn't consume IPC events
* [reactive-relay-sync-spec.md](reactive-relay-sync-spec.md) - **[Partial]** Event-driven relay synchronization (infrastructure exists, full reactive model incomplete)
* [p2p-webrtc-spec.md](p2p-webrtc-spec.md) - **[Experimental]** Direct peer-to-peer connections (behind dev flag, UI incomplete)
* [custom-theme-creation-spec.md](custom-theme-creation-spec.md) - **[Planned]** User-created custom themes [Priority: High]
* [theme-light-dark-variants-spec.md](theme-light-dark-variants-spec.md) - **[Planned]** Light and dark variants for each theme [Priority: High]
* [mnemonic-backup-e2e-spec.md](mnemonic-backup-e2e-spec.md) - **[Test Spec]** E2E test coverage for mnemonic workflows [Priority: Medium]
* [nip17-e2e-test-spec.md](nip17-e2e-test-spec.md) - **[Test Spec]** Dual-instance Playwright tests for NIP-17 delivery

### 20.2 Reference Documentation

These documents provide analysis, guidelines, or historical context (not feature specifications):

* [secret-storage-security-analysis.md](secret-storage-security-analysis.md) - Security analysis of keychain integration and recovery scenarios
* [nostling-acceptance-criteria.md](nostling-acceptance-criteria.md) - Historical assessment of v0.0.43 against spec requirements
* [style-guides.md](style-guides.md) - Theme system design principles and token-layer architecture
* [themed-messages.md](themed-messages.md) - Lookup table of ostrich-themed status message alternatives

### 20.3 Architecture & User Documentation

* [Technical Architecture](../docs/architecture.md) - Comprehensive technical architecture with implementation details
* [User Stories](../user-stories.md) - User-centric feature descriptions organized by persona and epic
* [Dual-Instance Testing](../docs/dual-instance-testing.md) - Testing procedures for verifying messaging and UI changes
* [README.md](../README.md) - User-facing installation, usage, and development guide

---

**Document Version**: 2.0 (2026-02-12)
**Status**: Current implementation state as of commit 758fcf9
**Maintained by**: AI coding agents for agent-consumable specification
