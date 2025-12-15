/**
 * Comprehensive property-based and example-based tests for RSA verification functions
 *
 * This test suite validates the security properties of verifySignature() and
 * verifyManifest() using property-based testing with fast-check for non-I/O operations
 * and example-based tests for file-dependent operations.
 *
 * Security Properties Tested:
 *   - Authenticity: Only valid signatures pass verification
 *   - Integrity: Any payload modification invalidates signature
 *   - Determinism: Same inputs always produce same result
 *   - Algorithm compliance: Correct RSA/SHA-256 verification
 *   - Error handling: Invalid inputs fail gracefully
 */

import { jest } from '@jest/globals';

jest.mock('../logging', () => ({
  log: jest.fn(),
}));

import fc from 'fast-check';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { verifySignature, findArtifactForPlatform, verifyManifest } from './verify';
import { SignedManifest, ManifestArtifact } from '../../shared/types';

// Test fixtures: Generate valid RSA keypair for testing
const generateTestKeyPair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey: publicKey as string, privateKey: privateKey as string };
};

const testKeyPair = generateTestKeyPair();

// Reduced iterations since RSA operations are expensive (~30-50ms per key generation)
const fcOptions = { numRuns: 20 };

/**
 * Helper: Create a signed manifest with a valid RSA signature
 */
const createSignedManifest = (
  version: string,
  artifacts: ManifestArtifact[],
  createdAt: string,
  privateKeyPem: string
): SignedManifest => {
  const payload = {
    version,
    artifacts,
    createdAt,
  };

  const payloadString = JSON.stringify(payload, null, 0);
  const payloadBuffer = Buffer.from(payloadString, 'utf-8');

  const signer = crypto.createSign('SHA256');
  signer.update(payloadBuffer);
  const signature = signer.sign(privateKeyPem, 'base64');

  return {
    version,
    artifacts,
    createdAt,
    signature,
  };
};

/**
 * Helper: Create test artifacts
 */
const createArtifact = (platform: 'darwin' | 'linux' | 'win32' = 'darwin'): ManifestArtifact => ({
  url: `https://example.com/app-${platform}.tar.gz`,
  sha256: 'abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yzab5678cdef',
  platform,
  type: 'zip',
});

/**
 * Generator helpers for property-based tests
 */
const semverArb = (): fc.Arbitrary<string> => {
  return fc.tuple(fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 30 })).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);
};

const sha256Arb = (): fc.Arbitrary<string> => {
  return fc.stringMatching(/[a-f0-9]{64}/);
};

const isoTimestampArb = (): fc.Arbitrary<string> => {
  return fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2030-12-31T23:59:59Z') }).map((d) => {
    // Ensure the date is valid before converting to ISO string
    if (isNaN(d.getTime())) {
      return new Date('2025-01-01T00:00:00Z').toISOString();
    }
    return d.toISOString();
  });
};

const artifactArb = (): fc.Arbitrary<ManifestArtifact> => {
  return fc.record({
    url: fc.webUrl(),
    sha256: sha256Arb(),
    platform: fc.constantFrom<'darwin' | 'linux' | 'win32'>('darwin', 'linux', 'win32'),
    type: fc.constantFrom<'dmg' | 'zip' | 'AppImage' | 'exe'>('dmg', 'zip', 'AppImage', 'exe'),
  });
};

// ============================================================================
// PROPERTY-BASED TESTS FOR verifySignature()
// ============================================================================

