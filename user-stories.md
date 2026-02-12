# User Stories

This document organizes all Nostling features as user stories, grouped by persona and epic. Each story follows the format: **As a** [persona], **I want** [goal], **so that** [benefit].

Status indicators:
- `[Implemented]` - Feature is complete and available
- `[In Progress]` - Feature is being developed
- `[Planned]` - Feature is specified and prioritized for future development

---

## Personas

### Privacy-Conscious Communicator

**Demographics & Background:**
- Desktop user comfortable with GitHub releases and unsigned software
- Values privacy and encrypted communication
- Understands or willing to learn Nostr protocol basics
- May manage multiple online identities (work/personal)
- Cross-platform user (macOS/Linux)

**Goals:**
- Send encrypted direct messages to specific contacts only
- Control identity information sharing (no public profiles)
- Maintain multiple separate identities with different themes/profiles
- Use desktop app that works offline when possible
- Verify software updates cryptographically

**Pain Points:**
- Don't want messages visible on public relays
- Need to distinguish between multiple identities visually
- Manual contact management is tedious (copy-paste npubs)
- Finding good profile avatars requires external hosting
- Generic update messages don't reflect app personality

**Technical Comfort Level:**
- Comfortable with terminal commands for installation workarounds
- Understands concept of private keys and mnemonic backups
- Willing to manually configure relays if needed
- Appreciates detailed technical documentation

---

## Epics

### Epic 1: Identity & Profile Management

*"As a user, I need to create and customize multiple Nostr identities so I can maintain separate online personas"*

**Strategic Value:** Foundation for all app functionality - users must create identities before messaging

---

#### [Implemented] Story: Create Identity from Mnemonic

**As a** Privacy-Conscious Communicator
**I want to** create a Nostr identity from a BIP-39 mnemonic phrase
**So that** I can restore my identity across devices and have a memorable backup

**Acceptance Criteria:**
- ✅ Can enter 12/24-word mnemonic during identity creation
- ✅ Optional derivation path specification
- ✅ Mnemonic validation with clear error messages
- ✅ Mnemonic backup modal for newly generated identities
- ✅ Identity accessible after app restart

**Implementation:** `src/main/nostling/mnemonic-crypto.ts`, `src/main/nostling/mnemonic-storage.ts`

---

#### [Implemented] Story: Edit Identity Profile

**As a** Privacy-Conscious Communicator
**I want to** edit my identity's profile information with live preview
**So that** I can customize how I appear to my contacts

**Acceptance Criteria:**
- ✅ Access via hamburger menu → "Edit Identity Profile"
- ✅ 8 editable fields (label, name, about, picture, banner, website, NIP-05, lud16)
- ✅ Live image preview for picture/banner URLs
- ✅ Apply/Cancel buttons with staging pattern
- ✅ Auto-send profile updates to all contacts on Apply
- ✅ Save operation locking prevents data conflicts
- ✅ Escape key closes panel

**Implementation:** `src/renderer/components/IdentitiesPanel/`, `src/renderer/components/ProfileEditor.tsx`

---

#### [Implemented] Story: Browse and Select Avatar Images

**As a** Privacy-Conscious Communicator
**I want to** browse and select profile avatars from a curated collection
**So that** I can quickly set up my profile without finding/hosting images myself

**Acceptance Criteria:**
- ✅ "Browse" button next to Picture URL field in profile editor
- ✅ Modal with 4x5 grid (20 avatars per page)
- ✅ Subject-based filtering (animals, objects, symbols, etc.)
- ✅ Pagination with Previous/Next controls
- ✅ Click avatar to auto-populate URL and close modal
- ✅ Selected avatar shows in live preview immediately
- ✅ Avatar images cached for fast repeat browsing

**Implementation:** `src/renderer/components/AvatarBrowserModal.tsx`, `src/main/image-cache/`

---

#### [Implemented] Story: Select Visual Theme per Identity

**As a** Privacy-Conscious Communicator
**I want to** select a visual theme for each identity
**So that** I can distinguish between identities at a glance and match my preferences

**Acceptance Criteria:**
- ✅ 10 distinctive themes available (light, dark, sunset, ocean, forest, purple haze, ember, twilight, mint, amber)
- ✅ Theme selection via hamburger menu → "Theme"
- ✅ Live preview with carousel navigation
- ✅ Theme persists per identity in database
- ✅ Instant application when selected (no save button)
- ✅ Theme loads automatically when switching identities

