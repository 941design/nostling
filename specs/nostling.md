# Nostr Client Extension — MVP Specification

## Purpose & Scope
A secure, restricted MVP Nostr client embedded in an existing desktop application (macOS + Linux).  
Primary goal: enable mutual-consent, text-only encrypted direct messaging (Nostr kind 4) between explicitly connected users.  
The system MUST operate offline (queueing outbound messages; full access to existing data).  
The design is implementation-agnostic aside from Nostr protocol requirements.

### Primary Users
- Users of the existing desktop application who want safe, private, controlled Nostr DM communication.

### Desired Outcomes
- Create or import multiple Nostr identities securely.
- Add contacts via scanning or pasting npub; mutual linking required before messages flow.
- Exchange encrypted DMs with mutually connected contacts.
- Operate in a safe whitelist-only mode with no exposure to unsolicited messages.

### Non-Goals
- Public feed, metadata profiles, reactions, or any event types except kind 4.
- Attachments, URL previews, or rich text.
- Telemetry or analytics.

### Release Type
- MVP-level with a focus on correctness, privacy, and safety.

### Success Metrics
- Can reliably create/import identities.
- Mutual connection handshake works without false positives.
- No message from unknown npubs is ever shown to the user.
- DMs send/receive reliably even under intermittent connectivity.
- Message history resyncs consistently.

---

## Core Functionality

### Identity Management
- Support multiple identities per installation.
- Identities appear at top of left sidebar.
- Creating/importing an identity opens a modal via plus button.
- Each identity stores:
  - `npub`
  - secret key reference (in external/local store)
  - label/name (local alias)
- Secret storage:
  - MUST support a pluggable secret-store abstraction.
  - Default: local encrypted storage.
  - OPTIONAL: external stores (e.g., gopass/pass/keychain).
  - Private keys MUST NOT be stored in application config when an external store is active.
- Export/import:
  - Import from `nsec` allowed.
  - Export to clipboard allowed with warnings.
- No auto-lock behavior required.

### Contacts & Whitelisting
- Contacts appear under identities in a unified list (same sidebar).
- Adding a contact uses the lower plus button:
  - Scan QR or paste npub.
  - Newly added contacts initially have `pending` status.
  - Contacts are displayed with local alias; default to npub.
  - Pending contacts show a clear visual indicator.
- Whitelist-only behavior:
  - ONLY contacts in `connected` state may exchange messages.
  - Contacts may be removed; removal deletes their message history.
  - Removed contacts must be re-added (re-import npub) to reconnect.

### Connection Model & Handshake
- A scanning B’s npub produces:
  - A new contact in A’s sidebar marked `pending`.
  - A sends a **welcome DM** (kind 4) to B's npub.
- B sees nothing until B scans A’s npub.
- When B scans A:
  - B retrieves the welcome message from A.
  - B is now `pending` with A and can respond with its own welcome/DM.
- When A receives B’s message:
  - Both contacts become `connected`.
  - UI updates by changing pending indicator and optionally highlighting the contact name.
- No “decline” or “block”; the system is strictly whitelist-only.

### DM Messaging (Kind 4 Only)
- Only Nostr kind 4 events are published or subscribed to.
- Plain-text input only.
- Conversation view in main pane displays thread grouped by contact.
- Each message has:
  - status (`queued | sending | sent | error`)
  - timestamp
  - direction (incoming/outgoing)
- Messages from unknown senders:
  - MUST be silently discarded.
  - MUST NOT be shown to the user.
  - SHOULD be logged as security-relevant events.

### Offline & Queueing
- Users may compose messages offline.
- Messages are queued and retried automatically when at least one relay becomes reachable.
- Status indicators update as messages progress through states.

### Relay Configuration
- App includes default relay list, user-editable.
- Configuration accessible through existing Electron menu.
- Relays must be used to:
  - Publish kind 4 events.
  - Fetch kind 4 events for subscribed contacts (pending or connected only).

### Event Filtering Rules
- Subscriptions MUST filter by:
  - kind 4
  - authors/recipients matching the active identity and its contact whitelist.
- All other event kinds MUST be ignored entirely.
- No metadata/profile enrichment (kind 0 ignored).

### Error Handling
- Application logs all errors via existing logging system.
- Footer displays user-facing error messages (non-blocking).
- Decryption failures or unexpected npubs → silent discard + log.
- Relay disconnects/publish failures → logged + footer status.
- Inconsistencies between local and remote history → logged + footer warning.