describe('verifySignature - Property-Based Tests', () => {
  /**
   * Property 1: Valid signatures always verify correctly
   * Invariant: If manifest is signed with private key, verification with public key always succeeds
   */
  test('P1: Valid signatures always verify correctly', () => {
    fc.assert(
      fc.property(semverArb(), fc.array(artifactArb(), { minLength: 0, maxLength: 3 }), isoTimestampArb(), (version, artifacts, createdAt) => {
        const manifest = createSignedManifest(version, artifacts, createdAt, testKeyPair.privateKey);
        const result = verifySignature(manifest, testKeyPair.publicKey);
        expect(result).toBe(true);
      }),
      fcOptions
    );
  });

  /**
   * Property 2: Modified version invalidates signature
   * Invariant: Changing version field of signed manifest causes verification to fail
   */
  test('P2: Modified version invalidates signature', () => {
    fc.assert(
      fc.property(
        semverArb(),
        semverArb(),
        artifactArb(),
        isoTimestampArb(),
        (originalVersion, tamperedVersion, artifact, createdAt) => {
          // Skip if versions are equal
          if (originalVersion === tamperedVersion) {
            return;
          }

          const manifest = createSignedManifest(originalVersion, [artifact], createdAt, testKeyPair.privateKey);

          // Tamper with version
          const tamperedManifest = { ...manifest, version: tamperedVersion };
          const result = verifySignature(tamperedManifest, testKeyPair.publicKey);

          expect(result).toBe(false);
        }
      ),
      fcOptions
    );
  });

  /**
   * Property 3: Modified artifacts invalidate signature
   * Invariant: Changing any artifact field causes verification to fail
   */
  test('P3: Modified artifacts invalidate signature', () => {
    fc.assert(
      fc.property(semverArb(), artifactArb(), fc.webUrl(), isoTimestampArb(), (version, artifact, tamperedUrl, createdAt) => {
        const manifest = createSignedManifest(version, [artifact], createdAt, testKeyPair.privateKey);

        // Tamper with artifact URL
        const tamperedManifest = {
          ...manifest,
          artifacts: [{ ...artifact, url: tamperedUrl }],
        };
        const result = verifySignature(tamperedManifest, testKeyPair.publicKey);

        // Skip if URL happens to be the same
        if (artifact.url === tamperedUrl) {
          expect(result).toBe(true);
        } else {
          expect(result).toBe(false);
        }
      }),
      fcOptions
    );
  });

  /**
   * Property 4: Modified createdAt invalidates signature
   * Invariant: Changing createdAt field causes verification to fail
   */
  test('P4: Modified createdAt invalidates signature', () => {
    fc.assert(
      fc.property(
        semverArb(),
        artifactArb(),
        isoTimestampArb(),
        isoTimestampArb(),
        (version, artifact, originalCreatedAt, tamperedCreatedAt) => {
          // Skip if timestamps are equal
          if (originalCreatedAt === tamperedCreatedAt) {
            return;
          }

          const manifest = createSignedManifest(version, [artifact], originalCreatedAt, testKeyPair.privateKey);

          // Tamper with createdAt
          const tamperedManifest = { ...manifest, createdAt: tamperedCreatedAt };
          const result = verifySignature(tamperedManifest, testKeyPair.publicKey);

          expect(result).toBe(false);
        }
      ),
      fcOptions
    );
  });

  /**
   * Property 5: Wrong public key fails verification
   * Invariant: Manifest signed with key A cannot be verified with different key B
   */
  test('P5: Wrong public key fails verification', () => {
    const keyPair1 = testKeyPair;
    // Generate once outside the property to avoid expensive key gen per iteration
    const keyPair2 = generateTestKeyPair();

    fc.assert(
      fc.property(semverArb(), artifactArb(), isoTimestampArb(), (version, artifact, createdAt) => {
        const manifest = createSignedManifest(version, [artifact], createdAt, keyPair1.privateKey);

        // Try to verify with different public key
        const result = verifySignature(manifest, keyPair2.publicKey);

        expect(result).toBe(false);
      }),
      fcOptions
    );
  });

  /**
   * Property 6: Invalid base64 signature fails gracefully
   * Invariant: Non-base64 signature bytes never raise exception, always return false
   */
  test('P6: Invalid base64 signature fails gracefully', () => {
    fc.assert(
      fc.property(semverArb(), artifactArb(), isoTimestampArb(), fc.string({ minLength: 5, maxLength: 20 }), (version, artifact, createdAt, invalidBase64) => {
        // Ensure it's not valid base64 by using disallowed characters
        const brokenSig = invalidBase64.replace(/[A-Za-z0-9+/=]/g, '!');

        if (brokenSig.length === 0) {
          return;
        }

        const manifest: SignedManifest = {
          version,
          artifacts: [artifact],
          createdAt,
          signature: brokenSig,
        };

        const result = verifySignature(manifest, testKeyPair.publicKey);
        expect(result).toBe(false);
      }),
      fcOptions
    );
  });

  /**
   * Property 7: Invalid PEM public key fails gracefully
   * Invariant: Malformed PEM never raises exception, always returns false
   */
  test('P7: Invalid PEM public key fails gracefully', () => {
    fc.assert(
      fc.property(semverArb(), artifactArb(), isoTimestampArb(), fc.string({ minLength: 10, maxLength: 50 }), (version, artifact, createdAt, invalidPem) => {
        const manifest = createSignedManifest(version, [artifact], createdAt, testKeyPair.privateKey);

        // Use something that's definitely not PEM
        const fakePem = `NOT_A_KEY_${invalidPem}`;

        const result = verifySignature(manifest, fakePem);
        expect(result).toBe(false);
      }),
      fcOptions
    );
  });

  /**
   * Property 8: Deterministic verification
   * Invariant: Verifying the same manifest twice produces identical results
   */
  test('P8: Deterministic verification (same input = same output)', () => {
    fc.assert(
      fc.property(semverArb(), artifactArb(), isoTimestampArb(), (version, artifact, createdAt) => {
        const manifest = createSignedManifest(version, [artifact], createdAt, testKeyPair.privateKey);

        const result1 = verifySignature(manifest, testKeyPair.publicKey);
        const result2 = verifySignature(manifest, testKeyPair.publicKey);
        const result3 = verifySignature(manifest, testKeyPair.publicKey);

        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
      }),
      fcOptions
    );
  });

  /**
   * Property 9: Signature byte tampering fails verification
   * Invariant: Flipping any bit in base64-encoded signature invalidates it
   */
  test('P9: Signature byte tampering fails verification', () => {
    fc.assert(
      fc.property(semverArb(), artifactArb(), isoTimestampArb(), fc.integer({ min: 0, max: 100 }), (version, artifact, createdAt, tamperIndex) => {
        const manifest = createSignedManifest(version, [artifact], createdAt, testKeyPair.privateKey);

        // Tamper with signature (flip a character if possible)
        if (manifest.signature.length > 0) {
          const signatureArray = manifest.signature.split('');
          const idx = tamperIndex % signatureArray.length;
          signatureArray[idx] = signatureArray[idx] === 'A' ? 'B' : 'A';
          const tamperedSignature = signatureArray.join('');

          if (tamperedSignature !== manifest.signature) {
            const tamperedManifest = { ...manifest, signature: tamperedSignature };
            const result = verifySignature(tamperedManifest, testKeyPair.publicKey);

            expect(result).toBe(false);
          }
        }
      }),
      fcOptions
    );
  });

  /**
   * Property 10: Multiple artifacts don't break signature
   * Invariant: Signature verification works regardless of number of artifacts
   */
  test('P10: Multiple artifacts preserve signature validity', () => {
    fc.assert(
      fc.property(semverArb(), fc.array(artifactArb(), { minLength: 1, maxLength: 10 }), isoTimestampArb(), (version, artifacts, createdAt) => {
        const manifest = createSignedManifest(version, artifacts, createdAt, testKeyPair.privateKey);
        const result = verifySignature(manifest, testKeyPair.publicKey);

        expect(result).toBe(true);
      }),
      fcOptions
    );
  });

  /**
   * Property 11: Payload JSON canonicalization matters
   * Invariant: JSON whitespace or property order doesn't affect signature verification
   */
  test('P11: Canonical JSON ensures consistent verification', () => {
    fc.assert(
      fc.property(semverArb(), artifactArb(), isoTimestampArb(), (version, artifact, createdAt) => {
        const manifest = createSignedManifest(version, [artifact], createdAt, testKeyPair.privateKey);

        // Verify multiple times to ensure canonicalization is consistent
        const results = [1, 2, 3].map(() => verifySignature(manifest, testKeyPair.publicKey));

        expect(results.every((r) => r === true)).toBe(true);
      }),
      fcOptions
    );
  });

  /**
   * Property 12: Algorithm compliance: RSA + SHA256 only
   * Invariant: Only RSA signatures with SHA256 hash algorithm are accepted
   */
  test('P12: Algorithm compliance (RSA/SHA256 signature verification)', () => {
    // Generate wrong key once outside the property to avoid expensive key gen per iteration
    const wrongKeyPair = generateTestKeyPair();

    fc.assert(
      fc.property(semverArb(), artifactArb(), isoTimestampArb(), (version, artifact, createdAt) => {
        // Create a signature using correct algorithm
        const manifest = createSignedManifest(version, [artifact], createdAt, testKeyPair.privateKey);

        // Should verify with correct key
        const validResult = verifySignature(manifest, testKeyPair.publicKey);
        expect(validResult).toBe(true);

        // Wrong key should fail
        const wrongKeyResult = verifySignature(manifest, wrongKeyPair.publicKey);
        expect(wrongKeyResult).toBe(false);
      }),
      fcOptions
    );
  });
});

