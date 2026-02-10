# Dual-Instance Playwright Debugging Setup

Run two Nostling instances and control each via Playwright MCP.

## Quick Start

```bash
make dev-dual
```

This builds the app, starts the local strfry relay, sets up display/keyring (Linux), launches two Electron instances with CDP debugging, and prints the MCP config snippet to add to your `.mcp.json`.

| Instance | CDP Port | Data Directory |
|----------|----------|----------------|
| A | 9222 | `/tmp/nostling-a` |
| B | 9223 | `/tmp/nostling-b` |

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

## Known Issues

1. **Accessibility snapshots unreliable with Chakra UI** — Playwright MCP's `browser_snapshot` frequently returns empty YAML after re-renders. Use `browser_take_screenshot` or `browser_evaluate` as fallbacks.

2. **RelayTable UI blocks `ws://` URLs** — The relay configuration UI validates that URLs start with `wss://`, so `ws://localhost:8080` cannot be added through the UI. Use `NOSTLING_DEV_RELAY` env var instead.

3. **NIP-17 timestamp lookback bug** — The subscription's 24-hour `since` window is too narrow for NIP-17 gift wraps with ±2-day randomized timestamps. See `specs/bug-nip17-timestamp-lookback.md`.
