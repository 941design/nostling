# Bug Report: macOS Gatekeeper Rejects Nostling.app

## Summary
`Nostling.app` is rejected by macOS Gatekeeper on multiple Apple Silicon machines (M1 Max and M4 Max), despite passing `codesign --verify`. The app cannot be opened after installation and is reported as blocked/damaged by macOS.

## Affected Systems
- MacBook Pro M1 Max (Apple Silicon)
- MacBook Pro M4 Max (Apple Silicon)
- Architecture: arm64
- macOS Versions: Sequoia (15.x), Tahoe (unreleased/beta)
- Location: `/Applications/Nostling.app`

## Expected Behavior
The application should launch normally after download and installation.

## Reproduction Steps
1. Download `Nostling.dmg` from GitHub releases
2. Mount the DMG and drag `Nostling.app` to `/Applications`
3. Attempt to launch Nostling from Applications folder
4. Observe: macOS Gatekeeper blocks execution with "damaged/untrusted" message

## Actual Behavior
- macOS refuses to launch the app.
- Gatekeeper assessment fails:
  ```bash
  spctl -a -vv --type execute /Applications/Nostling.app
  # => rejected
````

* Removing quarantine does not resolve the issue:

  ```bash
  sudo xattr -dr com.apple.quarantine /Applications/Nostling.app
  ```

## Verification Results

* Code signature is valid:

  ```bash
  codesign --verify --deep --strict --verbose=4 /Applications/Nostling.app
  # => valid on disk
  # => satisfies its Designated Requirement
  ```
* Local allowlisting via `spctl --add` is no longer supported on current macOS versions.

## Analysis

This behavior is consistent across machines and architectures, ruling out CPU-related issues.
The most likely cause is a **CI packaging/signing error**, specifically:

* Missing notarization of the final artifact, or
* The app bundle being modified after signing in CI.

On modern macOS versions, signed-but-not-notarized apps are rejected by Gatekeeper even when signatures are valid.

## Suspected Root Cause

GitHub Actions CI pipeline signs the app but:

* Does not notarize the final `.app`/`.dmg`, or
* Performs post-signing modifications (Electron packaging, framework changes, plist edits, chmod, etc.).

## CI Context
- **CI System**: GitHub Actions
- **Distribution Method**: DMG via GitHub releases

## Recommended Fix

* Ensure **signing is the final mutation step** in CI.
* Sign with **Developer ID Application** and **hardened runtime**.
* Notarize the final DMG or ZIP using `notarytool`.
* Staple the notarization ticket to the distributed artifact.
* Add CI verification:

  ```bash
  codesign --verify --deep --strict --verbose=4 Nostling.app
  spctl -a -vvv --type execute Nostling.app
  xcrun stapler validate Nostling.app
  ```

## Severity

High — application cannot be launched on current macOS versions.