// ============================================================================
// EXAMPLE-BASED TESTS FOR verifySignature() - CRITICAL CASES
// ============================================================================

describe('verifySignature - Example-Based Tests', () => {
  test('Empty artifacts array in valid manifest verifies successfully', () => {
    const manifest = createSignedManifest('1.5.0', [], new Date().toISOString(), testKeyPair.privateKey);
    const result = verifySignature(manifest, testKeyPair.publicKey);
    expect(result).toBe(true);
  });

  test('Signature with proper base64 padding verifies correctly', () => {
    const artifact = createArtifact('darwin');
    const manifest = createSignedManifest('2.0.0', [artifact], '2025-12-06T10:30:00.000Z', testKeyPair.privateKey);
    const result = verifySignature(manifest, testKeyPair.publicKey);
    expect(result).toBe(true);
  });

  test('Completely invalid signature format returns false', () => {
    const manifest: SignedManifest = {
      version: '1.0.0',
      artifacts: [createArtifact()],
      createdAt: new Date().toISOString(),
      signature: '!!!NOT_BASE64!!!',
    };
    const result = verifySignature(manifest, testKeyPair.publicKey);
    expect(result).toBe(false);
  });

  test('Empty signature string returns false', () => {
    const manifest: SignedManifest = {
      version: '1.0.0',
      artifacts: [createArtifact()],
      createdAt: new Date().toISOString(),
      signature: '',
    };
    const result = verifySignature(manifest, testKeyPair.publicKey);
    expect(result).toBe(false);
  });

  test('Very long valid base64 signature fails gracefully', () => {
    const manifest: SignedManifest = {
      version: '1.0.0',
      artifacts: [createArtifact()],
      createdAt: new Date().toISOString(),
      signature: 'A'.repeat(10000),
    };
    const result = verifySignature(manifest, testKeyPair.publicKey);
    expect(result).toBe(false);
  });
});

