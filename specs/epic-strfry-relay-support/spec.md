---
epic: strfry-relay-support
created: 2026-02-08T12:15:00Z
status: initializing
---

# Strfry Relay Support - Feature Request Specification

## Clarifications (from user)
- **Migration Strategy**: Hard migration from nostr-rs-relay to Strfry (no backward compatibility needed)
- **Port Configuration**: Same port (8080) - mutually exclusive relay deployments
- **Parity Testing**: Not required (full replacement, not opt-in alternative)
- **Persistence Verification**: Published NIP-01 event must remain queryable after container restart
- **Config Location**: Project root (`strfry.conf`)
- **Sidecar Platform**: Docker Compose

## Problem Statement

The project currently uses `scsibug/nostr-rs-relay:latest` for local testing and e2e scenarios, but that image is **amd64-only**. This blocks ARM-based development and complicates sidecar deployment on mixed CPU fleets. We need a relay option that works for both **local testing** and **sidecar deployment**, with consistent behavior across architectures.

## Goal

Add **Strfry** as a supported relay option for local dev/e2e and sidecar deployment, with a minimal configuration that is multi-arch friendly and easy to run alongside the app.

## Core Functionality

**Replace** nostr-rs-relay with **Strfry** (Docker image) for local dev/e2e and sidecar deployment, with persistent storage and clear defaults. This is a hard migration with no backward compatibility.

## Functional Requirements

### FR-1: Strfry Relay Image Support
- Add a Strfry relay option based on a multi-arch image (e.g., `thesamecat/strfry`).
- Must support `linux/amd64` and `linux/arm64`.
- **Acceptance**: `docker buildx imagetools inspect <image>` shows both platforms.

### FR-2: Local Testing via Docker Compose
- Replace nostr-rs-relay with Strfry in compose definitions.
- Expose relay websocket on `ws://localhost:8080` (same as existing relay).
- Update `docker-compose.e2e.yml` and `docker-compose.e2e-prod.yml` to use Strfry image.
- **Acceptance**: `docker compose up` starts Strfry relay reachable at `ws://localhost:8080`.

### FR-3: Sidecar Deployment Compatibility
- Provide a minimal, production-safe Strfry config suitable for Docker Compose sidecar deployments.
- Support persistent storage via a mounted volume.
- Provide configurable log level and rate limits via config or env mapping.
- **Acceptance**: Publish a NIP-01 event, restart container, verify event remains queryable.

### FR-4: Configuration Assets
- Add `strfry.conf` to project root with comments explaining key settings.
- Include explicit settings for:
  - database path
  - websocket listener port
  - basic rate limits (sane defaults for dev)
- **Acceptance**: `strfry.conf` is checked into repo and referenced by compose.

### FR-5: Documentation
- Update README or docs to describe:
  - how to start Strfry locally (standard compose commands)
  - migration from nostr-rs-relay (if applicable)
  - recommended usage for Docker Compose sidecar deployments
- **Acceptance**: Documentation updated with Strfry setup instructions.

## Non-Functional Requirements

- **Multi-arch** support is required.
- **Minimal operational complexity**: single container, no external DB service.
- **Predictable performance** for local dev and small sidecar deployments.
- **Breaking change acceptable**: Hard migration from nostr-rs-relay to Strfry is intentional.

## Integration Points

- `docker-compose.e2e.yml` and `docker-compose.e2e-prod.yml` for relay service definition(s).
- `README.md` and/or `docs/*` for setup instructions.
- Optional: `.env` or `docker-compose.dev.yml` for toggling relay selection.

## Out of Scope

- Migrating production deployments to Strfry automatically.
- Changing application-level relay configuration format (YAML/JSON).
- Implementing custom Strfry plugins or auth.

## Risks & Mitigations

- **Behavior differences** between relays (nostr-rs-relay vs Strfry). Mitigation: Hard migration means e2e tests will validate Strfry behavior directly.
- **Port conflicts** with existing services. Mitigation: Use same port (8080) as previous relay, no additional conflicts.

## Acceptance Criteria Summary

- Strfry relay can be started locally on both amd64 and arm64 using Docker Compose.
- Sidecar deployment is documented with persistent storage and a minimal config.
- Published events persist across container restarts (verified by test).
- E2e tests pass with Strfry relay.

---

**Note**: This is a requirements specification only. Implementation details will be handled in a follow-up task.
