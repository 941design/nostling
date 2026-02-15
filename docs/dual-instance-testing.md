# Dual-Instance Testing Guide

Manual and agentic test procedures for verifying Nostling behavior across two instances connected to a shared relay. These tests cover messaging, profile exchange, relay connectivity, and UI correctness that cannot be validated with a single instance.

All user-facing actions are performed exclusively through UI interactions (see `docs/dual-instance-playwright-setup.md` — Test Design Principles).

## Test Environment Setup

### Quick Start

```bash
make dev-dual
```

This builds the app, starts a local strfry relay on `ws://localhost:8080`, launches two Electron instances with Chrome DevTools Protocol debugging, and prints the MCP config snippet.

| Instance | CDP Port | Data Directory | Log File |
|----------|----------|----------------|----------|
| A | 9222 | `/tmp/nostling-a` | `/tmp/nostling-a.log` |
| B | 9223 | `/tmp/nostling-b` | `/tmp/nostling-b.log` |

On Linux, the script also starts Xvfb (virtual display) and gnome-keyring (secure storage). See `docs/dual-instance-playwright-setup.md` for manual setup, platform-specific details, and troubleshooting.

### MCP Configuration

After `make dev-dual` prints its config snippet, add it to `.mcp.json`:

```json
{
  "mcpServers": {
    "playwright-a": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--cdp-endpoint", "http://127.0.0.1:9222"]
    },
    "playwright-b": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--cdp-endpoint", "http://127.0.0.1:9223"]
    }
  }
}
```

### Clean Start

To guarantee a clean state, delete data directories and relay data before starting:

```bash
rm -rf /tmp/nostling-a /tmp/nostling-b /tmp/nostling-a.log /tmp/nostling-b.log
docker compose -f docker-compose.e2e.yml down -v
make dev-dual
```

### Agentic Environment Management

When tests are run by an AI agent (via `/manual-test`), the agent is allowed to start, stop, and restart the environment as needed. The test environment exists solely for running these tests.

**Restart procedure** (non-interactive, suitable for background execution):

```bash
# 1. Kill existing Electron instances
pkill -f "electron.*nostling" 2>/dev/null || true
sleep 2

# 2. Clean data directories and logs
rm -rf /tmp/nostling-a /tmp/nostling-b /tmp/nostling-a.log /tmp/nostling-b.log

# 3. Ensure relay is running
docker compose -f docker-compose.e2e.yml up -d
sleep 2

# 4. Launch fresh instances in background
./scripts/dev-dual.sh &

# 5. Wait for CDP endpoints (poll up to 30s)
for port in 9222 9223; do
  for i in $(seq 1 30); do
    curl -s "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1 && break
    sleep 1
  done
done
```

**When to restart**:
- CDP endpoints are unreachable
- Relay connectivity is broken and cannot recover
- A test requires a clean start (e.g., T05)
- The prior test disrupted relay connectivity (e.g., stopped/started the relay)

### Instrumentation Notes

- `playwright-a` controls Instance A, `playwright-b` controls Instance B.
- Use `browser_take_screenshot` or `browser_evaluate` for verification. `browser_snapshot` is unreliable with Chakra UI (returns empty YAML after re-renders).
- `browser_evaluate` may be used to read displayed state (e.g., extracting an npub shown in the UI). It must NOT be used to execute actions — all mutations go through UI interactions.
- Logs are the primary verification mechanism: grep for `Publish complete`, `Received NIP-17 DM`, and `Stored incoming`.

---

## Pre-Test: Identity and Contact Setup

This sequence is a prerequisite for all test scenarios below.

### Steps

1. **Instance A** -- Create identity "Alice": Click the "Create Identity" button. Enter "Alice" as the label. Submit the form. After creation, navigate to the identity details view and record Alice's npub (use `browser_evaluate` to extract the npub text from the displayed element).

2. **Instance B** -- Create identity "Bob": Same procedure. Record Bob's npub.

3. **Instance A** -- Add Bob as contact: Click the "Add Contact" button. Paste Bob's npub into the npub field. Enter "Bob" as the alias. Submit the form.

4. **Instance B** -- Add Alice as contact: Same procedure using Alice's npub and alias "Alice".