---

## Non-Functional Requirements

### Performance
- Must support instant UI responsiveness with message queues of at least several thousand entries.
- Startup should load identities, contacts, and messages within reasonable desktop app expectations (<1–2 seconds typical).

### Reliability
- Message queue must persist across app restarts.
- Local storage is the authoritative message history.
- Relay reconnections should auto-resubscribe safely.

### Security
- Private keys never transmitted outside the local machine.
- External secret stores used if available.
- All inbound events validated and filtered by whitelist.
- Unknown-sender events silently dropped.

### Privacy
- No telemetry or remote analytics.
- Logs remain local only.

### Accessibility
- Basic keyboard navigation for switching identities and contacts.
- Clear visual states for pending and connected contacts.

### Internationalization
- MVP may be English-only unless otherwise updated.

### Scalability
- Support dozens of identities and hundreds of contacts without degraded performance.

### Observability
- Logging system already present; use it consistently across all flows.

---

## Data Model

### Identity
- `id`: internal UUID
- `npub`: public key
- `secret_ref`: reference to key in secret store
- `label`: local name for display
- `relays`: optional per-identity overrides
- `created_at`

### Contact
- `id`: internal UUID
- `identity_id`: owning identity reference
- `npub`
- `alias`: user-defined display name
- `state`: `pending` | `connected`
- `created_at`
- `last_message_at`

### Message
- `id`: internal UUID
- `identity_id`
- `contact_id`
- `sender_npub`
- `recipient_npub`
- `ciphertext`
- `event_id` (after relay publish)
- `timestamp`
- `status`: `queued | sending | sent | error`

---

## UX & Behavior

### Sidebar
- Top section: identities list.
- Below: contacts list.
- Two plus icons:
  - Identity plus → create/import identity.
  - Contact plus → scan/paste npub.
- Contacts show:
  - alias or npub
  - pending indicator if not yet connected

### Main Pane
- Threaded conversation view:
  - Outgoing/incoming grouping
  - Message status badges
- Text input box for sending messages.

### Connection Status Feedback
- When a contact becomes connected:
  - Pending indicator removed.
  - Contact entry visually updated (highlight or icon).

### Relay Errors
- Relay connectivity indicated in footer.
- Failed publishes reflected in message status.

---

## Constraints & Assumptions
- Platforms: macOS, Linux.
- Offline operation required.
- No background processes beyond app runtime.
- Single-window UI.
- Build system handled externally.
- gopass or similar MAY be available; fallback to local encrypted storage if not.

---

## Acceptance Criteria

### Identity Management
- Creating/importing identity results in a visible identity in sidebar.
- Imported nsec regenerates correct npub.
- Private keys stored in external secret store if configured.
- Switching identity updates contact list and conversations.

### Contact Management
- Scanning/pasting npub creates pending contact.
- Pending contact shows indicator.
- When second party scans first party, welcome message is retrieved.
- Mutual messaging transitions both sides to connected state.

### Messaging
- Sending offline queues messages with `queued` status.
- Messages auto-send when connectivity restored.
- Incoming messages from non-whitelisted npubs never appear.
- Conversation correctly displays timestamps and statuses.

### Relay Behavior
- App publishes only kind 4 events.
- App subscribes only to kind 4 events matching whitelist.
- Relay failures visible in footer.

### Data Integrity
- Local message deletions occur when contact is removed.
- Resync reconciling with relays must not corrupt local data.
- Any mismatch logs an error and surfaces footer warning.

### Security
- Private keys never appear outside secure storage.
- Unknown-sender events silently discarded.
- Clipboard export of nsec shows warning.

---

## Delivery & Milestones (MVP Slices)

1. **Identity Foundation**
   - Secret store interface
   - Identity creation/import
   - Sidebar identity listing

2. **Contact Management**
   - Add contact workflow (scan/paste)
   - Pending state logic
   - Local aliases

3. **Handshake & DM Basics**
   - Welcome message flow
   - Mutual connection detection
   - Conversation rendering

4. **Messaging Engine**
   - Offline queue
   - Relay publish + subscribe filters
   - Status indicators

5. **History & Storage**
   - Local message persistence
   - Contact removal + message deletion

6. **Error Handling & UI Polish**
   - Footer messaging
   - Logging coverage
   - Final UI states
