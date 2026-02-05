import { defineConfig } from 'tsup';
import fs from 'fs';
import path from 'path';

// Read public key at build time - embedded into bundle
const publicKeyPath = path.resolve(__dirname, 'keys/nostling-release.pub');
const publicKey = fs.existsSync(publicKeyPath)
  ? fs.readFileSync(publicKeyPath, 'utf-8').trim()
  : '';

export default defineConfig({
  external: [
    'electron',
    'electron-updater',
    'electron-log',
  ],
  // Bundle ESM-only dependencies to avoid CJS/ESM compatibility issues
  noExternal: [
    'nostr-tools',
    '@noble/hashes',
    '@noble/curves',
    '@scure/bip32',
    '@scure/bip39',
  ],
  define: {
    'process.env.EMBEDDED_RSA_PUBLIC_KEY': JSON.stringify(publicKey),
  },
});
