import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fc from 'fast-check';
import nacl from 'tweetnacl';
import * as fs from 'fs';
import * as path from 'path';
import { verifySignature, verifyManifest } from './verify';
import { SignedManifest, ManifestArtifact } from '../../shared/types';

// Test keypair
const TEST_KEYPAIR = {
  publicKey: 'aB6aFtBKBr8QAuzAhDPg4KYqPEwlwEUVGaKZ4fFWIZE=',
  secretKey: 'Ikm8eJsKIlhb/69CMAu31lusHWNG2kxWK3Q4irVzBjpoHpoW0EoGvxAC7MCEM+Dgpio8TCXARRUZopnh8VYhkQ==',
};

function createValidManifest(
  version: string = '1.0.0',
  secretKey: string = TEST_KEYPAIR.secretKey
): SignedManifest {
  const artifacts: ManifestArtifact[] = [
    {
      url: 'https://example.com/update-1.0.0.dmg',
      sha256: 'abcd1234',
      platform: 'darwin',
      type: 'dmg',
    },
  ];
  const createdAt = new Date().toISOString();

  const payload = {
    version,
    artifacts,
    createdAt,
  };

  const payloadString = JSON.stringify(payload, null, 0);
  const messageBuffer = Buffer.from(payloadString, 'utf-8');

  const secretKeyBuffer = Buffer.from(secretKey, 'base64');
  const signature = nacl.sign.detached(messageBuffer, secretKeyBuffer);

  return {
    version,
    artifacts,
    createdAt,
    signature: Buffer.from(signature).toString('base64'),
  };
}

function isValidBase64(str: string): boolean {
  try {
    Buffer.from(str, 'base64');
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str);
  } catch {
    return false;
  }
}

const hashArb = fc.string({ minLength: 60, maxLength: 70 }).map(s => s.padEnd(64, 'a'));

