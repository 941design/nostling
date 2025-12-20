# macOS Code Signing and Notarization Setup

This guide explains how to configure code signing and notarization for macOS builds in GitHub Actions CI.

## Overview

macOS requires applications to be signed and notarized to pass Gatekeeper checks. Without notarization, users will see "damaged/untrusted" errors when attempting to launch the app.

## Prerequisites

1. **Apple Developer Account** ($99/year)
2. **Developer ID Application Certificate** installed on build machine
3. **App-Specific Password** for notarization

## Configuration Steps

### 1. Obtain Developer ID Certificate

1. Log in to [Apple Developer Portal](https://developer.apple.com/account)
2. Navigate to Certificates, Identifiers & Profiles
3. Create a new certificate: **Developer ID Application**
4. Download and install the certificate on your macOS build machine

### 2. Generate App-Specific Password

1. Log in to [appleid.apple.com](https://appleid.apple.com)
2. Navigate to Sign-In and Security → App-Specific Passwords
3. Generate a new password labeled "Nostling CI Notarization"
4. Save the password securely

### 3. Configure GitHub Secrets

Add the following secrets to your GitHub repository (Settings → Secrets and variables → Actions):

- `APPLE_ID`: Your Apple Developer account email
- `APPLE_APP_SPECIFIC_PASSWORD`: The app-specific password from step 2
- `APPLE_TEAM_ID`: Your Apple Developer Team ID (found in developer portal)

### 4. Local Testing (Optional)

To test signing and notarization locally before pushing to CI:

```bash
# Set environment variables
export APPLE_ID="your-email@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"

# Build and sign
npm run package
```

## Verification

After a successful CI build, the workflow will automatically verify:

1. **Code signature validity** (`codesign --verify`)
2. **Gatekeeper assessment** (`spctl -a`)
3. **Notarization ticket** (`xcrun stapler validate`)

If secrets are not configured, the verification step will emit warnings but won't fail the build, allowing ad-hoc signed builds for development.

## Troubleshooting

### Build fails with "No identity found"

Ensure `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` secrets are configured in GitHub.

### Gatekeeper still rejects the app

1. Verify the notarization ticket is stapled: `xcrun stapler validate Nostling.app`
2. Check notarization log: `xcrun notarytool log <submission-id> --apple-id <email> --password <password> --team-id <team>`
3. Ensure hardened runtime is enabled in `package.json` (already configured)

### Ad-hoc signing (development builds)

For development builds without Apple Developer credentials, the app will be ad-hoc signed. Users can bypass Gatekeeper by:

```bash
sudo xattr -dr com.apple.quarantine /Applications/Nostling.app
```

**Note**: Ad-hoc signed apps should not be distributed to end users.

## References

- [Apple Notarization Documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [electron-builder Code Signing Guide](https://www.electron.build/code-signing)
- Bug report: `bug-reports/rejected-build-on-macos.md`