**Implementation:** `src/renderer/components/ThemeSelectionPanel/`, `src/renderer/themes/`

---

#### [Planned] Story: Create Custom Themes

**As a** Privacy-Conscious Communicator
**I want to** create and save custom themes with my own color choices
**So that** I can personalize my experience beyond the 10 presets

**Acceptance Criteria:**
- [ ] Theme generator with sliders for background, text, accent colors
- [ ] Live preview of custom theme
- [ ] Save custom theme to database per identity
- [ ] Custom themes appear alongside presets in theme selector
- [ ] Can edit/delete saved custom themes

**Specification:** [custom-theme-creation-spec.md](specs/custom-theme-creation-spec.md) **[Priority: High]**

---

#### [Planned] Story: Switch Between Light and Dark Theme Variants

**As a** Privacy-Conscious Communicator
**I want** each theme to have both light and dark variants
**So that** I can use my preferred theme in different lighting conditions

**Acceptance Criteria:**
- [ ] Each of 10 themes provides light and dark variant
- [ ] Theme selector shows variant toggle/indicator
- [ ] Variant preference persists per identity
- [ ] Smooth transition when switching variants
- [ ] WCAG AA contrast maintained in all variants

**Specification:** [theme-light-dark-variants-spec.md](specs/theme-light-dark-variants-spec.md) **[Priority: High]**

---

#### [Implemented] Story: Display Identity as QR Code

**As a** Privacy-Conscious Communicator
**I want to** display my identity's npub as a scannable QR code
**So that** others can easily add me as a contact

**Acceptance Criteria:**
- ✅ QR icon button in identity list
- ✅ Modal displays npub as QR code
- ✅ Theme-aware colors (light/dark adaptation)
- ✅ Scannable by other users' cameras
- ✅ Close via button or Escape key

**Implementation:** `src/renderer/components/QrCodeDisplayModal.tsx`

---

### Epic 2: Contact & Conversation Management

*"As a user, I need to manage my contacts and have encrypted conversations so I can communicate privately"*

**Strategic Value:** Core messaging functionality - primary use case for the application

---

#### [Implemented] Story: Scan QR Code to Add Contact

**As a** Privacy-Conscious Communicator
**I want to** scan a QR code with my camera to add a contact
**So that** I don't have to manually type or copy-paste npubs

**Acceptance Criteria:**
- ✅ Camera icon button in contact modal
- ✅ Camera activation on button click
- ✅ QR code detection at 20fps (performance limited)
- ✅ Scanned npub populates input field for review
- ✅ User can verify before adding contact
- ✅ Camera cleanup on modal close/unmount
- ✅ Database prevents duplicate contacts

**Implementation:** `src/renderer/components/QrCodeScannerModal.tsx`

---

#### [Implemented] Story: View Contact Profiles

**As a** Privacy-Conscious Communicator
**I want to** view complete contact profiles with offline-cached images
**So that** I can see contact information even when offline

**Acceptance Criteria:**
- ✅ Access via hamburger menu → "View Contact Profiles"
- ✅ Sidebar shows contact list for selected identity
- ✅ Main panel displays: banner, picture, name, about, website, NIP-05, lud16
- ✅ Banner as header background (social media style)
- ✅ Profile picture overlaid on banner
- ✅ All images cached to disk (100MB LRU limit)
- ✅ Read-only view (no editing)
- ✅ Escape/Cancel returns to chat

**Implementation:** `src/renderer/components/ContactsPanel.tsx`, `src/renderer/components/CachedImage.tsx`

---

#### [Implemented] Story: Send Encrypted Messages with Modern Protocol

**As a** Privacy-Conscious Communicator
**I want to** send encrypted direct messages using modern cryptography (NIP-17/59)
**So that** my messages are private and metadata is hidden from relays

**Acceptance Criteria:**
- ✅ All outgoing messages use NIP-17/59 protocol
- ✅ Non-deterministic encryption (different ciphertext each time)
- ✅ Gift wrap hides sender/recipient from relays
- ✅ Backward compatibility: receives NIP-04 (legacy) messages
- ✅ Legacy messages show deprecation indicator
- ✅ Messages persist with protocol kind (4 or 1059)

**Implementation:** `src/main/nostling/crypto.ts`, `src/main/nostling/service.ts`

---

#### [Implemented] Story: Insert Emojis in Messages

