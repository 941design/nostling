# Dual-Instance Testing Guide

Manual and agentic test procedures for verifying Nostling behavior across two instances connected to a shared relay. These tests cover messaging, profile exchange, relay connectivity, and UI correctness that cannot be validated with a single instance.

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

### Instrumentation Notes

- `playwright-a` controls Instance A, `playwright-b` controls Instance B.
- Use `browser_take_screenshot` or `browser_evaluate` for verification. `browser_snapshot` is unreliable with Chakra UI (returns empty YAML after re-renders).
- The IPC bridge is available at `window.api.nostling.*` (identities, contacts, messages, relays, profiles).
- Logs are the primary verification mechanism: grep for `Publish complete`, `Received NIP-17 DM`, and `Stored incoming`.

---

## Pre-Test: Identity and Contact Setup

This sequence is a prerequisite for all test scenarios below.

### Steps

1. **Instance A** -- Create identity "Alice":
   ```js
   await window.api.nostling.identities.create({ label: 'Alice' })
   ```
   Record the returned `id` (Alice's identity ID) and `npub` (Alice's public key).

2. **Instance B** -- Create identity "Bob":
   ```js
   await window.api.nostling.identities.create({ label: 'Bob' })
   ```
   Record Bob's `id` and `npub`.

3. **Instance A** -- Add Bob as contact:
   ```js
   await window.api.nostling.contacts.add({
     identityId: '<alice-identity-id>',
     npub: '<bob-npub>',
     alias: 'Bob'
   })
   ```
   Record the returned contact ID.

4. **Instance B** -- Add Alice as contact:
   ```js
   await window.api.nostling.contacts.add({
     identityId: '<bob-identity-id>',
     npub: '<alice-npub>',
     alias: 'Alice'
   })
   ```
   Record the returned contact ID.

5. **Both instances** -- Reload UI:
   ```js
   location.reload()
   ```
   Wait 3 seconds for re-render.

6. **Verify** -- Take screenshots of both instances. Each should show the identity in the sidebar with the other party listed under Contacts.

---

## Test Scenarios

### T01: NIP-17 Bidirectional Message Delivery

**Verifies**: Core NIP-17/59 gift-wrap messaging works end-to-end.
**Source**: User story "Send Encrypted Messages with Modern Protocol" (Epic 2), NIP-17 timestamp lookback AC-002.

#### Steps

1. **Instance A** -- Send message from Alice to Bob:
   ```js
   await window.api.nostling.messages.send({
     identityId: '<alice-identity-id>',
     contactId: '<bob-contact-id-on-A>',
     plaintext: 'Hello Bob from Alice [t01-msg1]'
   })
   ```

2. **Wait** 15 seconds for relay propagation and subscription delivery.

3. **Instance B** -- Take screenshot. Verify the message "Hello Bob from Alice [t01-msg1]" appears in the conversation pane as an incoming message (left-aligned).

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

6. **Instance B** -- Send reply from Bob to Alice:
   ```js
   await window.api.nostling.messages.send({
     identityId: '<bob-identity-id>',
     contactId: '<alice-contact-id-on-B>',
     plaintext: 'Hello Alice from Bob [t01-msg2]'
   })
   ```

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

1. Complete T01 setup (identities + contacts).

2. **Send 10 messages** from Instance A to Instance B, spaced 1 second apart:
   ```js
   for (let i = 1; i <= 10; i++) {
     await window.api.nostling.messages.send({
       identityId: '<alice-identity-id>',
       contactId: '<bob-contact-id-on-A>',
       plaintext: `Lookback test A->B [msg-${i}]`
     });
     await new Promise(r => setTimeout(r, 1000));
   }
   ```

3. **Send 10 messages** from Instance B to Instance A (same pattern).

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

