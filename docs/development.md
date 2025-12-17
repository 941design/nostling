# Development Guide

This document describes development-specific setup and workflows for the Nostling project.

## macOS Development: Self-Signed Certificate for Stable Keychain

### Problem

On macOS, Electron's `safeStorage` API uses the system keychain to encrypt secrets. During development, unsigned Electron binaries have unstable keychain access:

- Keychain entries are tied to the binary's code signature
- Unsigned dev builds get a new ephemeral identity on each restart
- Secrets encrypted in one session cannot be decrypted in the next
- Result: Identity secrets are lost on every app restart

### Solution

Sign the Electron binary with a self-signed certificate during development. This provides a stable code signature that persists across development sessions.

### Setup Steps

#### 1. Create Self-Signed Certificate

Open Keychain Access and create a new certificate:

1. Open **Keychain Access** app
2. Menu: **Keychain Access → Certificate Assistant → Create a Certificate**
3. Configure the certificate:
   - **Name**: `Nostling Dev Signing` (exact name required by Makefile)
   - **Identity Type**: `Self-Signed Root`
   - **Certificate Type**: `Code Signing`
   - **Let me override defaults**: ✓ (checked)
4. Click **Continue** through the wizard:
   - **Serial Number**: (leave default)
   - **Validity Period**: 3650 days (10 years)
   - **Email, Name**: (leave defaults)
   - **Key Pair Information**: 2048 bits, RSA
   - **Key Usage Extension**: Signature (checked)
   - **Extended Key Usage Extension**: Code Signing (add)
   - **Subject Alternate Name Extension**: (skip)
   - **Basic Constraints Extension**: (skip)
5. **Keychain**: `login` (default)
6. Click **Create**

#### 2. Trust the Certificate (Required for Keychain Stability)

After creating the certificate, mark it as trusted:

1. In Keychain Access, find the certificate: `Nostling Dev Signing`
2. Double-click to open
3. Expand **Trust** section
4. Set **Code Signing** to **Always Trust**
5. Close and enter your password when prompted

#### 3. Verify Certificate

```bash
# Check certificate exists
security find-certificate -c "Nostling Dev Signing"

# Should output certificate info
```

### Usage

The Makefile automatically signs the Electron binary during `make run-dev`:

```bash
# Installs dependencies and signs Electron.app
make install

# Runs dev mode with signing (via run-dev → sign-dev-electron dependency)
make run-dev
```

If the certificate is not found, you'll see:

```
Warning: 'Nostling Dev Signing' certificate not found
Skipping Electron signing. Secret storage may be unstable in dev mode.
See docs/development.md for certificate creation instructions.
```

### Manual Signing (Optional)

To sign manually:

```bash
make sign-dev-electron
```

This target:
- Checks for the certificate
- Signs `node_modules/electron/dist/Electron.app` if found
- Gracefully skips if certificate missing (with warning)
- Does nothing on non-macOS platforms

### Troubleshooting

**Secrets still lost after restart:**

1. Verify certificate is trusted (see step 2 above)
2. Check signing was successful:
   ```bash
   codesign -vv ./node_modules/electron/dist/Electron.app
   ```
   Should show: `Signature=adhoc` or your certificate name

**Certificate creation fails:**

- Ensure you selected "Self-Signed Root" (not "Self-Signed Leaf")
- Certificate Type must be "Code Signing"

**Keychain prompts on every run:**

- The certificate must be in the `login` keychain
- The certificate must be marked "Always Trust" for Code Signing

### Platform Notes

- **macOS**: Self-signed certificate required for stable keychain access
- **Linux**: Not applicable (Linux uses different keyring backends)
- **Windows**: Not applicable (Windows DPAPI doesn't require signing)

The signing target automatically skips on non-macOS platforms.

## Troubleshooting Secret Storage Errors

### "Failed to decrypt identity secret"

**Cause**: The OS keychain cannot decrypt the stored secret. Common scenarios:
- Keychain access denied or keychain locked
- Secret encrypted with different code signature (macOS)
- Corrupted keychain entry

**Solutions**:

1. **macOS - Unstable code signature in dev mode**:
   - Ensure self-signed certificate is installed and trusted (see above)
   - Verify Electron binary is signed: `codesign -vv ./node_modules/electron/dist/Electron.app`
   - If signature changed, reset dev environment: `make dev-relay-clean` and recreate identities

2. **macOS - Keychain locked**:
   - Open Keychain Access and unlock the login keychain
   - Grant access to the app when prompted

3. **Linux - libsecret unavailable**:
   - Install secret service provider: `sudo apt-get install gnome-keyring` (Ubuntu/Debian)
   - Ensure keyring daemon is running

4. **General - Corrupted entry**:
   - Delete identity and recreate (data loss - only if no other solution works)
   - In dev mode: `make dev-relay-clean` resets entire dev environment

### "Secure storage unavailable"

**Cause**: The OS keychain backend is not available.

**Solutions**:

- **macOS**: Ensure Keychain Access is functional, keychain files not corrupted
- **Linux**: Install and configure secret service:
  ```bash
  # Ubuntu/Debian
  sudo apt-get install gnome-keyring libsecret-1-0

  # Start keyring daemon if not running
  gnome-keyring-daemon --start
  ```
- **Production builds**: Ensure app has required permissions for keychain access

### Dev Mode Bypasses Encryption

When running with `NOSTLING_DATA_DIR` environment variable (e.g., `make dev`), the app uses plaintext base64 encoding instead of OS keychain encryption. This prevents session-specific encryption key conflicts during development.

**Security implication**: Secrets stored in dev mode are NOT encrypted. Never use dev mode for production data.

## See Also

- [Dev Mode Update Testing](dev-mode-update-testing.md) - Testing update flows in development
- [RSA Key Setup](rsa-key-setup.md) - Setting up release signing keys