**As a** Privacy-Conscious Communicator
**I want to** insert emojis into messages using an integrated picker
**So that** I can enhance expressiveness without using external tools

**Acceptance Criteria:**
- ✅ Emoji button (😀) in bottom-right of message input
- ✅ Click opens grid of 26 emojis (4×7 layout)
- ✅ Click emoji to insert at cursor position
- ✅ Cursor advances after insertion
- ✅ Menu closes after selection
- ✅ Keyboard navigation (arrow keys, Enter, Space)
- ✅ WCAG Level A accessibility (ARIA labels, screen reader support)
- ✅ Theme-aware styling

**Implementation:** `src/renderer/components/EmojiPicker/`

---

#### [Implemented] Story: Queue Messages When Offline

**As a** Privacy-Conscious Communicator
**I want to** compose messages when offline that automatically send when online
**So that** I can continue using the app without network connectivity

**Acceptance Criteria:**
- ✅ Messages queue locally when relays unreachable
- ✅ Queue status visible in nostling status card
- ✅ Auto-send when connectivity restored
- ✅ Queue summary: "X queued (offline)"
- ✅ Messages marked as in-flight during send
- ✅ Send errors reported with retry option

**Implementation:** `src/main/nostling/service.ts` queue management

---

#### [Planned] Story: Search Messages

**As a** Privacy-Conscious Communicator
**I want to** search through my message history
**So that** I can find specific conversations or information quickly

**Acceptance Criteria:**
- [ ] Search input in conversation panel
- [ ] Search by message content
- [ ] Search by contact name
- [ ] Highlight matching text in results
- [ ] Navigate between search results
- [ ] Clear search to return to full history

**Status:** Documented in TODO.org, no spec yet

---

#### [Planned] Story: Thread Conversations

**As a** Privacy-Conscious Communicator
**I want to** organize messages into threads
**So that** I can follow multiple conversation topics with the same contact

**Acceptance Criteria:**
- [ ] Reply to specific message to create thread
- [ ] Visual indication of threaded messages
- [ ] Expand/collapse threads
- [ ] Navigate within thread
- [ ] Thread metadata (participant count, message count)

**Status:** Documented in TODO.org, no spec yet

---

### Epic 3: Relay & Network Configuration

*"As a user, I need to configure relay connections so I can control how messages are transmitted"*

**Strategic Value:** Enables decentralized architecture - users control their network topology

---

#### [Implemented] Story: Configure Relays per Identity

**As a** Privacy-Conscious Communicator
**I want to** configure which relays each identity uses
**So that** I can control network topology per identity

**Acceptance Criteria:**
- ✅ Access via hamburger menu → "View Relay Config"
- ✅ Compact table with ≤36px rows
- ✅ Drag-and-drop reordering
- ✅ Read/Write checkboxes per relay
- ✅ Live connection status (green/yellow/red dots)
- ✅ Add/remove relays inline
- ✅ Config persists to YAML file per identity
- ✅ Hash-based conflict detection

**Implementation:** `src/renderer/components/RelayTable.tsx`, `src/main/nostling/relay-config-manager.ts`

---

#### [Implemented] Story: View Real-Time Relay Status

**As a** Privacy-Conscious Communicator
**I want to** see real-time relay connection status
**So that** I know which relays are working

**Acceptance Criteria:**
- ✅ Green dot: connected
- ✅ Yellow dot: connecting/reconnecting
- ✅ Red dot: disconnected/error
- ✅ Tooltip shows status text or error
- ✅ Footer summary: "X relays · Y connected · Z failed"
- ✅ Auto-reconnection on network recovery

**Implementation:** `src/main/nostling/relay-pool.ts`, IPC status updates

---

#### [Planned] Story: Event-Driven Relay Synchronization

**As a** Privacy-Conscious Communicator
**I want** relay synchronization to be event-driven instead of polling
**So that** the app uses less bandwidth and battery

**Acceptance Criteria:**
- [ ] No periodic polling for new events
- [ ] Streaming-first approach with reconnection-triggered catch-up
- [ ] Per-relay sparse timestamp tracking (existing infrastructure)
- [ ] State machine: STREAMING → DISCONNECTED → RECOVERING
- [ ] Reduced network traffic compared to current hybrid approach

**Specification:** [reactive-relay-sync-spec.md](specs/reactive-relay-sync-spec.md)
**Status:** Infrastructure exists (`relay_sync_state` table), full reactive model incomplete