5. **Both instances** -- Take screenshots. Each should show the identity in the sidebar with the other party listed under Contacts.

---

## Test Scenarios

### T01: NIP-17 Bidirectional Message Delivery

**Verifies**: Core NIP-17/59 gift-wrap messaging works end-to-end.
**Source**: User story "Send Encrypted Messages with Modern Protocol" (Epic 2), NIP-17 timestamp lookback AC-002.

#### Steps

1. **Instance A** -- Click on Bob's contact card in the sidebar to open the conversation. Type `Hello Bob from Alice [t01-msg1]` in the message input field. Click the Send button.

2. **Wait** 15 seconds for relay propagation and subscription delivery.

3. **Instance B** -- Click on Alice's contact card to open the conversation. Take screenshot. Verify the message "Hello Bob from Alice [t01-msg1]" appears in the conversation pane as an incoming message (left-aligned).

4. **Log check** -- Instance A log:
   ```
   grep "Publish complete" /tmp/nostling-a.log
   ```
   Expected: `Publish complete: 1 succeeded, 0 failed out of 1 relays`

5. **Log check** -- Instance B log:
   ```
   grep "Received NIP-17 DM" /tmp/nostling-b.log
   ```
   Expected: One `Received NIP-17 DM` entry.

6. **Instance B** -- With Alice's conversation still open, type `Hello Alice from Bob [t01-msg2]` in the message input field. Click the Send button.

7. **Wait** 15 seconds.

8. **Instance A** -- Take screenshot. Verify both messages appear: the outgoing "Hello Bob from Alice [t01-msg1]" (right-aligned) and the incoming "Hello Alice from Bob [t01-msg2]" (left-aligned).

9. **Log check** -- Instance A:
   ```
   grep "Received NIP-17 DM" /tmp/nostling-a.log
   ```
   Expected: One `Received NIP-17 DM` entry.

#### Expected Result

- 100% delivery rate in both directions.
- Messages use `kind: 14` and `wasGiftWrapped: true`.
- Zero errors in either log file.

---

### T02: NIP-17 Timestamp Lookback Window

**Verifies**: The 3-day subscription lookback catches gift wraps with randomized `created_at` timestamps up to 2 days in the past.
**Source**: NIP-17 timestamp lookback AC-001, AC-003.

#### Steps

1. Complete pre-test setup.

2. **Instance A** -- Click on Bob's contact card. Send 10 messages by typing each in the message input and clicking Send, pausing ~1 second between each: `Lookback test A->B [msg-1]` through `Lookback test A->B [msg-10]`.

3. **Instance B** -- Click on Alice's contact card. Send 10 messages using the same pattern: `Lookback test B->A [msg-1]` through `Lookback test B->A [msg-10]`.

4. **Wait** 30 seconds for all deliveries.

5. **Log check** -- Count received messages:
   ```
   grep -c "Received NIP-17 DM" /tmp/nostling-a.log  # Expected: 10
   grep -c "Received NIP-17 DM" /tmp/nostling-b.log  # Expected: 10
   ```

6. **Log check** -- Verify subscription filters include 3-day window:
   ```
   grep "Kind 1059 filter" /tmp/nostling-a.log | head -1
   grep "Kind 1059 filter" /tmp/nostling-b.log | head -1
   ```
   Expected: Both logs show `Kind 1059 filter for pubkey:` entries, confirming kind-specific filter handling.

7. **Relay query** (optional, for deep verification) -- Use `wscat` or a WebSocket client to query the relay for all kind 1059 events addressed to each pubkey. Verify the count matches the log count.

#### Expected Result

- 20/20 messages delivered (100% delivery rate).
- Log entry counts match relay event counts (zero log gaps).
- Subscription filters log kind 1059 separately from other kinds.

---

### T03: Unread Message Badge

**Verifies**: Unread message count badge appears on contact card when messages arrive while a different contact (or no contact) is selected.
**Source**: UI messaging behavior.

#### Steps

1. Complete pre-test setup.

2. **Instance B** -- Ensure Bob's UI does NOT have Alice's contact selected. If Alice is selected, click elsewhere or reload the page so no conversation is open.

