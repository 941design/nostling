#!/usr/bin/env bash
#
# Run E2E tests in parallel Docker containers with a shared relay.
# Usage: ./scripts/run-e2e-parallel.sh [MAX_PARALLEL]
#
# MAX_PARALLEL defaults to 8. All test containers connect to a single
# relay instance and results are aggregated at the end.

set -euo pipefail

MAX_PARALLEL="${1:-12}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
NETWORK_NAME="nostling-e2e-network"
RELAY_CONTAINER="nostling-e2e-parallel-relay"
IMAGE_NAME="nostling-e2e-test"
RESULTS_DIR="$PROJECT_DIR/test-results"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track running jobs: "pid:test_file" entries
RUNNING_JOBS=""
PASSED=""
FAILED=""

cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"

    # Kill any remaining background jobs
    jobs -p | xargs -r kill 2>/dev/null || true

    # Remove test containers
    docker ps -aq --filter "name=nostling-e2e-test-" 2>/dev/null | xargs -r docker rm -f 2>/dev/null || true

    # Stop relay
    docker stop "$RELAY_CONTAINER" 2>/dev/null || true
    docker rm "$RELAY_CONTAINER" 2>/dev/null || true

    # Remove network
    docker network rm "$NETWORK_NAME" 2>/dev/null || true
}

trap cleanup EXIT

start_relay() {
    echo -e "${YELLOW}Starting shared relay...${NC}"

    # Clean up any leftover relay from previous runs
    docker stop "$RELAY_CONTAINER" 2>/dev/null || true
    docker rm "$RELAY_CONTAINER" 2>/dev/null || true

    # Create network if it doesn't exist
    docker network create "$NETWORK_NAME" 2>/dev/null || true

    # Start relay
    docker run -d \
        --name "$RELAY_CONTAINER" \
        --network "$NETWORK_NAME" \
        -e RUST_LOG="${RELAY_LOG_LEVEL:-warn}" \
        -v "$PROJECT_DIR/e2e/relay-config.toml:/usr/src/app/config.toml:ro" \
        scsibug/nostr-rs-relay:latest

    # Wait for relay to be ready (check container is running and responsive)
    echo "Waiting for relay to be ready..."
    for _ in $(seq 1 30); do
        if docker inspect -f '{{.State.Running}}' "$RELAY_CONTAINER" 2>/dev/null | grep -q "true"; then
            # Container running, give it a moment to initialize
            sleep 1
            echo -e "${GREEN}Relay ready${NC}"
            return 0
        fi
        sleep 1
    done

    echo -e "${RED}Relay failed to start${NC}"
    return 1
}

build_image() {
    echo -e "${YELLOW}Building test image...${NC}"
    docker build -t "$IMAGE_NAME" -f "$PROJECT_DIR/Dockerfile.e2e" "$PROJECT_DIR"
}

run_test() {
    local test_file="$1"
    local test_name
    test_name=$(basename "$test_file" .spec.ts)
    local container_name="nostling-e2e-test-$test_name"
    local result_dir="$RESULTS_DIR/$test_name"

    mkdir -p "$result_dir"

    docker run --rm \
        --name "$container_name" \
        --network "$NETWORK_NAME" \
        --shm-size=2gb \
        -e CI=true \
        -e NODE_ENV=test \
        -e FORCE_COLOR=1 \
        -e NOSTLING_DATA_DIR=/tmp/nostling-e2e-data \
        -e NOSTLING_DEV_RELAY=ws://$RELAY_CONTAINER:8080 \
        -e NOSTLING_SHOW_MESSAGE_INFO=true \
        -e NOSTLING_SHOW_WARNING_ICON=true \
        -e TEST_FILE="$test_file" \
        -v "$result_dir:/app/test-results" \
        "$IMAGE_NAME" \
        > "$result_dir/output.log" 2>&1

    return $?
}

collect_finished() {
    local new_running=""

    for entry in $RUNNING_JOBS; do
        local pid="${entry%%:*}"
        local file="${entry#*:}"

        if kill -0 "$pid" 2>/dev/null; then
            new_running="$new_running $entry"
        else
            # Job finished, collect result
            local status=0
            wait "$pid" || status=$?
            local name
            name=$(basename "$file" .spec.ts)

            if [ "$status" -eq 0 ]; then
                echo -e "${GREEN}✓ PASSED:${NC} $name"
                PASSED="$PASSED $name"
            else
                echo -e "${RED}✗ FAILED:${NC} $name (exit code: $status)"
                FAILED="$FAILED $name"
            fi
        fi
    done

    RUNNING_JOBS="$new_running"
}

count_running() {
    local count=0
    for entry in $RUNNING_JOBS; do
        count=$((count + 1))
    done
    echo "$count"
}

wait_for_slot() {
    while true; do
        collect_finished
        local running
        running=$(count_running)
        if [ "$running" -lt "$MAX_PARALLEL" ]; then
            break
        fi
        sleep 0.5
    done
}

wait_for_all() {
    while true; do
        collect_finished
        local running
        running=$(count_running)
        if [ "$running" -eq 0 ]; then
            break
        fi
        sleep 0.5
    done
}

print_summary() {
    echo ""
    echo "================================"
    echo "        TEST SUMMARY"
    echo "================================"
    echo ""

    local pass_count=0
    local fail_count=0

    if [ -n "$PASSED" ]; then
        for name in $PASSED; do
            pass_count=$((pass_count + 1))
        done
        echo -e "${GREEN}Passed ($pass_count):${NC}"
        for name in $PASSED; do
            echo "  ✓ $name"
        done
        echo ""
    fi

    if [ -n "$FAILED" ]; then
        for name in $FAILED; do
            fail_count=$((fail_count + 1))
        done
        echo -e "${RED}Failed ($fail_count):${NC}"
        for name in $FAILED; do
            echo "  ✗ $name"
            echo "    Log: $RESULTS_DIR/$name/output.log"
        done
        echo ""
    fi

    local total=$((pass_count + fail_count))
    echo "--------------------------------"
    echo -e "Total: $total | ${GREEN}Passed: $pass_count${NC} | ${RED}Failed: $fail_count${NC}"
    echo "================================"
}

main() {
    echo "================================"
    echo "  Parallel E2E Test Runner"
    echo "  Max concurrent: $MAX_PARALLEL"
    echo "================================"
    echo ""

    # Collect test files
    local test_files=""
    local file_count=0
    for f in "$PROJECT_DIR"/e2e/*.spec.ts; do
        if [ -f "$f" ]; then
            test_files="$test_files $f"
            file_count=$((file_count + 1))
        fi
    done

    echo "Found $file_count test files"
    echo ""

    build_image
    start_relay

    echo ""
    echo -e "${YELLOW}Running tests...${NC}"
    echo ""

    # Launch tests with concurrency limit
    for test_file in $test_files; do
        wait_for_slot

        local relative_path="e2e/$(basename "$test_file")"
        local name
        name=$(basename "$test_file" .spec.ts)
        echo "Starting: $name"

        run_test "$relative_path" &
        local pid=$!
        RUNNING_JOBS="$RUNNING_JOBS $pid:$test_file"
    done

    # Wait for remaining tests
    wait_for_all

    print_summary

    # Exit with failure if any tests failed
    [ -z "$FAILED" ]
}

main "$@"
