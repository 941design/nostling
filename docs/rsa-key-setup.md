# RSA Key Setup

The auto-update system requires RSA-4096 cryptographic keys for signing and verifying update manifests.

## Key Format Requirements

- **Private key**: PKCS8 PEM format
- **Public key**: SPKI PEM format

## Generating Keys

Generate a new RSA-4096 keypair using openssl:

```bash
# Generate a new RSA-4096 key
openssl genrsa -out slimchat-release.key 4096

# Derive public key
openssl rsa -in slimchat-release.key -pubout -out slimchat-release.pub
chmod 600 slimchat-release.key
```

## Configuring Keys

### For Development/Testing

Set the environment variable when running manifest generation (assuming gopass):

```bash
# Export private key as single-line format (required)
export SLIM_CHAT_RSA_PRIVATE_KEY=$(gopass show slimchat/slimchat-release.key)

npm run package
```

### For Production/CI

Add the private key to your CI/CD secrets:
1. Copy the entire contents of `slimchat-release.key` (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines)
2. Create a secret named `SLIM_CHAT_RSA_PRIVATE_KEY`
3. Paste the full PEM content as the secret value

Example GitHub Actions configuration:
```yaml
- name: Generate signed manifest
  env:
    SLIM_CHAT_RSA_PRIVATE_KEY: ${{ secrets.SLIM_CHAT_RSA_PRIVATE_KEY }}
  run: npm run package
```

### In Application Code

The public key is automatically embedded at build time from `keys/slimchat-release.pub` via tsup's `define` configuration. No manual code changes needed.

To override (for testing), set the `RSA_PUBLIC_KEY` environment variable.

## Key Security

- **Private Key**: NEVER commit to version control. Only store in CI/CD secrets or secure key management systems.
- **Public Key**: Safe to embed in application code and distribute with binaries.
- **Key Rotation**: Generate new keypairs if private key is compromised. Users will need to update to a version with the new public key using the old signing key before rotation completes.