---

#### [Planned] Story: Configure Backup Relays

**As a** Privacy-Conscious Communicator
**I want to** configure backup relays that mirror my messages
**So that** I have redundant message storage

**Acceptance Criteria:**
- [ ] Add relay marked as "backup"
- [ ] Incoming messages automatically republished to backup
- [ ] Backup relays not used for sending
- [ ] Configurable per identity
- [ ] Status indicator for backup relay health

**Status:** Detailed design in TODO.org, no spec yet

---

### Epic 4: Theme & Personalization

*"As a user, I want to customize the app's appearance so I can personalize my experience and distinguish identities"*

**Strategic Value:** Improves UX through visual distinction - helps users manage multiple identities

---

#### [Implemented] Story: See Playful Ostrich-Themed Messages

**As a** Privacy-Conscious Communicator
**I want to** see playful, ostrich-themed status messages
**So that** the app reflects its personality and is delightful to use

**Acceptance Criteria:**
- ✅ Update status: "Standing tall" (up to date), "Pecking up" (downloading), "Eyes peeled" (checking)
- ✅ Nostling queue: "Flock gathered" (queued), "Wings spread" (sending)
- ✅ Error states: "Ruffled feathers" (errors), "Head in sand" (offline)
- ✅ 2-3 alternatives per status type
- ✅ Random selection on each display
- ✅ Preserves dynamic content (versions, percentages, counts)

**Implementation:** `src/main/utils/themed.ts`, `src/main/state/themed.ts`, `themed-messages.json`

---

#### [Implemented] Story: View Profile Avatars with Status Badges

**As a** Privacy-Conscious Communicator
**I want to** see avatars with status badges for identities and contacts
**So that** I can visually identify profile sources at a glance

**Acceptance Criteria:**
- ✅ Avatar displays profile picture or letter circle fallback
- ✅ Status badge overlay (top-right corner):
  - Shield check: private profile
  - Shield warning: public profile discovered
  - Shield off: no profile (alias/npub)
- ✅ WCAG AA contrast (4.5:1)
- ✅ Appears in identity lists, contact lists, conversation views
- ✅ XSS protection via URL sanitization

**Implementation:** `src/renderer/components/Avatar.tsx`, `src/renderer/components/AvatarWithBadge.tsx`

---

### Epic 5: Security & Updates

*"As a user, I need secure cryptographic verification so I can trust software updates"*

**Strategic Value:** Critical for trust in self-updating desktop application

---

#### [Implemented] Story: Verify Software Updates Cryptographically

**As a** Privacy-Conscious Communicator
**I want to** verify software updates with RSA signatures
**So that** I can trust updates haven't been tampered with

**Acceptance Criteria:**
- ✅ RSA-4096 signature verification on manifests
- ✅ SHA-256 hash verification on artifacts
- ✅ Version validation (no downgrades)
- ✅ HTTPS-only in production
- ✅ Dev mode allows file:// URLs for testing
- ✅ Error messages sanitized in production
- ✅ Update footer shows progress and status

**Implementation:** `src/main/security/verify.ts`, `src/main/security/crypto.ts`, `src/main/integration.ts`
**Specification:** [spec.md](specs/spec.md) Section 4

---

#### [Implemented] Story: Store Private Keys Securely

**As a** Privacy-Conscious Communicator
**I want to** store private keys securely using OS keychain
**So that** my keys are protected by OS-level encryption

**Acceptance Criteria:**
- ✅ Production: Uses Electron `safeStorage` (macOS Keychain, Linux libsecret)
- ✅ Dev mode: Base64 encoding (no session key conflicts)
- ✅ Decryption errors reported with recovery guidance
- ✅ No plaintext fallback in production
- ✅ Errors propagate through IPC with structured types

**Implementation:** `src/main/nostling/secret-store.ts`
**Specification:** [secret-storage-security-analysis.md](specs/secret-storage-security-analysis.md)

---

#### [Planned] Story: Comprehensive Mnemonic Backup E2E Tests

**As a** Privacy-Conscious Communicator
**I want** comprehensive E2E test coverage for mnemonic workflows
**So that** I can trust the backup and recovery process

**Acceptance Criteria:**
- [ ] E2E test for mnemonic display modal
- [ ] E2E test for mnemonic copy to clipboard
- [ ] E2E test for identity recovery from mnemonic
- [ ] E2E test for nsec export
- [ ] All tests run in Docker CI environment

