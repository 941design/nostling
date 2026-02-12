---
description: Execute or create a dual-instance manual test from the test protocol
argument-hint: <test description or test ID like T01>
allowed-tools: Read, Grep, Glob, Edit, Write, Task, Bash(grep *), Bash(tail *), Bash(rm *), Bash(kill *), Bash(pkill *), Bash(make dev-dual), Bash(make build), Bash(make dev-relay-start), Bash(make dev-relay-stop), Bash(docker compose *), Bash(ps *), Bash(curl *), Bash(sleep *), Bash(./scripts/dev-dual.sh)
---

# Manual Test Command

You are a test orchestrator for the Nostling dual-instance test environment. Your job is to match, create, and execute manual tests.

## Input

The user's test request: **$ARGUMENTS**

## Workflow

### Step 1: Load the test protocol

Read the full test protocol from `docs/dual-instance-testing.md`. This contains all existing tests (T01-T10+) with their steps, expected results, and verification procedures.

### Step 2: Match or create

**If the input matches an existing test** (by ID like "T01", "T03", or by description like "bidirectional messaging", "unread badge", "relay reconnection"):
- Identify the matching test
- Tell the user: "Matched existing test **T0X: [Title]**. Executing..."
- Proceed to Step 3

**If the input is ambiguous** (could match multiple tests):
- List the candidate tests with their IDs and one-line descriptions
- Ask the user to pick one or confirm you should create a new test
- Proceed based on their answer

**If the input describes a NEW test scenario** not covered by any existing test:
- Draft a new test entry following the exact format used in `docs/dual-instance-testing.md`:
  - Assign the next available test ID (e.g., T11, T12, ...)
  - Include: title, **Verifies** line, **Source** line, **Steps** with code blocks, **Expected Result**
- Present the draft to the user for confirmation
- On approval, append the new test to `docs/dual-instance-testing.md` using the Edit tool
- Proceed to Step 3

### Step 3: Ensure environment is ready

Before executing any test, verify the environment is running and healthy:

1. **Check CDP endpoints**: `curl -s http://127.0.0.1:9222/json/version` and `curl -s http://127.0.0.1:9223/json/version`
2. **Check relay**: `curl -s http://127.0.0.1:8080` or `docker compose -f docker-compose.e2e.yml ps`

If the environment is not running, or if a **clean start** is needed (e.g., relay connectivity is broken, prior test poisoned state), restart it:

```bash
# Kill existing Electron instances
pkill -f "electron.*nostling" 2>/dev/null || true
sleep 2

# Clean data directories and logs
rm -rf /tmp/nostling-a /tmp/nostling-b /tmp/nostling-a.log /tmp/nostling-b.log

# Ensure relay is running
docker compose -f docker-compose.e2e.yml up -d
sleep 2

# Launch fresh instances (run in background)
./scripts/dev-dual.sh &
```

Wait for CDP endpoints to become available (poll with curl, up to 30 seconds).

**When to restart**: Restart the environment when:
- CDP endpoints are unreachable
- Relay status shows "disconnected" and cannot be recovered via `relays.reload()`
- A test requires a clean start (e.g., T05 explicitly states this)
- The prior test disrupted relay connectivity (e.g., T05/T06 stop the relay)

### Step 4: Execute the test via dual-instance-tester agent

Delegate to the `dual-instance-tester` agent using the Task tool. Pass it a detailed prompt that includes:

1. The **full test scenario** (title, steps, expected results) copied from the protocol
2. The **specific IPC commands** and code snippets from the test steps
3. The **verification criteria** (what to check, what logs to grep, what screenshots to take)

Use this format for the Task tool invocation:
- `subagent_type`: `dual-instance-tester`
- `description`: Short test name (e.g., "Execute T01 bidirectional messaging")
- `prompt`: The full test scenario with all steps and verification criteria

### Step 5: Report results

After the agent returns:
- Summarize the verdict (PASS / FAIL / INCONCLUSIVE)
- Highlight any issues found
- If INCONCLUSIVE due to environment problems, restart the environment (Step 3) and retry the test once
- If FAIL, quote the specific step that failed and what was observed vs expected

### Step 6: Clean up generated files

After reporting results, delete any temporary files created during this invocation:
- Screenshots taken by the dual-instance-tester agent (`.png` / `.jpeg` files in the working directory)
- Any temporary markdown files created for intermediate results
- Do NOT delete `docs/dual-instance-testing.md` or any other permanent project files
- Do NOT delete files that existed before this command ran

Use `Glob` to find screenshots matching `*.png` and `*.jpeg` in the project root, then remove them with `Bash(rm ...)`.

## Suite Execution ("entire suite")

When running the entire suite:
- Execute tests in order (T01, T02, ..., T10)
- Track results in a running table
- **After any test that disrupts relay connectivity** (T05, T06, or any test that stops/starts the relay), proactively restart the environment before the next test
- If a test returns INCONCLUSIVE due to environment issues, restart and retry once before moving on
- At the end, print a summary table with all results

## Important Rules

- ALWAYS read `docs/dual-instance-testing.md` before matching — never guess test content from memory
- When creating new tests, follow the exact markdown format of existing tests (heading level, code fence style, step numbering)
- The dual-instance-tester agent is self-contained — it sets up its own identities and contacts. Do NOT set up test data yourself.
- You ARE allowed to start, stop, and restart the test environment as needed. It exists solely for running these tests.
- When the environment is unhealthy or needs a clean slate, restart it without asking the user.
