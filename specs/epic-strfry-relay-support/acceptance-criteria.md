# Acceptance Criteria: Strfry Relay Support

Generated: 2026-02-08T12:30:00Z
Source: spec.md

## Overview

This epic replaces the nostr-rs-relay (amd64-only) with Strfry relay for local testing, e2e scenarios, and sidecar deployments. The criteria verify multi-arch support, persistent storage, proper configuration, and successful integration with existing compose infrastructure.

## Criteria

### AC-001: Multi-arch Image Availability
- **Description**: Strfry relay Docker image must support both linux/amd64 and linux/arm64 platforms
- **Verification**: Run `docker buildx imagetools inspect thesamecat/strfry` and confirm both `linux/amd64` and `linux/arm64` are listed in the manifest
- **Type**: integration
- **Source**: FR-1 (Strfry Relay Image Support)

### AC-002: Local Relay Start on AMD64
- **Description**: Strfry relay must start successfully via Docker Compose on amd64 architecture and be reachable at ws://localhost:8080
- **Verification**: On amd64 system, run `docker compose -f docker-compose.e2e.yml up relay` and verify websocket connection to ws://localhost:8080 succeeds (using wscat or similar)
- **Type**: integration
- **Source**: FR-2 (Local Testing via Docker Compose)

### AC-003: Local Relay Start on ARM64
- **Description**: Strfry relay must start successfully via Docker Compose on arm64 architecture and be reachable at ws://localhost:8080
- **Verification**: On arm64 system, run `docker compose -f docker-compose.e2e.yml up relay` and verify websocket connection to ws://localhost:8080 succeeds
- **Type**: integration
- **Source**: FR-2 (Local Testing via Docker Compose)

### AC-004: Persistent Event Storage
- **Description**: Published NIP-01 events must persist across container restarts when using volume-mounted storage
- **Verification**: Publish a NIP-01 event to relay, stop container, start container again, query for the event by ID and verify it is returned
- **Type**: integration
- **Source**: FR-3 (Sidecar Deployment Compatibility)

### AC-005: Websocket Port Configuration
- **Description**: Relay must listen on port 8080 for websocket connections (same as previous relay)
- **Verification**: Start relay container and verify `docker compose port relay 8080` returns `0.0.0.0:8080`
- **Type**: integration
- **Source**: FR-2 (Local Testing via Docker Compose)

### AC-006: Configuration File Exists
- **Description**: A strfry.conf configuration file must exist in the project root with documented settings
- **Verification**: Verify file exists at `/Users/mrother/Projects/941design/nostling/strfry.conf` and contains commented sections for database path, websocket port, and rate limits
- **Type**: manual
- **Source**: FR-4 (Configuration Assets)

### AC-007: Database Path Configuration
- **Description**: strfry.conf must specify a database path that maps to a Docker volume mount
- **Verification**: Check strfry.conf contains `db = "/app/strfry-db/"` (or similar) and docker-compose.e2e.yml mounts this path to a named volume
- **Type**: manual
- **Source**: FR-4 (Configuration Assets)

### AC-008: Rate Limit Configuration
- **Description**: strfry.conf must include rate limit settings with documented defaults suitable for development
- **Verification**: Check strfry.conf contains rate limit settings (e.g., connections per IP, events per second) with inline comments explaining values
- **Type**: manual
- **Source**: FR-4 (Configuration Assets)

### AC-009: Compose File Updated for E2E
- **Description**: docker-compose.e2e.yml must define a relay service using Strfry image instead of nostr-rs-relay
- **Verification**: Verify docker-compose.e2e.yml contains service named `relay` with image `thesamecat/strfry`, port mapping `8080:8080`, and volume mount for config and data
- **Type**: manual
- **Source**: FR-2 (Local Testing via Docker Compose)