3. **Instance A** -- Click on Bob's contact card. Send 3 messages via the message input, pausing ~1 second between each: `Unread test [msg-1]`, `Unread test [msg-2]`, `Unread test [msg-3]`.

4. **Wait** 15 seconds.

5. **Instance B** -- Take screenshot. Verify Alice's contact card in the sidebar shows a badge with "3".

6. **Instance B** -- Click on Alice's contact card to open the conversation.

7. **Instance B** -- Take screenshot. Verify:
   - All 3 messages are visible in the conversation pane.
   - The unread badge has disappeared from Alice's contact card.

#### Expected Result

- Badge displays the correct unread count (3).
- Badge clears when the conversation is opened.

---

### T04: Profile Update Propagation

**Verifies**: When a user updates their profile, contacts receive the update via NIP-59 private profile exchange.
**Source**: User story "Share Profile Privately with Contacts" (Epic 6), user story "Edit Identity Profile" (Epic 1).

#### Steps

1. Complete pre-test setup.

2. **Instance B** -- Take screenshot. Note how Alice's contact card currently displays (should show alias "Alice" or the npub).

3. **Instance A** -- Navigate to the identity settings or profile editor for Alice. Update the display name to "Alice Wonderland" and the about field to "Privacy advocate". Save the changes.

4. **Wait** 30 seconds for profile broadcast and discovery.

5. **Instance B** -- Reload the page. Take screenshot. Verify Alice's contact card reflects the updated profile (display name precedence: alias > private profile name > public > npub).

#### Expected Result

- Profile update is delivered via NIP-59 encrypted message.
- Contact profile data is updated on the receiving instance.
- UI reflects the profile change after reload (or within the profile discovery cycle).

---

### T05: Message Delivery After Relay Reconnection

**Verifies**: Messages sent while the recipient is disconnected are delivered when the recipient reconnects.
**Source**: User story "Queue Messages When Offline" (Epic 2), relay reconnection behavior.

#### Steps

1. **Clean start required** -- Delete data directories and logs, then launch fresh instances. Existing identities/contacts/messages from prior runs invalidate this test. The relay does not need pruning; old npubs become irrelevant once new identities are created.
   ```bash
   rm -rf /tmp/nostling-a /tmp/nostling-b /tmp/nostling-a.log /tmp/nostling-b.log
   make dev-dual
   ```

2. Complete pre-test setup via UI. Verify both instances show idle/synced themed footer messages (e.g., "Nostling idle", "Preening peacefully").

3. **Instance B** -- Take screenshot. Note the current footer status (should show idle/synced themed message).

4. **Stop the relay**:
   ```bash
   docker compose -f docker-compose.e2e.yml stop nostr-relay
   ```

5. **Wait** 10 seconds. Both instances should detect the disconnection.

6. **Instance A** -- Click on Bob's contact card. Type `Sent while relay is down [t05]` in the message input. Click Send. The message will be queued or fail to publish.

7. **Restart the relay**:
   ```bash
   docker compose -f docker-compose.e2e.yml start nostr-relay
   ```

8. **Wait** 30 seconds for reconnection and automatic message retry.

9. **Instance A** -- Reload the page to trigger queue flush (there is no manual retry button in the UI).

10. **Wait** 15 seconds.

11. **Instance B** -- Take screenshot. Verify the message "Sent while relay is down [t05]" appears.

12. **Log check** -- Instance B:
    ```
    grep "Received NIP-17 DM" /tmp/nostling-b.log
    ```

#### Expected Result

- Message is queued locally during relay outage.
- After relay recovery, the message is published and delivered.
- Both instances show normal themed footer messages (idle/synced) after reconnection.

---

### T06: Relay Status Indicator

**Verifies**: Real-time relay connection status is displayed correctly.
**Source**: User story "View Real-Time Relay Status" (Epic 3).

#### Steps

1. Complete pre-test setup. Both instances should show the relay as connected.

2. **Both instances** -- Take screenshots. Verify footer shows idle/synced themed messages (e.g., "Nostling idle", "Preening peacefully") indicating normal operation.

3. **Stop the relay**:
   ```bash
   docker compose -f docker-compose.e2e.yml stop nostr-relay
   ```

