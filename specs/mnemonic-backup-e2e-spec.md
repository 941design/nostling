# Mnemonic Backup E2E Tests

## Problem Statement

The mnemonic backup and nsec export features are implemented and have unit test coverage, but lack end-to-end test coverage. Critical user workflows (displaying mnemonic, copying to clipboard, recovering identity from mnemonic, exporting nsec) are untested in the full application context with real Electron windows and OS keychain integration.

## Core Functionality

Comprehensive Playwright E2E tests that exercise the complete mnemonic backup and identity recovery workflows in a realistic environment, including Docker CI with gnome-keyring.

## Functional Requirements

### Mnemonic Display Tests
- Test that creating a new identity shows the mnemonic backup modal
- Test that the mnemonic contains 24 words (BIP-39 format)
- Test that the mnemonic can be revealed (if hidden by default)
- Test that the backup confirmation dismisses the modal

### Mnemonic Copy Tests
- Test copy-to-clipboard functionality
- Verify clipboard contains valid 24-word mnemonic
- Test that copy button provides visual feedback

### Identity Recovery Tests
- Test creating a new identity by importing an existing mnemonic
- Verify the recovered identity has the same npub as the original
- Test that the recovered identity can send/receive messages
- Test recovery with optional derivation path
- Test validation errors for invalid mnemonics

### nsec Export Tests
- Test that nsec can be exported/displayed for an identity
- Verify the nsec format is valid (starts with `nsec1`)
- Test copy-to-clipboard for nsec

### Error Handling Tests
- Test invalid mnemonic input (wrong word count, invalid words)
- Test mnemonic entry cancellation
- Test recovery failure messages

## Critical Constraints

- All tests must run in Docker CI environment (`npm run test:e2e:docker`)
- Tests must work with gnome-keyring for secure storage in Docker
- Tests must not depend on external relays (use local dev relay)
- Tests must clean up created identities to avoid state leakage
- Tests must be independent and not depend on execution order

## Integration Points

- Existing E2E test infrastructure (`e2e/` directory, Playwright config)
- Docker E2E setup (`Dockerfile.e2e`, `docker-compose.e2e.yml`)
- Mnemonic UI components (`src/renderer/components/MnemonicBackup/`)
- Identity creation workflow in main UI

## Out of Scope

- Unit tests for mnemonic crypto functions (already exist)
- Performance benchmarks for key derivation
- Multi-device recovery scenarios (single-app scope)
- Hardware wallet integration
