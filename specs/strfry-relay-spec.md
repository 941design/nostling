# Strfry Relay Support - Feature Request Specification

## Problem Statement

The project currently uses `scsibug/nostr-rs-relay:latest` for local testing and e2e scenarios, but that image is **amd64-only**. This blocks ARM-based development and complicates sidecar deployment on mixed CPU fleets. We need a relay option that works for both **local testing** and **sidecar deployment**, with consistent behavior across architectures.

## Goal

Add **Strfry** as a supported relay option for local dev/e2e and sidecar deployment, with a minimal configuration that is multi-arch friendly and easy to run alongside the app.

## Core Functionality

Provide an opt-in relay configuration that uses **Strfry** (Docker image), with persistent storage, clear defaults, and the ability to switch between relays without invasive code changes.

## Functional Requirements

### FR-1: Strfry Relay Image Support
- Add a Strfry relay option based on a multi-arch image (e.g., `thesamecat/strfry`).
- Must support `linux/amd64` and `linux/arm64`.
- **Acceptance**: `docker buildx imagetools inspect <image>` shows both platforms.

### FR-2: Local Testing via Docker Compose
- Add a new compose definition or profile that runs Strfry for local testing.
- Expose relay websocket on `ws://localhost:8080` (or project-standard port if different).
- Ensure local testing can switch between relays with **one env var or one compose profile**.
- **Acceptance**: `docker compose --profile relay-strfry up` starts a relay reachable at the configured WS URL.

### FR-3: Sidecar Deployment Compatibility
- Provide a minimal, production-safe Strfry config suitable for sidecar deployments.
- Support persistent storage via a mounted volume.
- Provide configurable log level and rate limits via config or env mapping.
- **Acceptance**: Sidecar can be started with a bind mount/volume and retains data across restarts.

### FR-4: Configuration Assets
- Add a Strfry configuration file under `e2e/` or `docs/` with comments explaining key settings.
- Include explicit settings for:
  - database path
  - websocket listener port
  - basic rate limits (sane defaults for dev)
- **Acceptance**: Config is checked into the repo and referenced by compose.

### FR-5: Documentation
- Update README or docs to describe:
  - how to start Strfry locally
  - how to switch between relay implementations
  - recommended usage for sidecar deployments
- **Acceptance**: New documentation exists and links to the compose profile or example.

## Non-Functional Requirements

- **Multi-arch** support is required.
- **Minimal operational complexity**: single container, no external DB service.
- **Predictable performance** for local dev and small sidecar deployments.
- **No breaking changes** to existing default dev flow unless explicitly opted in.

## Integration Points

- `docker-compose.e2e.yml` and `docker-compose.e2e-prod.yml` for relay service definition(s).
- `README.md` and/or `docs/*` for setup instructions.
- Optional: `.env` or `docker-compose.dev.yml` for toggling relay selection.

## Out of Scope

- Migrating production deployments to Strfry automatically.
- Changing application-level relay configuration format (YAML/JSON).
- Implementing custom Strfry plugins or auth.

## Risks & Mitigations

- **Behavior differences** between relays (nostr-rs-relay vs Strfry). Mitigation: keep current relay as default; treat Strfry as opt-in.
- **Port conflicts** with existing services. Mitigation: document port overrides and use compose profiles.

## Acceptance Criteria Summary

- Strfry relay can be started locally on both amd64 and arm64 using Docker Compose.
- Sidecar deployment is documented with persistent storage and a minimal config.
- Switching between relays requires only a profile or env var toggle.
- Existing workflows remain unchanged unless Strfry is explicitly selected.

---

**Note**: This is a requirements specification only. Implementation details will be handled in a follow-up task.
