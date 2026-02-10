- When running playwright e2e tests use `npm run test:e2e:docker` in order to not interfere with the desktop system.
- Cleanup temporary files after implementation. that accounts for markdown files, as well as temporary backups of code.
- Do NOT create markdown documents for results unless absolutely necessary (e.g. for resuming a task) or when asked to.
- ALL implementation guides you create MUST be optimized for/addressed at AI coding agents.
- When asked for an opinion, always provide a critical, balanced assessment looking at both pros and cons.
- Never rewrite git history.
- NEVER tailor production code towards tests. Production code MUST NOT contain adaptations, or tweaks that are necessary only to satisfy the test environment.
- All behavioral changes MUST be verified before and after in the UI using the dual-instance test environment. Use Playwright MCP to instrument both instances — take screenshots, evaluate state via IPC, and confirm the change is visible to both sender and receiver.

## Dual-Instance Test Environment

For verifying messaging behavior, relay connectivity, and UI changes, use two separate Nostling instances connected to the same local relay.

### Setup

```bash
make dev-dual
```

This starts a strfry relay on `ws://localhost:8080`, launches two Electron instances (CDP ports 9222 and 9223, data dirs `/tmp/nostling-a` and `/tmp/nostling-b`), and prints the Playwright MCP config snippet to add to `.mcp.json`. On Linux it also handles Xvfb, dbus, and gnome-keyring. See `docs/dual-instance-playwright-setup.md` for manual setup and details.

### Test Protocol

1. Create identities on each instance (or reuse existing ones in `/tmp/nostling-a` and `/tmp/nostling-b`)
2. Add mutual contacts by exchanging npubs
3. Send a message from instance A and verify delivery on instance B (screenshot + logs)
4. Send a message from instance B and verify delivery on instance A
5. Check logs at `/tmp/nostling-a.log` and `/tmp/nostling-b.log` for `Publish complete` and `Received NIP-17 DM` entries
6. If a message doesn't arrive, query the relay directly to confirm the event exists and check `created_at` against the subscription's `since` window

### MCP Access

- `playwright-a` controls instance A (CDP `http://127.0.0.1:9222`)
- `playwright-b` controls instance B (CDP `http://127.0.0.1:9223`)
- Use `browser_take_screenshot` or `browser_evaluate` for verification — `browser_snapshot` is unreliable with Chakra UI

## Documentation Guidelines

**specs/spec.md** — Software specification for agents
- High-level requirements, architecture, behavior, and acceptance criteria
- No concrete implementation advice unless there's a compelling functional/non-functional reason
- Avoid specific file paths, code snippets, or configuration JSON
- Focus on *what* and *why*, not *how*

**README.md** — For human readers
- Usage, installation, development workflow, and maintenance
- No implementation details; link to `docs/` for in-depth topics
- Keep command examples practical and copy-pasteable

**docs/** — Detailed guides
- Step-by-step procedures (e.g., RSA key setup, dev mode testing)
- Implementation-level documentation when depth is needed
- Technical architecture details (`docs/architecture.md`)