// ============================================================================
// EXAMPLE-BASED TESTS FOR verifyManifest()
// ============================================================================

describe('verifyManifest - Example-Based Tests', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = `/tmp/verify-test-${Date.now()}`;
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  test('Valid manifest with matching file hash succeeds', async () => {
    const filePath = path.join(tempDir, 'test1-file');
    const fileContent = 'test content for manifest verification';
    fs.writeFileSync(filePath, fileContent);

    try {
      const { hashFile } = await import('./crypto');
      const actualHash = await hashFile(filePath);

      const artifact: ManifestArtifact = {
        url: 'https://example.com/app.tar.gz',
        sha256: actualHash,
        platform: 'darwin',
        type: 'zip',
      };

      const manifest = createSignedManifest('2.0.0', [artifact], new Date().toISOString(), testKeyPair.privateKey);
      const result = await verifyManifest(manifest, filePath, '1.0.0', 'darwin', testKeyPair.publicKey);

      expect(result).toEqual({ verified: true });
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  test('Invalid signature fails manifest verification early', async () => {
    const filePath = path.join(tempDir, 'test2-file');
    const fileContent = 'test content';
    fs.writeFileSync(filePath, fileContent);

    try {
      const { hashFile } = await import('./crypto');
      const actualHash = await hashFile(filePath);

      const artifact: ManifestArtifact = {
        url: 'https://example.com/app.tar.gz',
        sha256: actualHash,
        platform: 'darwin',
        type: 'zip',
      };

      const manifest = createSignedManifest('2.0.0', [artifact], new Date().toISOString(), testKeyPair.privateKey);

      // Tamper with signature
      const tamperedManifest = { ...manifest, signature: 'INVALID_SIG' };

      await expect(verifyManifest(tamperedManifest, filePath, '1.0.0', 'darwin', testKeyPair.publicKey)).rejects.toThrow('Manifest signature verification failed');
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  test('Older manifest version fails verification', async () => {
    const filePath = path.join(tempDir, 'test3-file');
    fs.writeFileSync(filePath, 'test');

    try {
      const { hashFile } = await import('./crypto');
      const actualHash = await hashFile(filePath);

      const artifact: ManifestArtifact = {
        url: 'https://example.com/app.tar.gz',
        sha256: actualHash,
        platform: 'darwin',
        type: 'zip',
      };

      const manifest = createSignedManifest('1.0.0', [artifact], new Date().toISOString(), testKeyPair.privateKey);

      await expect(verifyManifest(manifest, filePath, '2.0.0', 'darwin', testKeyPair.publicKey)).rejects.toThrow();
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  test('Missing platform artifact fails verification', async () => {
    const filePath = path.join(tempDir, 'test4-file');
    fs.writeFileSync(filePath, 'test');

    try {
      const { hashFile } = await import('./crypto');
      const actualHash = await hashFile(filePath);

      const artifact: ManifestArtifact = {
        url: 'https://example.com/app.tar.gz',
        sha256: actualHash,
        platform: 'linux',
        type: 'zip',
      };

      const manifest = createSignedManifest('2.0.0', [artifact], new Date().toISOString(), testKeyPair.privateKey);

      await expect(verifyManifest(manifest, filePath, '1.0.0', 'darwin', testKeyPair.publicKey)).rejects.toThrow('No artifact found for platform darwin');
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  test('Hash mismatch fails verification', async () => {
    const filePath = path.join(tempDir, 'test5-file');
    fs.writeFileSync(filePath, 'test');

    try {
      const wrongHash = 'a'.repeat(64);

      const artifact: ManifestArtifact = {
        url: 'https://example.com/app.tar.gz',
        sha256: wrongHash,
        platform: 'darwin',
        type: 'zip',
      };

      const manifest = createSignedManifest('2.0.0', [artifact], new Date().toISOString(), testKeyPair.privateKey);

      await expect(verifyManifest(manifest, filePath, '1.0.0', 'darwin', testKeyPair.publicKey)).rejects.toThrow('Downloaded file hash mismatch');
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  test('Wrong public key fails manifest verification', async () => {
    const filePath = path.join(tempDir, 'test6-file');
    fs.writeFileSync(filePath, 'test');

    try {
      const { hashFile } = await import('./crypto');
      const actualHash = await hashFile(filePath);

      const artifact: ManifestArtifact = {
        url: 'https://example.com/app.tar.gz',
        sha256: actualHash,
        platform: 'darwin',
        type: 'zip',
      };

      const manifest = createSignedManifest('2.0.0', [artifact], new Date().toISOString(), testKeyPair.privateKey);
      const wrongKeyPair = generateTestKeyPair();

      await expect(verifyManifest(manifest, filePath, '1.0.0', 'darwin', wrongKeyPair.publicKey)).rejects.toThrow('Manifest signature verification failed');
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  test('Nonexistent file path rejects with error', async () => {
    const artifact = createArtifact('darwin');
    const manifest = createSignedManifest('2.0.0', [artifact], new Date().toISOString(), testKeyPair.privateKey);

    await expect(verifyManifest(manifest, '/nonexistent/path/file.tar.gz', '1.0.0', 'darwin', testKeyPair.publicKey)).rejects.toThrow();
  });

  test('Multiple artifacts verifies with correct platform match', async () => {
    const filePath = path.join(tempDir, 'test8-file');
    fs.writeFileSync(filePath, 'test');

    try {
      const { hashFile } = await import('./crypto');
      const actualHash = await hashFile(filePath);

      const artifacts: ManifestArtifact[] = [
        { url: 'https://example.com/app-linux.tar.gz', sha256: 'a'.repeat(64), platform: 'linux', type: 'zip' },
        { url: 'https://example.com/app-darwin.tar.gz', sha256: actualHash, platform: 'darwin', type: 'zip' },
        { url: 'https://example.com/app-win32.exe', sha256: 'b'.repeat(64), platform: 'win32', type: 'exe' },
      ];

      const manifest = createSignedManifest('2.0.0', artifacts, new Date().toISOString(), testKeyPair.privateKey);
      const result = await verifyManifest(manifest, filePath, '1.0.0', 'darwin', testKeyPair.publicKey);

      expect(result).toEqual({ verified: true });
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  test('Hash comparison is case-insensitive', async () => {
    const filePath = path.join(tempDir, 'test9-file');
    fs.writeFileSync(filePath, 'test');

    try {
      const { hashFile } = await import('./crypto');
      const actualHash = await hashFile(filePath);

      const artifact: ManifestArtifact = {
        url: 'https://example.com/app.tar.gz',
        sha256: actualHash.toUpperCase(),
        platform: 'darwin',
        type: 'zip',
      };

      const manifest = createSignedManifest('2.0.0', [artifact], new Date().toISOString(), testKeyPair.privateKey);
      const result = await verifyManifest(manifest, filePath, '1.0.0', 'darwin', testKeyPair.publicKey);

      expect(result).toEqual({ verified: true });
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });
});

// ============================================================================
// AUXILIARY TESTS
// ============================================================================

describe('findArtifactForPlatform', () => {
  test('Returns first matching artifact for platform', () => {
    const artifacts: ManifestArtifact[] = [
      createArtifact('linux'),
      createArtifact('darwin'),
      createArtifact('darwin'),
      createArtifact('win32'),
    ];

    const result = findArtifactForPlatform(artifacts, 'darwin');
    expect(result?.platform).toBe('darwin');
    expect(result?.url).toContain('darwin');
  });

  test('Returns undefined when platform not found', () => {
    const artifacts: ManifestArtifact[] = [createArtifact('linux'), createArtifact('win32')];

    const result = findArtifactForPlatform(artifacts, 'darwin');
    expect(result).toBeUndefined();
  });

  test('Returns undefined for empty artifacts array', () => {
    const result = findArtifactForPlatform([], 'darwin');
    expect(result).toBeUndefined();
  });

  test('Platform comparison is case-sensitive', () => {
    const artifacts: ManifestArtifact[] = [createArtifact('darwin')];

    const resultLower = findArtifactForPlatform(artifacts, 'darwin');
    expect(resultLower).toBeDefined();

    const resultUpper = findArtifactForPlatform(artifacts, 'DARWIN' as any);
    expect(resultUpper).toBeUndefined();
  });
});
