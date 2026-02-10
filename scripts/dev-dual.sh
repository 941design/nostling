#!/usr/bin/env bash
#
# Launch two Nostling Electron instances with Playwright CDP debugging.
# Each instance gets its own data directory and CDP port.
#
# Usage: ./scripts/dev-dual.sh
#
# Prerequisites:
#   - npm run build (or make build) must have been run
#   - Dev relay must be running (make dev-relay-start)
#   - Linux: Xvfb, dbus, gnome-keyring must be available
#   - macOS: Electron signing certificate (optional, for stable keychain)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Instance configuration
DATA_DIR_A="/tmp/nostling-a"
DATA_DIR_B="/tmp/nostling-b"
CDP_PORT_A=9222
CDP_PORT_B=9223
DEV_RELAY="ws://localhost:8080"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Track processes to clean up
XVFB_PID=""
ELECTRON_PID_A=""
ELECTRON_PID_B=""
DBUS_PID=""
STARTED_XVFB=false

cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"

    [ -n "$ELECTRON_PID_A" ] && kill "$ELECTRON_PID_A" 2>/dev/null && echo "  Stopped instance A"
    [ -n "$ELECTRON_PID_B" ] && kill "$ELECTRON_PID_B" 2>/dev/null && echo "  Stopped instance B"

    if $STARTED_XVFB && [ -n "$XVFB_PID" ]; then
        kill "$XVFB_PID" 2>/dev/null && echo "  Stopped Xvfb"
    fi

    [ -n "$DBUS_PID" ] && kill "$DBUS_PID" 2>/dev/null

    echo -e "${GREEN}Done.${NC}"
}

trap cleanup EXIT

# --- Platform-specific display setup ---

setup_linux_display() {
    if [ -n "${DISPLAY:-}" ]; then
        echo -e "${GREEN}Display already available:${NC} $DISPLAY"
        return
    fi

    if ! command -v Xvfb >/dev/null 2>&1; then
        echo -e "${RED}Xvfb not found.${NC} Install with: sudo apt-get install xvfb"
        exit 1
    fi

    echo "Starting Xvfb on :99..."
    Xvfb :99 -screen 0 1280x720x24 &
    XVFB_PID=$!
    STARTED_XVFB=true
    export DISPLAY=:99
    sleep 1
    echo -e "${GREEN}Xvfb ready${NC} (DISPLAY=:99)"
}

setup_linux_keyring() {
    if [ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ]; then
        echo -e "${GREEN}D-Bus session already available${NC}"
        return
    fi

    if ! command -v dbus-daemon >/dev/null 2>&1; then
        echo -e "${RED}dbus not found.${NC} Install with: sudo apt-get install dbus"
        exit 1
    fi

    if ! command -v gnome-keyring-daemon >/dev/null 2>&1; then
        echo -e "${RED}gnome-keyring-daemon not found.${NC} Install with: sudo apt-get install gnome-keyring"
        exit 1
    fi

    echo "Starting D-Bus session..."
    eval "$(dbus-launch --sh-syntax)"
    DBUS_PID="$DBUS_SESSION_BUS_PID"
    export DBUS_SESSION_BUS_ADDRESS

    echo "Unlocking gnome-keyring..."
    echo "" | gnome-keyring-daemon --start --unlock --components=secrets >/dev/null 2>&1
    echo -e "${GREEN}Keyring ready${NC}"
}

sign_macos_electron() {
    local electron_path="$PROJECT_DIR/node_modules/electron/dist/Electron.app"
    if [ ! -d "$electron_path" ]; then
        return
    fi
    if security find-certificate -c "Nostling Dev Signing" >/dev/null 2>&1; then
        echo "Signing Electron.app..."
        codesign --force --deep --sign "Nostling Dev Signing" "$electron_path"
        echo -e "${GREEN}Electron signed${NC}"
    else
        echo -e "${YELLOW}No signing certificate found — keychain access may be unstable${NC}"
    fi
}

# --- Build check ---

check_build() {
    if [ ! -f "$PROJECT_DIR/dist/main/index.js" ]; then
        echo -e "${RED}Build not found.${NC} Run 'make build' first."
        exit 1
    fi
}

# --- Launch instances ---

launch_instance() {
    local label="$1"
    local data_dir="$2"
    local cdp_port="$3"

    mkdir -p "$data_dir"

    local args=()

    if [ "$(uname)" = "Linux" ]; then
        args+=(
            --no-sandbox
            --disable-gpu
            --disable-dev-shm-usage
            --password-store=gnome-libsecret
        )
    fi

    args+=(
        --remote-debugging-port="$cdp_port"
        "$PROJECT_DIR/dist/main/index.js"
    )

    NOSTLING_DATA_DIR="$data_dir" \
    NOSTLING_DEV_RELAY="$DEV_RELAY" \
    NODE_ENV=test \
    ELECTRON_DISABLE_SECURITY_WARNINGS=true \
    npx electron "${args[@]}" \
        >> "$data_dir.log" 2>&1 &

    local pid=$!
    echo -e "  ${GREEN}${label}${NC}: CDP http://127.0.0.1:${cdp_port}  data ${data_dir}  (pid ${pid})"
    echo "$pid"
}

print_mcp_snippet() {
    echo ""
    echo -e "${CYAN}Add to .mcp.json for Playwright MCP access:${NC}"
    echo ""
    cat <<'EOF'
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
EOF
    echo ""
}

# --- Main ---

main() {
    echo "================================"
    echo "  Nostling Dual Instance Launcher"
    echo "================================"
    echo ""

    check_build

    # Platform setup
    case "$(uname)" in
        Linux)
            setup_linux_display
            setup_linux_keyring
            ;;
        Darwin)
            sign_macos_electron
            ;;
    esac

    echo ""
    echo -e "${YELLOW}Launching instances...${NC}"

    ELECTRON_PID_A=$(launch_instance "Instance A" "$DATA_DIR_A" "$CDP_PORT_A")
    ELECTRON_PID_B=$(launch_instance "Instance B" "$DATA_DIR_B" "$CDP_PORT_B")

    # Wait for CDP to become available
    echo ""
    echo "Waiting for CDP endpoints..."
    for port in $CDP_PORT_A $CDP_PORT_B; do
        for _ in $(seq 1 30); do
            if curl -s "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1; then
                echo -e "  ${GREEN}Port ${port} ready${NC}"
                break
            fi
            sleep 0.5
        done
    done

    print_mcp_snippet

    echo -e "${GREEN}Both instances running.${NC} Press Ctrl+C to stop."
    echo "Logs: $DATA_DIR_A.log and $DATA_DIR_B.log"
    echo ""

    # Wait for either instance to exit
    wait -n "$ELECTRON_PID_A" "$ELECTRON_PID_B" 2>/dev/null || true
}

main "$@"