### AC-010: Compose File Updated for E2E Prod
- **Description**: docker-compose.e2e-prod.yml must define a relay service using Strfry image
- **Verification**: Verify docker-compose.e2e-prod.yml contains service named `relay` with image `thesamecat/strfry`, port mapping `8080:8080`, and volume mount for config and data
- **Type**: manual
- **Source**: FR-2 (Local Testing via Docker Compose)

### AC-011: E2E Tests Pass with Strfry
- **Description**: All existing e2e tests must pass when using Strfry relay instead of nostr-rs-relay
- **Verification**: Run `npm run test:e2e:docker` and verify all tests pass
- **Type**: e2e
- **Source**: Acceptance Criteria Summary (E2e tests pass with Strfry relay)

### AC-012: Documentation Updated
- **Description**: README or docs must include instructions for starting Strfry locally and describe migration from nostr-rs-relay
- **Verification**: Verify README.md or docs/ contains section explaining how to start Strfry using docker compose, mentions migration from nostr-rs-relay, and includes sidecar deployment guidance
- **Type**: manual
- **Source**: FR-5 (Documentation)

### AC-013: Log Level Configuration
- **Description**: Strfry relay must support configurable log level via config file or environment variable
- **Verification**: Check strfry.conf contains log level setting (e.g., `logLevel = "info"`) or docker-compose files allow LOG_LEVEL env override
- **Type**: manual
- **Source**: FR-3 (Sidecar Deployment Compatibility)

### AC-014: Volume Persistence Configured
- **Description**: Compose files must define named volumes for Strfry database to ensure data persistence
- **Verification**: Verify docker-compose.e2e.yml and docker-compose.e2e-prod.yml define a named volume (e.g., `strfry-data`) mapped to database path in container
- **Type**: manual
- **Source**: FR-3 (Sidecar Deployment Compatibility)

## Verification Plan

### Automated Tests
- **Unit tests**: None required (configuration-focused epic)
- **Integration tests**: AC-001 (image inspection), AC-002 (amd64 start), AC-003 (arm64 start), AC-004 (persistence), AC-005 (port check)
- **E2E tests**: AC-011 (full e2e suite passes)

### Manual Verification
- **AC-006**: Verify strfry.conf exists with documented settings
- **AC-007**: Check database path configuration matches volume mounts
- **AC-008**: Review rate limit settings and comments
- **AC-009**: Inspect docker-compose.e2e.yml for Strfry service definition
- **AC-010**: Inspect docker-compose.e2e-prod.yml for Strfry service definition
- **AC-012**: Review documentation updates in README/docs
- **AC-013**: Check log level configuration options
- **AC-014**: Verify volume definitions in compose files

### Integration Test Approach
1. **Image verification**: Use docker buildx imagetools to confirm multi-arch manifest
2. **Relay startup**: Test on both amd64 and arm64 if available (or use CI matrix)
3. **Persistence test**: Scripted test that publishes event, restarts container, queries event
4. **E2E suite**: Existing test suite validates relay behavior comprehensively

## Coverage Matrix

| Spec Requirement | Acceptance Criteria |
|------------------|---------------------|
| FR-1: Strfry Relay Image Support | AC-001 |
| FR-2: Local Testing via Docker Compose | AC-002, AC-003, AC-005, AC-009, AC-010 |
| FR-3: Sidecar Deployment Compatibility | AC-004, AC-007, AC-013, AC-014 |
| FR-4: Configuration Assets | AC-006, AC-007, AC-008 |
| FR-5: Documentation | AC-012 |
| Acceptance Summary: E2e tests pass | AC-011 |
| NFR: Multi-arch support | AC-001, AC-002, AC-003 |
| NFR: Persistent storage | AC-004, AC-007, AC-014 |

## Notes

- **Hard migration**: No backward compatibility with nostr-rs-relay required
- **Same port**: Strfry uses port 8080 (same as previous relay), so no additional port conflict management needed
- **Test fixtures**: E2E tests will use real Strfry relay (no mocking), validating actual relay behavior
- **ARM64 testing**: AC-003 may require ARM64 CI runner or manual verification depending on available infrastructure