**Specification:** [mnemonic-backup-e2e-spec.md](specs/mnemonic-backup-e2e-spec.md) **[Priority: Medium]**
**Status:** Feature exists, test coverage incomplete

---

### Epic 6: Privacy & Offline Support

*"As a user, I want my data to stay private and work offline so I control my information"*

**Strategic Value:** Core value proposition - privacy-first architecture

---

#### [Implemented] Story: Share Profile Privately with Contacts

**As a** Privacy-Conscious Communicator
**I want to** share profile information only with my contacts
**So that** my profile isn't published to public relays

**Acceptance Criteria:**
- ✅ Profiles sent via NIP-59 encrypted messages only
- ✅ Auto-send on contact addition
- ✅ Auto-broadcast to all contacts on profile update
- ✅ Display name precedence: alias > private > public > npub
- ✅ Send state tracking prevents redundant sends
- ✅ Idempotent operations (hash-based deduplication)

**Implementation:** `src/main/nostling/profile-sender.ts`, `src/main/nostling/profile-receiver.ts`

---

#### [Implemented] Story: Access Cached Images Offline

**As a** Privacy-Conscious Communicator
**I want to** access cached profile images when offline
**So that** I can view contacts even without network connectivity

**Acceptance Criteria:**
- ✅ Disk-based cache with 100MB LRU limit
- ✅ Cache location: Electron userData directory
- ✅ SHA-256 URL hashing for cache keys
- ✅ SQLite metadata for fast lookups
- ✅ Automatic eviction when limit exceeded
- ✅ File permissions: 0o700 (dir), 0o600 (files)
- ✅ URL change detection re-fetches images

**Implementation:** `src/main/image-cache/image-cache-service.ts`, `src/main/image-cache/cache-database.ts`

---

#### [Planned] Story: Receive Desktop Notifications

**As a** Privacy-Conscious Communicator
**I want** desktop notifications when messages arrive while app is in background
**So that** I don't miss important messages

**Acceptance Criteria:**
- [ ] System notification shows on new message
- [ ] Notification includes sender name (from display name precedence)
- [ ] Notification preview respects privacy (no message content)
- [ ] Click notification brings app to foreground
- [ ] Configurable: enable/disable per identity
- [ ] Respects system Do Not Disturb mode

**Status:** Documented in TODO.org, no spec yet

---

#### [Planned] Story: Direct P2P WebRTC Connections

**As a** Privacy-Conscious Communicator
**I want** direct peer-to-peer connections with contacts on IPv6
**So that** messages have lower latency and don't go through relays

**Acceptance Criteria:**
- [ ] Visual status indicator per contact (green/yellow/red/gray dot)
- [ ] Automatic connection attempts on "send message"
- [ ] IPv6 capability detection
- [ ] Fallback to relay-based messaging
- [ ] Connection status tooltips
- [ ] P2P messages marked distinctly from relay messages

**Specification:** [p2p-webrtc-spec.md](specs/p2p-webrtc-spec.md)
**Status:** Experimental, infrastructure exists, behind `enableP2P` dev flag, UI incomplete

---

## Summary Statistics

### Implemented Features
- **Identity & Profile Management**: 5 stories
- **Contact & Conversation Management**: 4 stories
- **Relay & Network Configuration**: 2 stories
- **Theme & Personalization**: 2 stories
- **Security & Updates**: 2 stories
- **Privacy & Offline Support**: 2 stories

**Total Implemented**: 17 stories

### Planned Features
- **Identity & Profile Management**: 2 stories (custom themes, theme variants)
- **Contact & Conversation Management**: 2 stories (search, threads)
- **Relay & Network Configuration**: 2 stories (reactive sync, backup relays)
- **Security & Updates**: 1 story (mnemonic E2E tests)
- **Privacy & Offline Support**: 2 stories (desktop notifications, P2P connections)

**Total Planned**: 9 stories

### Total User Stories: 26 stories across 6 epics

---

## References

- [Main Specification (specs/spec.md)](specs/spec.md) - Comprehensive specification of all implemented functionality
- [Technical Architecture (docs/architecture.md)](docs/architecture.md) - Technical implementation details and architecture
- [README.md](README.md) - User-facing installation and usage guide
- [Remaining Feature Specifications (specs/)](specs/) - Specs for unimplemented/planned features, bugs, and reference documentation