3. **Instance A** -- Send 3 messages from Alice to Bob:
   ```js
   for (let i = 1; i <= 3; i++) {
     await window.api.nostling.messages.send({
       identityId: '<alice-identity-id>',
       contactId: '<bob-contact-id-on-A>',
       plaintext: `Unread test [msg-${i}]`
     });
     await new Promise(r => setTimeout(r, 500));
   }
   ```

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

2. **Instance A** -- Take screenshot. Note Alice's current display in Bob's contact card on Instance B (should show alias "Alice" or the npub).

3. **Instance A** -- Update Alice's private profile:
   ```js
   await window.api.nostling.profiles.updatePrivate({
     identityId: '<alice-identity-id>',
     content: { name: 'Alice Wonderland', about: 'Privacy advocate' }
   })
   ```

4. **Wait** 30 seconds for profile broadcast and discovery.

5. **Instance B** -- Check if the profile was received:
   ```js
   await window.api.nostling.profiles.getContactProfile('<alice-contact-id-on-B>')
   ```
   Expected: Returns object with `name: 'Alice Wonderland'`.

6. **Instance B** -- Reload and take screenshot. Verify Alice's contact card reflects the updated profile name (display name precedence: alias > private profile name > public > npub).

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

2. Complete pre-test setup (create identities + contacts). Verify both instances show relay connected (footer status).

3. **Instance B** -- Note the current footer status (should indicate connected relay).

4. **Stop the relay**:
   ```bash
   docker compose -f docker-compose.e2e.yml stop nostr-relay
   ```

5. **Wait** 10 seconds. Both instances should detect the disconnection.

6. **Instance A** -- Send a message (it will be queued or fail to publish):
   ```js
   await window.api.nostling.messages.send({
     identityId: '<alice-identity-id>',
     contactId: '<bob-contact-id-on-A>',
     plaintext: 'Sent while relay is down [t05]'
   })
   ```

7. **Restart the relay**:
   ```bash
   docker compose -f docker-compose.e2e.yml start nostr-relay
   ```

8. **Wait** 30 seconds for reconnection and message retry.

9. **Instance A** -- Trigger message retry if needed:
   ```js
   await window.api.nostling.messages.retry('<alice-identity-id>')
   ```

10. **Wait** 15 seconds.

11. **Instance B** -- Take screenshot. Verify the message "Sent while relay is down [t05]" appears.

12. **Log check** -- Instance B:
    ```
    grep "Received NIP-17 DM" /tmp/nostling-b.log
    ```

#### Expected Result

- Message is queued locally during relay outage.
- After relay recovery, the message is published and delivered.
- Both instances show reconnected relay status in the footer.

---

### T06: Relay Status Indicator

**Verifies**: Real-time relay connection status is displayed correctly.
**Source**: User story "View Real-Time Relay Status" (Epic 3).

#### Steps

1. Complete pre-test setup. Both instances should show the relay as connected.

2. **Both instances** -- Take screenshots. Verify footer shows connected relay status.

3. **Stop the relay**:
   ```bash
   docker compose -f docker-compose.e2e.yml stop nostr-relay
   ```

4. **Wait** 15 seconds for disconnection detection.

5. **Both instances** -- Take screenshots. Verify footer shows disconnected/error relay status.

6. **Restart the relay**:
   ```bash
   docker compose -f docker-compose.e2e.yml start nostr-relay
   ```

7. **Wait** 15 seconds for reconnection.

8. **Both instances** -- Take screenshots. Verify footer shows connected status again.

9. **Log check** -- Both instances should show:
   ```
   grep "connection dropped\|reconnected" /tmp/nostling-a.log
   ```
   Expected: `Relay ws://localhost:8080/: connection dropped` followed by `reconnected`.

#### Expected Result

- Footer status transitions: connected -> disconnected -> connected.
- Reconnection is automatic (no user intervention).
- Log entries confirm the full disconnect/reconnect cycle.

---

### T07: Contact Deletion Stops Message Reception

