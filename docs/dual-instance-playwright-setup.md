# Dual-Instance Playwright Debugging Setup

Run two Nostling instances and control each via Playwright MCP.

## Quick Start

```bash
make dev-dual
```

This builds the app, starts the local strfry relay and Blossom server, sets up display/keyring (Linux), launches two Electron instances with CDP debugging, and prints the MCP config snippet to add to your `.mcp.json`.

| Component | Port/Location | Purpose |
|-----------|---------------|---------|
| Instance A | CDP: 9222 | First Nostling instance |
| Instance B | CDP: 9223 | Second Nostling instance |
| Strfry Relay | ws://localhost:8080 | Local Nostr relay |
| Blossom Server | http://localhost:3001 | Media upload server |
| Data A | `/tmp/nostling-a` | Instance A storage |
| Data B | `/tmp/nostling-b` | Instance B storage |

## Test Design Principles

All test procedures execute user-facing actions exclusively through Playwright UI interactions — clicking buttons, typing text, dragging files — never through `window.api.*` IPC calls. This ensures the protocol validates the complete stack from renderer components through IPC to main process services. A test that bypasses the UI (e.g., calling `blobStorage.storeBlob()` and `messages.send()` directly) can pass while the actual user-facing flow is broken, because it skips the renderer integration layer entirely.

**Exceptions:**
- **Infrastructure operations** (relay stop/start, environment setup) use shell commands — these are not user actions
- **State verification** uses screenshots, log file checks, or `browser_evaluate` to read displayed values
- **Data transfer between instances** (e.g., reading a displayed npub to paste as a contact on the other instance) uses `browser_evaluate` to extract text from DOM elements

See `docs/dual-instance-testing.md` for the test procedures that follow these principles.

## Prerequisites

### All platforms

- Docker (for the strfry relay)
- Node.js / npm

### Linux only

| Dependency | Install |
|---|---|
| Xvfb | `sudo apt-get install xvfb` |
| dbus | `sudo apt-get install dbus` |
| gnome-keyring | `sudo apt-get install gnome-keyring` |

These are needed because Electron requires a display server and a keyring daemon for its `safeStorage` API. The `dev-dual` script starts them automatically if they aren't already running.

### macOS

No extra dependencies. If a "Nostling Dev Signing" certificate is present in the keychain, the script signs the Electron binary for stable keychain access (see `docs/development.md`).

## MCP Configuration

After `make dev-dual` starts, it prints a JSON snippet. Add it to your `.mcp.json`:

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

`.mcp.json` is gitignored — it contains per-user paths and session-specific entries.

## Manual Setup

If you need to run the steps individually (e.g. for custom configuration):

### 1. Virtual Display (Linux only)

```bash
Xvfb :99 -screen 0 1280x720x24 &
export DISPLAY=:99
```

### 2. D-Bus Session + Keyring (Linux only)

```bash
eval $(dbus-launch --sh-syntax)
echo "" | gnome-keyring-daemon --start --unlock --components=secrets
```

### 3. Local Relay

```bash
make dev-relay-start
```

### 4. Build

```bash
make build
```

### 5. Launch Instances

```bash
NOSTLING_DATA_DIR=/tmp/nostling-a \
NOSTLING_DEV_RELAY=ws://localhost:8080 \
NODE_ENV=test \
ELECTRON_DISABLE_SECURITY_WARNINGS=true \
npx electron \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --password-store=gnome-libsecret \
  --remote-debugging-port=9222 \
  dist/main/index.js &
```

Repeat with `/tmp/nostling-b` and port `9223` for the second instance.

## Key Flags

| Flag / Env Var | Why |
|---|---|
| `NOSTLING_DATA_DIR` | Isolates identities, databases, and config per instance |
| `NOSTLING_DEV_RELAY` | Forces the app to use only the specified relay, bypassing production relay list |
| `NODE_ENV=test` | Enables test-mode behaviors |
| `--remote-debugging-port` | Exposes Chrome DevTools Protocol for Playwright to attach to |
| `--no-sandbox` | Required for running as root or in containers (Linux) |
| `--password-store=gnome-libsecret` | Tells Electron to use gnome-keyring for safeStorage (Linux) |
| `--disable-gpu` | Avoids GPU issues in virtual framebuffer (Linux) |
| `--disable-dev-shm-usage` | Prevents shared memory issues in constrained environments (Linux) |

## Troubleshooting

### gnome-keyring not unlocked (`SECURE_STORAGE_UNAVAILABLE`)

Identity creation fails with `SECURE_STORAGE_UNAVAILABLE` when gnome-keyring exists but isn't properly unlocked. The `dev-dual.sh` script skips keyring setup when `DBUS_SESSION_BUS_ADDRESS` is already set, but an existing D-Bus session doesn't guarantee the keyring is unlocked.

Fix: kill all keyring processes and restart fresh:

```bash
pkill gnome-keyring-daemon
echo "" | gnome-keyring-daemon -r -d --unlock --components=secrets
```

Then relaunch the instances.

### Docker compose starts the e2e test container

Running `docker compose -f docker-compose.e2e.yml up -d` starts all services including `nostling-e2e-test`, which runs its own Electron processes and interferes with the dual-instance setup. Stop it explicitly:

```bash
docker stop nostling-e2e-test
```

Or start only the needed services:

```bash
docker compose -f docker-compose.e2e.yml up -d nostr-relay blossom-server
```

### Playwright MCP contexts go stale after instance restart

After killing and relaunching Electron instances, the Playwright MCP servers hold dead browser contexts. All tool calls fail with `Target page, context or browser has been closed`. Call `browser_close` on both MCP servers to force reconnection:

```
playwright-a: browser_close
playwright-b: browser_close
```

The next tool call will automatically reconnect to the new CDP endpoint.

## Known Issues

1. **Accessibility snapshots unreliable with Chakra UI** — Playwright MCP's `browser_snapshot` frequently returns empty YAML after re-renders. Use `browser_take_screenshot` or `browser_evaluate` as fallbacks.

2. **RelayTable UI blocks `ws://` URLs** — The relay configuration UI validates that URLs start with `wss://`, so `ws://localhost:8080` cannot be added through the UI. Use `NOSTLING_DEV_RELAY` env var instead.

3. **NIP-17 timestamp lookback bug** — Fixed. The subscription now uses a 3-day lookback window for kind 1059 events (2-day randomization + 1-day safety margin). See `specs/epic-nip17-timestamp-lookback/spec.md`.
