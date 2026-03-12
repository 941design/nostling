---
epic: nip47-lightning-integration
created: 2026-03-12T00:00:00Z
status: planned
priority: medium
---

# Lightning Integration via Nostr Wallet Connect (NIP-47)

## Problem Statement

Nostling displays the Lightning Address (lud16) field in profiles but provides no way to interact with it. The Nostr ecosystem has deep Bitcoin/Lightning integration — Zaps (Lightning tips via Nostr events) are culturally embedded and technically mature. NIP-47 (Nostr Wallet Connect) enables any Nostr client to interact with a user's Lightning wallet without implementing Lightning protocol directly.

Adding NWC support enables users to send Lightning tips to contacts directly from the conversation, creating a unique value proposition: private messaging with integrated private payments.

## Core Functionality

Connect to a user's Lightning wallet via NIP-47 (Nostr Wallet Connect) and enable sending Lightning payments (Zaps) to contacts who have a Lightning Address configured in their profile. Wallet connection is initiated by the user via a connection URI; Nostling never holds or manages funds.

## Terminology

- **NWC**: Nostr Wallet Connect (NIP-47) — a protocol for controlling a Lightning wallet via Nostr events
- **Zap**: A Lightning payment initiated via a Nostr event (NIP-57), visible in the conversation
- **Connection URI**: A `nostr+walletconnect://` URI that authorizes Nostling to send payment commands to the wallet
- **LUD-16**: Lightning Address format (user@domain.com) used to look up payment endpoints

## Functional Requirements

### FR-1: Wallet Connection

- Per-identity wallet connection via NWC connection URI
- Configuration in identity settings: paste a `nostr+walletconnect://` URI
- Connection status indicator: connected, disconnected, error
- Wallet information display: alias, balance (if the wallet exposes it)
- Disconnect option to revoke the connection

### FR-2: Sending a Zap

- "Zap" button accessible on message hover or contact profile view
- Click opens a compact payment dialog:
  - Recipient: contact's display name and Lightning Address
  - Amount: preset buttons (21, 100, 500, 1000 sats) and custom amount input
  - Optional: comment (public Zap note, or private — encrypted in the Zap event)
  - Send button
- Payment executed via NWC: Nostling sends a `pay_invoice` command to the connected wallet
- Success: display a Zap indicator on the message or in the conversation
- Failure: display error message (e.g., "Insufficient balance", "Payment route not found")

### FR-3: Zap Display

- Zaps sent in a conversation appear as special message events with Lightning bolt icon
- Display: amount (sats), sender, optional comment
- Zap events are standard NIP-57 events wrapped in NIP-17/59 for privacy
- Incoming Zaps from contacts displayed similarly

### FR-4: Lightning Address Resolution

- Resolve LUD-16 addresses to LNURL payment endpoints
- Cache resolved endpoints (LNURL-pay metadata) for 1 hour
- Handle resolution failures gracefully (show "Lightning Address unreachable")

### FR-5: Privacy Considerations

- NWC communication happens over Nostr relays (encrypted between client and wallet)
- Zap events inside NIP-17/59 envelopes hide payment metadata from relays
- The NWC connection URI is stored in OS keychain (same security as identity private keys)
- Public Zaps (Zap receipts visible on relays) are opt-in; default is private Zaps

## Non-Functional Requirements

- Nostling NEVER holds funds, manages channels, or implements Lightning protocol directly
- All payment operations delegate to the connected wallet via NWC
- Payment latency dependent on Lightning network (typically under 5 seconds)
- NWC connection URI treated as a secret (stored in OS keychain, never logged)

## Acceptance Criteria

- User can connect a Lightning wallet via NWC connection URI
- User can send a Zap to a contact with a Lightning Address
- Zap appears in the conversation for both sender and recipient
- Payment failure shows a clear error message
- Disconnecting the wallet disables Zap functionality
- NWC connection URI stored securely (OS keychain)
- No payment possible without explicit user action (no automatic payments)
