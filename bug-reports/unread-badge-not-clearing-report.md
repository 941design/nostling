# Unread Badge Not Clearing on Conversation Open - Bug Report

## Bug Description

When messages arrive while no conversation is selected, the unread badge correctly displays the count. However, clicking the contact to open the conversation does not reliably clear the badge. Messages remain `isRead: false` and the badge persists even while the conversation is actively displayed.

## Expected Behavior

When a user clicks a contact with unread messages:
1. The conversation opens showing the messages
2. `markMessagesRead` fires and updates `is_read = 1` for all incoming messages in that conversation
3. The unread badge disappears from the contact's sidebar entry
4. The local `unreadCounts` state is updated to reflect 0 unread

Additionally, messages arriving while a conversation is already open should be automatically marked as read.

## Reproduction Steps

1. Start two instances with `make dev-dual` (Alice on A, Bob on B, mutual contacts)
2. On Instance B, ensure no contact is selected (reload the page — `selectedContactId` initializes to `null`)
3. From Instance A, send 3 messages to Bob:
   ```js
   const ids = await window.api.nostling.identities.list();
   const contacts = await window.api.nostling.contacts.list(ids[0].id);
   for (let i = 1; i <= 3; i++) {
     await window.api.nostling.messages.send({
       identityId: ids[0].id, contactId: contacts[0].id,
       plaintext: `Unread test [msg-${i}]`
     });
     await new Promise(r => setTimeout(r, 500));
   }
   ```
4. Wait 15 seconds for delivery
5. On Instance B, verify the badge shows "3" next to Alice's contact
6. Click Alice's contact entry in the sidebar (`[data-testid="contact-item-{contactId}"]`)
7. **Observe**: Badge remains showing "3"; programmatic check confirms `isRead: false` on all 3 messages

## Actual Behavior

The unread badge persists after opening the conversation. All messages remain `isRead: false` in the database.

## Root Cause Analysis

The `markMessagesRead` mechanism exists and is architecturally correct:

- **Backend**: `service.ts:561-571` — `markMessagesRead()` runs `UPDATE nostr_messages SET is_read = 1 WHERE ...`
- **Renderer state**: `state.ts:474-514` — `markMessagesRead()` calls IPC, updates `unreadCounts`, clears `newlyArrived`
- **Trigger**: `main.tsx:2414-2419` — `onSelectContact` callback calls `markMessagesRead`

Two potential failure modes:

1. **Click not reaching the React handler**: The clickable element is `SidebarUserItem` with `data-testid="contact-item-{id}"` (`SidebarUserItem.tsx:105`). If the click target doesn't match (e.g., programmatic clicks on wrong selector or child elements that don't bubble), `onSelectContact` never fires.

2. **No auto-mark for messages arriving while conversation is open**: `markMessagesRead` only fires on contact *selection change* (`onSelectContact`). There is no `useEffect` or subscription that marks new incoming messages as read when the conversation is already open. If the contact is already selected when messages arrive, they remain unread.

## Impact

- Severity: **High** — core messaging UX
- Users see persistent unread badges even after reading messages
- Unread counts accumulate incorrectly over time

## Relevant Code

| File | Lines | Purpose |
|------|-------|---------|
| `src/main/nostling/service.ts` | 561-571 | `markMessagesRead()` SQL update |
| `src/renderer/nostling/state.ts` | 474-514 | `markMessagesRead()` state management |
| `src/renderer/main.tsx` | 2414-2419 | `onSelectContact` trigger |
| `src/renderer/main.tsx` | 807 | Contact item click handler |
| `src/renderer/components/SidebarUserItem.tsx` | 105 | `data-testid="contact-item-{id}"` |

## Suggested Fix

1. Add a `useEffect` that auto-marks messages as read when new messages arrive in the currently selected conversation:
   ```typescript
   useEffect(() => {
     if (selectedIdentityId && selectedContactId && unreadCounts[selectedIdentityId]?.[selectedContactId] > 0) {
       void nostling.markMessagesRead(selectedIdentityId, selectedContactId);
     }
   }, [selectedIdentityId, selectedContactId, unreadCounts]);
   ```

2. Verify the `onSelectContact` click handler fires reliably for all click targets within the sidebar item.
