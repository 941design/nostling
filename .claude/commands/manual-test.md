---
description: Execute or create a dual-instance manual test from the test protocol
argument-hint: <test description or test ID like T01>
allowed-tools: Read, Grep, Glob, Edit, Write, Task, Bash(grep *), Bash(tail *), Bash(make dev-dual), Bash(docker compose *), Bash(ps *), Bash(curl *)
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

### Step 3: Execute the test via dual-instance-tester agent

Delegate to the `dual-instance-tester` agent using the Task tool. Pass it a detailed prompt that includes:

1. The **full test scenario** (title, steps, expected results) copied from the protocol
2. The **specific IPC commands** and code snippets from the test steps
3. The **verification criteria** (what to check, what logs to grep, what screenshots to take)

Use this format for the Task tool invocation:
- `subagent_type`: `dual-instance-tester`
- `description`: Short test name (e.g., "Execute T01 bidirectional messaging")
- `prompt`: The full test scenario with all steps and verification criteria

### Step 4: Report results

After the agent returns:
- Summarize the verdict (PASS / FAIL / INCONCLUSIVE)
- Highlight any issues found
- If INCONCLUSIVE due to environment problems, provide actionable fix instructions (check the agent's output for diagnostics)
- If FAIL, quote the specific step that failed and what was observed vs expected

### Step 5: Clean up generated files

After reporting results, delete any temporary files created during this invocation:
- Screenshots taken by the dual-instance-tester agent (`.png` / `.jpeg` files in the working directory)
- Any temporary markdown files created for intermediate results
- Do NOT delete `docs/dual-instance-testing.md` or any other permanent project files
- Do NOT delete files that existed before this command ran

Use `Glob` to find screenshots matching `*.png` and `*.jpeg` in the project root, then remove them with `Bash(rm ...)`.

## Important Rules

- ALWAYS read `docs/dual-instance-testing.md` before matching — never guess test content from memory
- When creating new tests, follow the exact markdown format of existing tests (heading level, code fence style, step numbering)
- The dual-instance-tester agent is self-contained — it sets up its own identities and contacts. Do NOT set up test data yourself.
- If the environment is not running, tell the user to run `make dev-dual` and wait for it to be ready before re-invoking
- Do NOT run `make dev-dual` yourself — it's a long-running foreground process the user manages