4. **Wait** 15 seconds for disconnection detection.

5. **Both instances** -- Take screenshots. Verify footer shows offline-themed messages (e.g., "offline", "savanna unreachable", "flock distant") indicating relay disconnection.

6. **Restart the relay**:
   ```bash
   docker compose -f docker-compose.e2e.yml start nostr-relay
   ```

7. **Wait** 15 seconds for reconnection.

8. **Both instances** -- Take screenshots. Verify footer shows idle/synced themed messages again (e.g., "Nostling idle", "Flock in harmony").

9. **Log check** -- Both instances should show:
   ```
   grep "connection dropped\|reconnected" /tmp/nostling-a.log
   ```
   Expected: `Relay ws://localhost:8080/: connection dropped` followed by `reconnected`.

#### Expected Result

- Footer status transitions: idle/synced themed messages -> offline-themed messages -> idle/synced themed messages.
- Offline-themed messages appear when all relays are disconnected (priority 4.5: after errors/sending/queued, before synced/idle).
- Reconnection is automatic (no user intervention).
- Log entries confirm the full disconnect/reconnect cycle.

---

### T07: Contact Deletion Stops Message Reception

**Verifies**: After deleting a contact, messages from them are no longer stored or displayed.
**Source**: User story "View Contact Profiles" (Epic 2), contact management behavior.

#### Steps

1. Complete pre-test setup and send at least one message in each direction via the UI (per T01).

2. **Instance B** -- Navigate to Alice's contact in the sidebar. Open the contact's context menu or details view and click the delete/remove option. Confirm deletion if prompted.

3. **Instance B** -- Reload the page. Take screenshot. Verify Alice no longer appears in the contacts list.

4. **Instance A** -- Click on Bob's contact card. Type `Message after contact deletion [t07]` in the message input. Click Send.

5. **Wait** 15 seconds.

6. **Instance B** -- Take screenshot. Verify the message does not appear in any conversation. Check if the message appears as an "unknown sender" event or is silently discarded.

7. **Log check** -- Instance B:
   ```
   grep "t07\|unknown\|discard" /tmp/nostling-b.log
   ```

#### Expected Result

- Deleted contact no longer appears in the sidebar.
- Messages from the deleted contact are either discarded or quarantined (not shown in a conversation).

---

### T08: Message Ordering Under Timestamp Randomization

**Verifies**: Messages sent in rapid succession display in the correct order despite NIP-17 timestamp randomization.
**Source**: NIP-17/59 protocol behavior, messaging UX.

#### Steps

1. Complete pre-test setup.

2. **Instance A** -- Click on Bob's contact card. Send 5 numbered messages as fast as possible by typing each in the message input and clicking Send: `Order test [1 of 5]`, `Order test [2 of 5]`, `Order test [3 of 5]`, `Order test [4 of 5]`, `Order test [5 of 5]`.

3. **Wait** 20 seconds.

4. **Instance B** -- Click on Alice's contact card. Take screenshot. Verify the messages appear in order: [1 of 5], [2 of 5], [3 of 5], [4 of 5], [5 of 5] from top to bottom.

5. **Instance A** -- Take screenshot. Verify the outgoing messages also appear in the correct order.

#### Expected Result

- Messages display in send order, not in `created_at` order (which is randomized for NIP-17).
- The application uses the inner message timestamp (kind 14), not the outer gift wrap timestamp (kind 1059).

---

### T09: Kind 1059 Polling Fallback

**Verifies**: The polling mechanism (`pollMessages`) also queries for kind 1059 events, providing defense-in-depth delivery.
**Source**: NIP-17 timestamp lookback story 02 (polling kind 1059 enhancement).

#### Steps

1. Complete pre-test setup.

2. **Instance A** -- Click on Bob's contact card. Type `Polling fallback test [t09]` in the message input. Click Send.

3. **Wait** for delivery (confirm via log).

4. **Log check** -- Instance B:
   ```
   grep "getSubscriptionFilters\|Kind 1059 filter\|pollMessages" /tmp/nostling-b.log | tail -20
   ```
   Verify that:
   - Subscription filters include kind 1059 (`Kind 1059 filter for pubkey:` entries).
   - Polling logs show kind 1059 filters being included alongside kind 4.