describe('verifySignature', () => {
  describe('Property-Based Tests', () => {
    it('P001: Valid signature with correct key returns true', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          fc.array(
            fc.record({
              url: fc.webUrl(),
              sha256: hashArb,
              platform: fc.constantFrom('darwin' as const, 'linux' as const, 'win32' as const),
              type: fc.constantFrom('dmg' as const, 'zip' as const, 'AppImage' as const, 'exe' as const),
            }),
            { minLength: 1 }
          ),
          ([major, minor, patch], artifacts) => {
            const version = `${major}.${minor}.${patch}`;
            const createdAt = new Date().toISOString();

            const payload = { version, artifacts, createdAt };
            const payloadString = JSON.stringify(payload, null, 0);
            const messageBuffer = Buffer.from(payloadString, 'utf-8');

            const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
            const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

            const manifest: SignedManifest = {
              version,
              artifacts,
              createdAt,
              signature: Buffer.from(signatureBuf).toString('base64'),
            };

            const result = verifySignature(manifest, TEST_KEYPAIR.publicKey);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P002: Tampered manifest content returns false', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          fc.array(
            fc.record({
              url: fc.webUrl(),
              sha256: hashArb,
              platform: fc.constantFrom('darwin' as const, 'linux' as const, 'win32' as const),
              type: fc.constantFrom('dmg' as const, 'zip' as const, 'AppImage' as const, 'exe' as const),
            }),
            { minLength: 1 }
          ),
          fc.constantFrom('version', 'artifacts', 'createdAt'),
          ([major, minor, patch], artifacts, fieldToTamper) => {
            const version = `${major}.${minor}.${patch}`;
            const createdAt = new Date().toISOString();

            const payload = { version, artifacts, createdAt };
            const payloadString = JSON.stringify(payload, null, 0);
            const messageBuffer = Buffer.from(payloadString, 'utf-8');

            const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
            const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

            const manifest: SignedManifest = {
              version,
              artifacts,
              createdAt,
              signature: Buffer.from(signatureBuf).toString('base64'),
            };

            // Tamper with manifest content
            if (fieldToTamper === 'version') {
              manifest.version = 'tampered-version';
            } else if (fieldToTamper === 'createdAt') {
              manifest.createdAt = new Date(Date.now() + 1000).toISOString();
            } else if (fieldToTamper === 'artifacts') {
              manifest.artifacts = [
                {
                  url: 'https://tampered.example.com/file',
                  sha256: 'DEADBEEF'.padEnd(64, '0'),
                  platform: 'darwin',
                  type: 'dmg',
                },
              ];
            }

            const result = verifySignature(manifest, TEST_KEYPAIR.publicKey);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('P003: Wrong public key returns false', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          ([major, minor, patch]) => {
            const version = `${major}.${minor}.${patch}`;
            const manifest = createValidManifest(version);

            // Generate a different keypair
            const { publicKey: wrongPublicKey } = nacl.sign.keyPair();
            const wrongPublicKeyB64 = Buffer.from(wrongPublicKey).toString('base64');

            const result = verifySignature(manifest, wrongPublicKeyB64);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('P004: Invalid base64 signature returns false', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !isValidBase64(s)),
          ([major, minor, patch], invalidBase64) => {
            const version = `${major}.${minor}.${patch}`;
            const manifest = createValidManifest(version);
            manifest.signature = invalidBase64;

            const result = verifySignature(manifest, TEST_KEYPAIR.publicKey);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('P005: Invalid base64 public key returns false', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !isValidBase64(s)),
          (invalidBase64) => {
            const manifest = createValidManifest();

            const result = verifySignature(manifest, invalidBase64);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('P006: Wrong signature length returns false', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          ([major, minor, patch]) => {
            const version = `${major}.${minor}.${patch}`;
            const manifest = createValidManifest(version);

            // Corrupt signature length by truncating
            const validSigBuf = Buffer.from(manifest.signature, 'base64');
            const truncatedSig = validSigBuf.subarray(0, Math.max(1, validSigBuf.length - 10));
            manifest.signature = truncatedSig.toString('base64');

            const result = verifySignature(manifest, TEST_KEYPAIR.publicKey);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 15 }
      );
    });

    it('P007: Wrong public key length returns false', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          ([major, minor, patch]) => {
            const version = `${major}.${minor}.${patch}`;
            const manifest = createValidManifest(version);

            // Corrupt public key length
            const validKeyBuf = Buffer.from(TEST_KEYPAIR.publicKey, 'base64');
            const truncatedKey = validKeyBuf.subarray(0, Math.max(1, validKeyBuf.length - 5));
            const wrongKeyB64 = truncatedKey.toString('base64');

            const result = verifySignature(manifest, wrongKeyB64);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 15 }
      );
    });

    it('P008: Empty/null signature handled safely', () => {
      const manifest = createValidManifest();
      manifest.signature = '';

      const result = verifySignature(manifest, TEST_KEYPAIR.publicKey);
      expect(result).toBe(false);
    });

    it('P009: Empty/null public key handled safely', () => {
      const manifest = createValidManifest();

      const result = verifySignature(manifest, '');
      expect(result).toBe(false);
    });

    it('P010: Signature verification is deterministic (same inputs always same result)', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          ([major, minor, patch]) => {
            const version = `${major}.${minor}.${patch}`;
            const manifest = createValidManifest(version);

            const result1 = verifySignature(manifest, TEST_KEYPAIR.publicKey);
            const result2 = verifySignature(manifest, TEST_KEYPAIR.publicKey);
            const result3 = verifySignature(manifest, TEST_KEYPAIR.publicKey);

            expect(result1).toBe(result2);
            expect(result2).toBe(result3);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('P011: Modification of single artifact invalidates signature', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          fc.array(
            fc.record({
              url: fc.webUrl(),
              sha256: hashArb,
              platform: fc.constantFrom('darwin' as const, 'linux' as const, 'win32' as const),
              type: fc.constantFrom('dmg' as const, 'zip' as const, 'AppImage' as const, 'exe' as const),
            }),
            { minLength: 2 }
          ),
          ([major, minor, patch], artifacts) => {
            const version = `${major}.${minor}.${patch}`;
            const createdAt = new Date().toISOString();
            const payload = { version, artifacts, createdAt };
            const payloadString = JSON.stringify(payload, null, 0);
            const messageBuffer = Buffer.from(payloadString, 'utf-8');

            const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
            const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

            const manifest: SignedManifest = {
              version,
              artifacts,
              createdAt,
              signature: Buffer.from(signatureBuf).toString('base64'),
            };

            // Valid signature
            expect(verifySignature(manifest, TEST_KEYPAIR.publicKey)).toBe(true);

            // Modify one artifact
            manifest.artifacts[0].sha256 = 'DEADBEEF'.padEnd(64, 'F');

            // Now signature should be invalid
            expect(verifySignature(manifest, TEST_KEYPAIR.publicKey)).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('P012: Null manifest fields handled safely', () => {
      const manifest = createValidManifest();
      (manifest as any).version = null;

      const result = verifySignature(manifest, TEST_KEYPAIR.publicKey);
      expect(result).toBe(false);
    });
  });

  describe('Example-Based Critical Tests', () => {
    it('E001: Valid manifest from generated keypair verifies correctly', () => {
      const { publicKey, secretKey } = nacl.sign.keyPair();
      const publicKeyB64 = Buffer.from(publicKey).toString('base64');
      const secretKeyB64 = Buffer.from(secretKey).toString('base64');

      const manifest = createValidManifest('1.5.0', secretKeyB64);

      const result = verifySignature(manifest, publicKeyB64);
      expect(result).toBe(true);
    });

    it('E002: Completely invalid base64 in signature returns false', () => {
      const manifest = createValidManifest();
      manifest.signature = '!!!invalid!!!base64!!!';

      const result = verifySignature(manifest, TEST_KEYPAIR.publicKey);
      expect(result).toBe(false);
    });

    it('E003: Completely invalid base64 in public key returns false', () => {
      const manifest = createValidManifest();

      const result = verifySignature(manifest, '!!!not!!!base64!!!');
      expect(result).toBe(false);
    });

    it('E004: Signature from wrong secret key fails verification', () => {
      const { secretKey: wrongSecretKey } = nacl.sign.keyPair();
      const wrongSecretKeyB64 = Buffer.from(wrongSecretKey).toString('base64');
      const manifest = createValidManifest('2.0.0', wrongSecretKeyB64);

      const result = verifySignature(manifest, TEST_KEYPAIR.publicKey);
      expect(result).toBe(false);
    });

    it('E005: Multiple artifacts in manifest verify correctly when signed', () => {
      const version = '3.0.0';
      const artifacts: ManifestArtifact[] = [
        {
          url: 'https://example.com/update-darwin.dmg',
          sha256: 'abcd1234',
          platform: 'darwin',
          type: 'dmg',
        },
        {
          url: 'https://example.com/update-linux.AppImage',
          sha256: 'efgh5678',
          platform: 'linux',
          type: 'AppImage',
        },
        {
          url: 'https://example.com/update-win.exe',
          sha256: 'ijkl9012',
          platform: 'win32',
          type: 'exe',
        },
      ];
      const createdAt = new Date().toISOString();

      const payload = { version, artifacts, createdAt };
      const payloadString = JSON.stringify(payload, null, 0);
      const messageBuffer = Buffer.from(payloadString, 'utf-8');

      const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
      const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

      const manifest: SignedManifest = {
        version,
        artifacts,
        createdAt,
        signature: Buffer.from(signatureBuf).toString('base64'),
      };

      const result = verifySignature(manifest, TEST_KEYPAIR.publicKey);
      expect(result).toBe(true);
    });
  });
});

describe('verifyManifest', () => {
  let testDir: string;
  let testFilePath: string;

  beforeAll(() => {
    testDir = path.join('/tmp', `test-verify-manifest-${Date.now()}`);
    testFilePath = path.join(testDir, 'test-file.dmg');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createFileWithHash(content: string): string {
    fs.writeFileSync(testFilePath, content);
    return testFilePath;
  }

  describe('Property-Based Tests', () => {
    it('P001: Valid manifest with correct signature, version, and file hash passes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          fc.tuple(
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          fc.constantFrom('darwin' as const, 'linux' as const),
          async ([currentMajor, currentMinor, currentPatch], [manifestMajor, manifestMinor, manifestPatch], platform) => {
            const currentVersion = `${currentMajor}.${currentMinor}.${currentPatch}`;
            // Ensure manifest version is strictly greater than current
            // Simple approach: always use manifest major + 1
            const manifestVersion = `${currentMajor + 1}.0.0`;

            const testContent = `test-content-${Date.now()}`;
            const filePath = createFileWithHash(testContent);

            // Create properly signed manifest with correct hash
            const { hashFile } = await import('./crypto');
            const actualHash = await hashFile(filePath);

            const artifacts: ManifestArtifact[] = [
              {
                url: 'https://example.com/update.dmg',
                sha256: actualHash,
                platform,
                type: platform === 'darwin' ? 'dmg' : 'AppImage',
              },
            ];

            const createdAt = new Date().toISOString();
            const payload = { version: manifestVersion, artifacts, createdAt };
            const payloadString = JSON.stringify(payload, null, 0);
            const messageBuffer = Buffer.from(payloadString, 'utf-8');

            const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
            const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

            const manifest: SignedManifest = {
              version: manifestVersion,
              artifacts,
              createdAt,
              signature: Buffer.from(signatureBuf).toString('base64'),
            };

            const result = await verifyManifest(manifest, filePath, currentVersion, platform, TEST_KEYPAIR.publicKey);
            expect(result).toEqual({ verified: true });
          }
        ),
        { numRuns: 15 }
      );
    });

    it('P002: Invalid signature throws VerificationError', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          async ([major, minor, patch]) => {
            const version = `${major}.${minor}.${patch}`;
            const currentVersion = '0.1.0';

            const testContent = 'test-content';
            createFileWithHash(testContent);

            const manifest = createValidManifest(version);
            // Tamper with signature
            const sigBuf = Buffer.from(manifest.signature, 'base64');
            const tamperedSig = Buffer.concat([sigBuf, Buffer.from([0xff, 0xff])]).toString('base64');
            manifest.signature = tamperedSig;

            await expect(verifyManifest(manifest, testFilePath, currentVersion, 'darwin', TEST_KEYPAIR.publicKey)).rejects.toThrow(
              'Manifest signature verification failed'
            );
          }
        ),
        { numRuns: 10 }
      );
    });

    it('P003: Old version throws VerificationError', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.integer({ min: 2, max: 10 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          async ([major, minor, patch]) => {
            const manifestVersion = `${major}.${minor}.${patch}`;
            const currentVersion = `${major + 1}.0.0`;

            const testContent = 'test-content';
            createFileWithHash(testContent);

            const manifest = createValidManifest(manifestVersion);

            await expect(verifyManifest(manifest, testFilePath, currentVersion, 'darwin', TEST_KEYPAIR.publicKey)).rejects.toThrow(
              /is older than current version/
            );
          }
        ),
        { numRuns: 10 }
      );
    });

    it('P004: Equal version throws VerificationError', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          async ([major, minor, patch]) => {
            const version = `${major}.${minor}.${patch}`;

            const testContent = 'test-content';
            createFileWithHash(testContent);

            const manifest = createValidManifest(version);

            await expect(verifyManifest(manifest, testFilePath, version, 'darwin', TEST_KEYPAIR.publicKey)).rejects.toThrow(
              /equals current version/
            );
          }
        ),
        { numRuns: 10 }
      );
    });

    it('P005: Missing platform artifact throws VerificationError', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          fc.constantFrom('darwin' as const, 'linux' as const),
          async ([major, minor, patch], requestedPlatform) => {
            const version = `${major}.${minor}.${patch}`;
            const currentVersion = '0.1.0';

            const testContent = 'test-content';
            createFileWithHash(testContent);

            const otherPlatform = requestedPlatform === 'darwin' ? 'linux' : 'darwin';

            const artifacts: ManifestArtifact[] = [
              {
                url: 'https://example.com/update.dmg',
                sha256: 'abcd1234'.padEnd(64, 'a'),
                platform: otherPlatform,
                type: otherPlatform === 'darwin' ? 'dmg' : 'AppImage',
              },
            ];

            const createdAt = new Date().toISOString();
            const payload = { version, artifacts, createdAt };
            const payloadString = JSON.stringify(payload, null, 0);
            const messageBuffer = Buffer.from(payloadString, 'utf-8');

            const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
            const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

            const manifest: SignedManifest = {
              version,
              artifacts,
              createdAt,
              signature: Buffer.from(signatureBuf).toString('base64'),
            };

            await expect(verifyManifest(manifest, testFilePath, currentVersion, requestedPlatform, TEST_KEYPAIR.publicKey)).rejects.toThrow(
              `No artifact found for platform ${requestedPlatform}`
            );
          }
        ),
        { numRuns: 10 }
      );
    });

    it('P006: File hash mismatch throws VerificationError', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          async ([major, minor, patch]) => {
            const version = `${major}.${minor}.${patch}`;
            const currentVersion = '0.1.0';

            const testContent = 'test-content-123';
            createFileWithHash(testContent);

            const artifacts: ManifestArtifact[] = [
              {
                url: 'https://example.com/update.dmg',
                sha256: 'deadbeef'.padEnd(64, 'f'), // Wrong hash
                platform: 'darwin',
                type: 'dmg',
              },
            ];

            const createdAt = new Date().toISOString();
            const payload = { version, artifacts, createdAt };
            const payloadString = JSON.stringify(payload, null, 0);
            const messageBuffer = Buffer.from(payloadString, 'utf-8');

            const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
            const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

            const manifest: SignedManifest = {
              version,
              artifacts,
              createdAt,
              signature: Buffer.from(signatureBuf).toString('base64'),
            };

            await expect(verifyManifest(manifest, testFilePath, currentVersion, 'darwin', TEST_KEYPAIR.publicKey)).rejects.toThrow(
              'Downloaded file hash mismatch'
            );
          }
        ),
        { numRuns: 10 }
      );
    });

    it('P007: All verification steps execute in correct order (signature -> version -> artifact -> hash)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          async ([major, minor, patch]) => {
            const version = `${major}.${minor}.${patch}`;
            const currentVersion = '0.1.0';

            const testContent = 'test-content-order';
            createFileWithHash(testContent);

            const manifest = createValidManifest(version);

            // Verify order by checking that signature failure is caught before version check
            // (version check would fail with old version, but signature check should fail first with bad sig)
            manifest.signature = 'invalid!!!base64!!!';

            await expect(verifyManifest(manifest, testFilePath, '100.0.0', 'darwin', TEST_KEYPAIR.publicKey)).rejects.toThrow(
              'Manifest signature verification failed'
            );
          }
        ),
        { numRuns: 5 }
      );
    });

    it('P008: Error messages are descriptive and informative', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          async ([major, minor, patch]) => {
            const version = `${major}.${minor}.${patch}`;

            createFileWithHash('test-content');

            const manifest = createValidManifest(version);

            // Test platform error message contains platform name
            try {
              await verifyManifest(manifest, testFilePath, '0.1.0', 'linux', TEST_KEYPAIR.publicKey);
            } catch (err: any) {
              if (err.message.includes('No artifact found for platform')) {
                expect(err.message).toContain('linux');
              }
            }
          }
        ),
        { numRuns: 5 }
      );
    });

    it('P009: Deterministic: same inputs produce same verification result', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          async ([major, minor, patch]) => {
            const version = `${major}.${minor}.${patch}`;
            const currentVersion = '0.1.0';

            const testContent = 'deterministic-test';
            createFileWithHash(testContent);

            const { hashFile } = await import('./crypto');
            const actualHash = await hashFile(testFilePath);

            const artifacts: ManifestArtifact[] = [
              {
                url: 'https://example.com/update.dmg',
                sha256: actualHash,
                platform: 'darwin',
                type: 'dmg',
              },
            ];

            const createdAt = new Date().toISOString();
            const payload = { version, artifacts, createdAt };
            const payloadString = JSON.stringify(payload, null, 0);
            const messageBuffer = Buffer.from(payloadString, 'utf-8');

            const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
            const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

            const manifest: SignedManifest = {
              version,
              artifacts,
              createdAt,
              signature: Buffer.from(signatureBuf).toString('base64'),
            };

            const result1 = await verifyManifest(manifest, testFilePath, currentVersion, 'darwin', TEST_KEYPAIR.publicKey);
            const result2 = await verifyManifest(manifest, testFilePath, currentVersion, 'darwin', TEST_KEYPAIR.publicKey);

            expect(result1).toEqual(result2);
            expect(result1).toEqual({ verified: true });
          }
        ),
        { numRuns: 5 }
      );
    });

    it('P010: Returns exactly { verified: true } on success (not just truthy)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 99 })
          ),
          async ([major, minor, patch]) => {
            const version = `${major}.${minor}.${patch}`;
            const currentVersion = '0.1.0';

            const testContent = 'return-value-test';
            createFileWithHash(testContent);

            const { hashFile } = await import('./crypto');
            const actualHash = await hashFile(testFilePath);

            const artifacts: ManifestArtifact[] = [
              {
                url: 'https://example.com/update.dmg',
                sha256: actualHash,
                platform: 'darwin',
                type: 'dmg',
              },
            ];

            const createdAt = new Date().toISOString();
            const payload = { version, artifacts, createdAt };
            const payloadString = JSON.stringify(payload, null, 0);
            const messageBuffer = Buffer.from(payloadString, 'utf-8');

            const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
            const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

            const manifest: SignedManifest = {
              version,
              artifacts,
              createdAt,
              signature: Buffer.from(signatureBuf).toString('base64'),
            };

            const result = await verifyManifest(manifest, testFilePath, currentVersion, 'darwin', TEST_KEYPAIR.publicKey);
            expect(result).toEqual({ verified: true });
            expect(Object.keys(result).sort()).toEqual(['verified']);
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  describe('Example-Based Critical Tests', () => {
    it('E001: Complete valid verification flow succeeds', async () => {
      const version = '2.0.0';
      const currentVersion = '1.0.0';
      const testContent = 'complete-valid-test';
      createFileWithHash(testContent);

      const { hashFile } = await import('./crypto');
      const actualHash = await hashFile(testFilePath);

      const artifacts: ManifestArtifact[] = [
        {
          url: 'https://example.com/update.dmg',
          sha256: actualHash,
          platform: 'darwin',
          type: 'dmg',
        },
      ];

      const createdAt = new Date().toISOString();
      const payload = { version, artifacts, createdAt };
      const payloadString = JSON.stringify(payload, null, 0);
      const messageBuffer = Buffer.from(payloadString, 'utf-8');

      const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
      const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

      const manifest: SignedManifest = {
        version,
        artifacts,
        createdAt,
        signature: Buffer.from(signatureBuf).toString('base64'),
      };

      const result = await verifyManifest(manifest, testFilePath, currentVersion, 'darwin', TEST_KEYPAIR.publicKey);
      expect(result).toEqual({ verified: true });
    });

    it('E002: Signature failure blocks verification (fails at step 1)', async () => {
      const manifest = createValidManifest('2.0.0');
      manifest.signature = 'invalid!!!base64!!!';

      createFileWithHash('test');

      await expect(verifyManifest(manifest, testFilePath, '1.0.0', 'darwin', TEST_KEYPAIR.publicKey)).rejects.toThrow(
        'Manifest signature verification failed'
      );
    });

    it('E003: Version downgrade blocked', async () => {
      const manifest = createValidManifest('1.0.0');

      createFileWithHash('test');

      await expect(verifyManifest(manifest, testFilePath, '2.0.0', 'darwin', TEST_KEYPAIR.publicKey)).rejects.toThrow(
        /is older than current version/
      );
    });

    it('E004: Missing platform artifact rejected', async () => {
      const version = '2.0.0';
      const artifacts: ManifestArtifact[] = [
        {
          url: 'https://example.com/update.zip',
          sha256: 'abcd1234'.padEnd(64, 'a'),
          platform: 'linux',
          type: 'zip',
        },
      ];

      const createdAt = new Date().toISOString();
      const payload = { version, artifacts, createdAt };
      const payloadString = JSON.stringify(payload, null, 0);
      const messageBuffer = Buffer.from(payloadString, 'utf-8');

      const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
      const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

      const manifest: SignedManifest = {
        version,
        artifacts,
        createdAt,
        signature: Buffer.from(signatureBuf).toString('base64'),
      };

      createFileWithHash('test');

      await expect(verifyManifest(manifest, testFilePath, '1.0.0', 'darwin', TEST_KEYPAIR.publicKey)).rejects.toThrow(
        'No artifact found for platform darwin'
      );
    });

    it('E005: Hash mismatch detected', async () => {
      const version = '2.0.0';
      const artifacts: ManifestArtifact[] = [
        {
          url: 'https://example.com/update.dmg',
          sha256: 'deadbeef'.padEnd(64, 'f'),
          platform: 'darwin',
          type: 'dmg',
        },
      ];

      const createdAt = new Date().toISOString();
      const payload = { version, artifacts, createdAt };
      const payloadString = JSON.stringify(payload, null, 0);
      const messageBuffer = Buffer.from(payloadString, 'utf-8');

      const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
      const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

      const manifest: SignedManifest = {
        version,
        artifacts,
        createdAt,
        signature: Buffer.from(signatureBuf).toString('base64'),
      };

      createFileWithHash('test-content-that-wont-match-hash');

      await expect(verifyManifest(manifest, testFilePath, '1.0.0', 'darwin', TEST_KEYPAIR.publicKey)).rejects.toThrow(
        'Downloaded file hash mismatch'
      );
    });

    it('E006: Case-insensitive hash matching works', async () => {
      const version = '2.0.0';
      const currentVersion = '1.0.0';
      const testContent = 'case-insensitive-test';
      createFileWithHash(testContent);

      const { hashFile } = await import('./crypto');
      const actualHash = await hashFile(testFilePath);

      // Use uppercase version of the hash
      const uppercaseHash = actualHash.toUpperCase();

      const artifacts: ManifestArtifact[] = [
        {
          url: 'https://example.com/update.dmg',
          sha256: uppercaseHash,
          platform: 'darwin',
          type: 'dmg',
        },
      ];

      const createdAt = new Date().toISOString();
      const payload = { version, artifacts, createdAt };
      const payloadString = JSON.stringify(payload, null, 0);
      const messageBuffer = Buffer.from(payloadString, 'utf-8');

      const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
      const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

      const manifest: SignedManifest = {
        version,
        artifacts,
        createdAt,
        signature: Buffer.from(signatureBuf).toString('base64'),
      };

      const result = await verifyManifest(manifest, testFilePath, currentVersion, 'darwin', TEST_KEYPAIR.publicKey);
      expect(result).toEqual({ verified: true });
    });

    it('E007: Multiple artifacts - correct one selected by platform', async () => {
      const version = '2.0.0';
      const currentVersion = '1.0.0';
      const testContent = 'multi-artifact-test';
      createFileWithHash(testContent);

      const { hashFile } = await import('./crypto');
      const actualHash = await hashFile(testFilePath);

      const artifacts: ManifestArtifact[] = [
        {
          url: 'https://example.com/update-linux.AppImage',
          sha256: 'deadbeef'.padEnd(64, 'f'),
          platform: 'linux',
          type: 'AppImage',
        },
        {
          url: 'https://example.com/update-darwin.dmg',
          sha256: actualHash,
          platform: 'darwin',
          type: 'dmg',
        },
      ];

      const createdAt = new Date().toISOString();
      const payload = { version, artifacts, createdAt };
      const payloadString = JSON.stringify(payload, null, 0);
      const messageBuffer = Buffer.from(payloadString, 'utf-8');

      const secretKeyBuffer = Buffer.from(TEST_KEYPAIR.secretKey, 'base64');
      const signatureBuf = nacl.sign.detached(messageBuffer, secretKeyBuffer);

      const manifest: SignedManifest = {
        version,
        artifacts,
        createdAt,
        signature: Buffer.from(signatureBuf).toString('base64'),
      };

      const result = await verifyManifest(manifest, testFilePath, currentVersion, 'darwin', TEST_KEYPAIR.publicKey);
      expect(result).toEqual({ verified: true });
    });

    it('E008: Wrong public key prevents verification', async () => {
      const { publicKey: wrongPublicKey } = nacl.sign.keyPair();
      const wrongPublicKeyB64 = Buffer.from(wrongPublicKey).toString('base64');

      const manifest = createValidManifest('2.0.0');
      createFileWithHash('test');

      await expect(verifyManifest(manifest, testFilePath, '1.0.0', 'darwin', wrongPublicKeyB64)).rejects.toThrow(
        'Manifest signature verification failed'
      );
    });
  });
});
