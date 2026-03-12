---
epic: distribution-improvements
created: 2026-03-12T00:00:00Z
status: planned
priority: medium
---

# Distribution Improvements

## Problem Statement

Nostling's distribution has several gaps that limit reach and create friction for users:

1. **macOS Gatekeeper friction is increasing**. macOS Sequoia (2024+) changed Gatekeeper behavior — the previous right-click "Open" bypass no longer works. Users must navigate to System Settings > Privacy & Security and click "Open Anyway" with admin credentials. This is a multi-step process that deters non-technical users.

2. **Linux distribution is AppImage-only**. While portable and convenient, AppImage lacks sandboxing, has no standard auto-update integration, and is not available through package managers. Flatpak (via Flathub) is the dominant universal Linux package format for desktop applications, offering sandboxing and discoverability.

3. **Windows is explicitly unsupported**. Windows represents the largest desktop OS market share. While not a priority for the privacy-focused target audience, the absence limits reach.

4. **`appId` is a placeholder** (`com.example.nostling`). This affects macOS bundle identification, Linux desktop integration, and any future code signing.

## Functional Requirements

### FR-1: macOS Code Signing and Notarization

Evaluate and implement Apple Developer Program enrollment ($99/year) for:
- Code signing with a Developer ID certificate
- Notarization via `notarytool` (replaces deprecated `altool`)
- Hardened runtime with required entitlements for Electron's V8 JIT
- Signed DMG and ZIP artifacts

**Required entitlements:**
- `com.apple.security.cs.allow-unsigned-executable-memory` (required for V8 JIT)
- `com.apple.security.cs.allow-jit` (required for V8)

**Acceptance criteria:**
- macOS users can install without Gatekeeper warnings
- Auto-update flow works with signed artifacts
- Unsigned distribution path documented as fallback for users who prefer it

### FR-2: Flatpak Packaging

Add Flatpak as a Linux distribution format alongside AppImage.

**Requirements:**
- Flatpak manifest (YAML) defining runtime, permissions, and build steps
- Declared permissions: network access (relays), file system access (config directory), D-Bus (notifications), keyring (secret storage via libsecret)
- Desktop entry file with proper categories and icons
- AppStream metadata for Flathub discoverability

**Acceptance criteria:**
- Flatpak builds and runs on mainstream Linux distributions (Fedora, Ubuntu, Arch)
- Sandboxed permissions correctly allow relay connections, config storage, and keychain access
- Application appears in GNOME Software / KDE Discover when installed from Flatpak
- Auto-update via Flatpak runtime updates (separate from Nostling's self-update system)

### FR-3: Application Identity

Replace the placeholder `appId` (`com.example.nostling`) with the production value.

**Affected locations:**
- `package.json` `build.appId`
- macOS bundle identifier
- Linux desktop file
- Flatpak manifest

**Recommended value:** `design.941.nostling` (reverse domain notation matching the GitHub organization)

**Acceptance criteria:**
- Consistent `appId` across all platform configurations
- macOS identifies the app correctly for Keychain Access, notification permissions, and Gatekeeper
- Linux desktop integration works (`.desktop` file, icon, MIME type associations)

### FR-4: Windows Support Evaluation

Evaluate adding Windows as a supported platform.

**Evaluation criteria:**
- Electron's Windows support is mature and well-tested
- electron-builder supports NSIS installer and portable formats
- Secret storage: Windows Credential Manager via Electron's `safeStorage`
- Code signing: Windows requires Authenticode signing for SmartScreen bypass (similar to macOS Gatekeeper)
- Distribution: GitHub Releases (existing), winget, Chocolatey
- Testing: Windows CI (GitHub Actions `windows-latest`)

**Acceptance criteria for evaluation:**
- Document the effort estimate, ongoing maintenance cost, and user demand
- Decision documented: proceed, defer, or decline with reasoning

### FR-5: Universal macOS Binary

Ship a universal (fat) binary supporting both Apple Silicon (ARM64) and Intel (x64) instead of separate architecture-specific builds.

**Acceptance criteria:**
- Single DMG/ZIP works on both Apple Silicon and Intel Macs
- File size increase documented and accepted (roughly 2x vs single-arch)
- Auto-update flow handles universal binary correctly
- CI builds produce universal binary on each release

## Non-Functional Requirements

- Distribution improvements must not change application behavior
- All packaging formats must include the RSA public key for update verification
- Flatpak sandboxing must not break relay WebSocket connections, OS keychain access, or file system config storage
- Code signing certificates and keys must be CI secrets (never in repository)

## Dependencies

- FR-1 requires Apple Developer Program enrollment ($99/year)
- FR-2 requires Flatpak SDK and builder tooling in CI
- FR-4 requires Windows testing infrastructure
- FR-5 requires `@electron/universal` package integration