#### Expected Result

- Kind 1059 events are queried in both the streaming subscription and the polling mechanism.
- Two independent delivery paths exist for NIP-17 messages.

---

### T10: Private Profile Exchange (NIP-59)

**Verifies**: Private profiles are exchanged exclusively via NIP-59 encrypted messages and not published to relays as kind:0 events.
**Source**: User story "Share Profile Privately with Contacts" (Epic 6).

#### Steps

1. Complete pre-test setup.

2. **Instance A** -- Navigate to the identity settings or profile editor for Alice. Set the display name to "Alice Private", the about field to "This is private info", and the picture URL to `https://example.com/alice-private.png`. Save the changes.

3. **Wait** 30 seconds for NIP-59 profile broadcast.

4. **Instance B** -- Reload the page. Take screenshot. Verify Alice's contact card shows the updated profile name.

5. **Relay query** (verification) -- Query the relay for kind:0 events from Alice's pubkey. There should be **none** (private profiles are not published as kind:0).

#### Expected Result

- Private profile fields are delivered to contacts via NIP-59.
- No kind:0 event for Alice exists on the relay.
- Instance B displays the private profile fields received from Alice.

---

### T11: Media Upload and Cross-Instance Delivery

**Verifies**: Full attachment flow from UI through blob storage, Blossom upload pipeline, placeholder replacement, NIP-94 imeta encryption, to cross-instance image rendering.
**Source**: Blossom media uploads epic (stories 01-10).
**Prerequisites**: `make dev-dual` (includes blossom server on port 3001), identities + contacts set up per pre-test.

#### Steps

1. **Instance A** -- Navigate to the Blossom server settings for Alice's identity. Add a server with URL `http://localhost:3001` and label "Dev Blossom". Save.

2. **Instance A** -- Click on Bob's contact card to open the conversation. Drag a test image file (e.g., `e2e/fixtures/test-image.png`) onto the message composer area, or click the attachment button and select the file. Verify the attachment preview strip appears above the message input showing the image thumbnail with a remove button.

3. **Instance A** -- Type `Image test [t11]` in the message input. Click the Send button.

4. **Wait** 30 seconds for blob storage, upload pipeline processing, and relay delivery.

5. **Instance A** -- Take screenshot. Verify the sent message shows an image thumbnail (not a broken image or placeholder). The upload progress indicator should have completed.

6. **Instance A** -- Take screenshot. Verify the message does not show a persistent "sending" or "uploading" status — it should appear as sent.

7. **Instance B** -- Click on Alice's contact card. Take screenshot. Verify the received message shows the image.

8. **Log check** -- Instance A:
   ```
   grep "Upload.*complete\|marked as sent" /tmp/nostling-a.log
   ```

#### Expected Result

- Image is stored locally, uploaded to blossom server, and delivered to the recipient.
- `local-blob:` placeholder replaced with remote `http://localhost:3001/blob/<hash>` URL.
- Message status transitions: `sending` -> `sent`.
- Image visible in both instances' conversation views.

---

### T12: Non-Image File Attachment

**Verifies**: File attachment type detection, MIME icon display, non-image attachment handling.
**Source**: Blossom media uploads epic (stories 01, 03).
**Prerequisites**: Same as T11.

#### Steps

1. **Instance A** -- Click on Bob's contact card. Drag a non-image file (e.g., a `.txt` or `.pdf` file) onto the message composer area, or click the attachment button and select the file. Verify the attachment preview strip shows a file type icon (not an image thumbnail) with the filename.

2. **Instance A** -- Type `File test [t12]` in the message input. Click Send.

3. **Wait** 30 seconds.

4. **Instance A** -- Take screenshot. Verify the sent message shows a file attachment indicator (icon, filename, size) rather than an image thumbnail.

5. **Instance B** -- Click on Alice's contact card. Take screenshot. Verify the received message shows the file attachment with appropriate icon and metadata.

#### Expected Result

- Non-image file is stored and uploaded without image-specific processing (no dimensions, no blurhash).
- File attachment renders with file icon and name/size, not as an image thumbnail.
- Message delivery works end-to-end for non-image attachments.