**Verifies**: After deleting a contact, messages from them are no longer stored or displayed.
**Source**: User story "View Contact Profiles" (Epic 2), contact management behavior.

#### Steps

1. Complete pre-test setup and send at least one message in each direction (T01).

2. **Instance B** -- Delete Alice as a contact:
   ```js
   await window.api.nostling.contacts.remove('<alice-contact-id-on-B>')
   ```

3. **Instance B** -- Reload UI. Verify Alice no longer appears in the contacts list.

4. **Instance A** -- Send a message to Bob:
   ```js
   await window.api.nostling.messages.send({
     identityId: '<alice-identity-id>',
     contactId: '<bob-contact-id-on-A>',
     plaintext: 'Message after contact deletion [t07]'
   })
   ```

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

2. **Instance A** -- Send 5 numbered messages in rapid succession:
   ```js
   for (let i = 1; i <= 5; i++) {
     await window.api.nostling.messages.send({
       identityId: '<alice-identity-id>',
       contactId: '<bob-contact-id-on-A>',
       plaintext: `Order test [${i} of 5]`
     });
   }
   ```

3. **Wait** 20 seconds.

4. **Instance B** -- Take screenshot. Verify the messages appear in order: [1 of 5], [2 of 5], [3 of 5], [4 of 5], [5 of 5] from top to bottom.

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

2. **Instance A** -- Send a message from Alice to Bob.

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

2. **Instance A** -- Set a private profile with distinctive fields:
   ```js
   await window.api.nostling.profiles.updatePrivate({
     identityId: '<alice-identity-id>',
     content: {
       name: 'Alice Private',
       about: 'This is private info',
       picture: 'https://example.com/alice-private.png'
     }
   })
   ```

3. **Wait** 30 seconds for NIP-59 profile broadcast.

4. **Instance B** -- Query the contact profile:
   ```js
   const profile = await window.api.nostling.profiles.getContactProfile('<alice-contact-id-on-B>');
   ```
   Verify `profile.name === 'Alice Private'`.

5. **Relay query** (verification) -- Query the relay for kind:0 events from Alice's pubkey. There should be **none** (private profiles are not published as kind:0).

6. **Instance B** -- Take screenshot showing Alice's contact with the updated profile information.

#### Expected Result

- Private profile fields are delivered to contacts via NIP-59.
- No kind:0 event for Alice exists on the relay.
- Instance B displays the private profile fields received from Alice.

---

## Automation Outlook

At a later stage, these test scenarios could be automated as Playwright e2e tests. This requires extending the current test infrastructure with:

1. **Dual-app fixture** (`e2e/dual-fixtures.ts`) -- A Playwright fixture that launches two Electron instances with isolated data directories, both pointing to the same strfry relay via `NOSTLING_DEV_RELAY`. This builds on the existing single-instance fixture in `e2e/fixtures.ts`.

2. **IPC helper layer** (`e2e/dual-helpers.ts`) -- Wrappers around `window.api.nostling.*` for creating identities, adding contacts, sending messages, and querying state. Encapsulates the `page.evaluate()` calls used throughout the manual procedures above.

3. **Wait-for-delivery helpers** -- Polling-based utilities that wait for message arrival by repeatedly checking `window.api.nostling.messages.list()` or monitoring logs, rather than relying on fixed `sleep()` calls. Message delivery depends on subscription events (real-time) and polling (10-second interval), so tests need adaptive waits.

4. **Docker compose integration** -- The existing `docker-compose.e2e.yml` already provides a strfry relay. The dual-app fixture would launch both Electron instances inside the same container, sharing the relay. No container-level changes required.

The single-instance e2e infrastructure (`e2e/fixtures.ts`, `e2e/helpers.ts`, `playwright.config.ts`) and Docker test environment (`docker-compose.e2e.yml`, `Dockerfile.e2e`) provide a solid foundation. The main new work is the dual-app fixture and IPC helpers.
