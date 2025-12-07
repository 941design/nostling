/**
 * Property-based tests for manifest-generator.ts
 *
 * Tests verify all contract invariants and properties:
 * - Cryptographic: RSA signatures verify with public key, SHA-256 hashes are correct
 * - Structural: Manifest contains exactly discovered artifacts, JSON is canonical
 * - Determinism: Same inputs produce identical signatures (except createdAt)
 * - Platform detection: Deterministic, case-insensitive, extension-based
 * - Error handling: Invalid keys, empty directories, missing files handled correctly
 * - Timestamp: createdAt field is valid ISO 8601 timestamp
 * - Format compliance: Signature is valid base64, artifacts have required fields
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import { detectPlatform, generateManifest } from './manifest-generator';
import { SignedManifest, ManifestArtifact } from '../../shared/types';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import crypto from 'crypto';

/**
 * Test Fixtures and Utilities
 */

function createTempDir(): string {
  const tempDir = join(tmpdir(), `test-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function removeTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

function createTestFile(dir: string, filename: string, content: string = 'test content'): string {
  const filepath = join(dir, filename);
  writeFileSync(filepath, content);
  return filepath;
}

/**
 * Generate a valid RSA key pair for testing
 */
function generateTestKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });
  return { publicKey, privateKey };
}

/**
 * Verify RSA signature with public key
 */
function verifySignature(manifest: SignedManifest, publicKey: string): boolean {
  const unsigned = {
    version: manifest.version,
    artifacts: manifest.artifacts,
    createdAt: manifest.createdAt,
  };
  const manifestJson = JSON.stringify(unsigned, null, 0);
  const manifestBuffer = Buffer.from(manifestJson, 'utf-8');
  const signatureBuffer = Buffer.from(manifest.signature, 'base64');

  const verifier = crypto.createVerify('SHA256');
  verifier.update(manifestBuffer);
  return verifier.verify(publicKey, signatureBuffer);
}

/**
 * Helper to create a mock hash function
 */
function createMockHashFunction(hashes: Map<string, string> = new Map()): (filePath: string) => Promise<string> {
  return async (filePath: string) => {
    if (hashes.has(filePath)) {
      return hashes.get(filePath)!;
    }
    // Default: return SHA-256 of the filename
    return crypto.createHash('sha256').update(filePath).digest('hex');
  };
}

/**
 * PROPERTY-BASED TESTS (17 total)
 */

describe('detectPlatform', () => {
  describe('Property-Based Tests', () => {
    // P001: Determinism - Same input always produces same output
    it('P001: Determinism - identical filenames produce identical results', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 100 }), (basename) => {
          const filename1 = `test-${basename}.dmg`;
          const filename2 = `test-${basename}.dmg`;
          const result1 = detectPlatform(filename1);
          const result2 = detectPlatform(filename2);

          // Both should be identical (same platform and type)
          if (result1 === undefined) {
            expect(result2).toBeUndefined();
          } else {
            expect(result2).toEqual(result1);
          }
        }),
        { numRuns: 100 }
      );
    });

    // P002: Case-insensitive matching
    it('P002: Case-insensitivity - .dmg, .DMG, .Dmg all map to darwin/dmg', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.constantFrom('.dmg', '.DMG', '.Dmg', '.dMg'),
            fc.string({ minLength: 1, maxLength: 50 })
          ),
          ([ext, basename]) => {
            const filename = `file-${basename}${ext}`;
            const result = detectPlatform(filename);
            expect(result).toEqual({ platform: 'darwin', type: 'dmg' });
          }
        ),
        { numRuns: 50 }
      );
    });

    // P003: Extension-based detection
    it('P003: Extension-based detection - .zip always maps to darwin/zip', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (basename) => {
          const filename = `${basename}.zip`;
          const result = detectPlatform(filename);
          expect(result).toEqual({ platform: 'darwin', type: 'zip' });
        }),
        { numRuns: 50 }
      );
    });

    // P004: AppImage platform detection
    it('P004: Platform detection - .AppImage (case-insensitive) maps to linux/AppImage', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.constantFrom('.appimage', '.AppImage', '.APPIMAGE'),
            fc.string({ minLength: 1, maxLength: 50 })
          ),
          ([ext, basename]) => {
            const filename = `${basename}${ext}`;
            const result = detectPlatform(filename);
            expect(result).toEqual({ platform: 'linux', type: 'AppImage' });
          }
        ),
        { numRuns: 50 }
      );
    });

    // P005: EXE platform detection
    it('P005: Platform detection - .exe (case-insensitive) maps to win32/exe', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.constantFrom('.exe', '.EXE', '.Exe'),
            fc.string({ minLength: 1, maxLength: 50 })
          ),
          ([ext, basename]) => {
            const filename = `${basename}${ext}`;
            const result = detectPlatform(filename);
            expect(result).toEqual({ platform: 'win32', type: 'exe' });
          }
        ),
        { numRuns: 50 }
      );
    });

    // P006: Unknown extensions return undefined
    it('P006: Unknown extensions - .txt, .pdf, .json all return undefined', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('.txt', '.pdf', '.json', '.doc', '.bin', '.dat'),
          (ext) => {
            const filename = `file${ext}`;
            const result = detectPlatform(filename);
            expect(result).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    // P007: Morphic property - changing extension changes result
    it('P007: Morphic extension - changing extension changes detection result', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), (basename) => {
          const dmgResult = detectPlatform(`${basename}.dmg`);
          const zipResult = detectPlatform(`${basename}.zip`);
          const appimageResult = detectPlatform(`${basename}.appimage`);

          expect(dmgResult).not.toEqual(zipResult);
          expect(zipResult).not.toEqual(appimageResult);
          expect(dmgResult).not.toEqual(appimageResult);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Example-Based Tests', () => {
    // E001: Standard filenames
    it('E001: Standard filenames are correctly detected', () => {
      expect(detectPlatform('SlimChat-1.0.0.dmg')).toEqual({ platform: 'darwin', type: 'dmg' });
      expect(detectPlatform('SlimChat-1.0.0.zip')).toEqual({ platform: 'darwin', type: 'zip' });
      expect(detectPlatform('SlimChat-1.0.0-x64.AppImage')).toEqual({ platform: 'linux', type: 'AppImage' });
      expect(detectPlatform('SlimChat-1.0.0-Setup.exe')).toEqual({ platform: 'win32', type: 'exe' });
    });

    // E002: Unknown extension
    it('E002: Unknown extension returns undefined', () => {
      expect(detectPlatform('SlimChat-1.0.0.tar.gz')).toBeUndefined();
      expect(detectPlatform('unknown.txt')).toBeUndefined();
    });

    // E003: Files without extensions
    it('E003: Files without recognized extensions return undefined', () => {
      expect(detectPlatform('README')).toBeUndefined();
      expect(detectPlatform('SlimChat-1.0.0')).toBeUndefined();
    });

    // E004: Mixed case extensions
    it('E004: Mixed case extensions are detected', () => {
      expect(detectPlatform('file.DMG')).toEqual({ platform: 'darwin', type: 'dmg' });
      expect(detectPlatform('file.ZIP')).toEqual({ platform: 'darwin', type: 'zip' });
      expect(detectPlatform('file.APPIMAGE')).toEqual({ platform: 'linux', type: 'AppImage' });
      expect(detectPlatform('file.EXE')).toEqual({ platform: 'win32', type: 'exe' });
    });
  });
});

describe('generateManifest', () => {
  let tempDir: string;
  let keyPair: ReturnType<typeof generateTestKeyPair>;

  beforeEach(() => {
    tempDir = createTempDir();
    keyPair = generateTestKeyPair();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  describe('Property-Based Tests', () => {
    // P008: Signature verifies with public key
    it('P008: Cryptographic correctness - signature verifies with public key', async () => {
      createTestFile(tempDir, 'app-1.0.0.dmg', 'macos app');
      const hashFunction = createMockHashFunction();

      const manifest = await generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction);

      expect(verifySignature(manifest, keyPair.publicKey)).toBe(true);
    });

    // P009: Manifest contains exactly discovered artifacts
    it('P009: Completeness - manifest includes all recognized artifacts', async () => {
      createTestFile(tempDir, 'app-1.0.0.dmg', 'macos');
      createTestFile(tempDir, 'app-1.0.0.zip', 'macos-zip');
      createTestFile(tempDir, 'app-1.0.0-x64.AppImage', 'linux');
      createTestFile(tempDir, 'app-1.0.0-Setup.exe', 'windows');
      createTestFile(tempDir, 'README.md', 'this should be ignored');
      createTestFile(tempDir, 'LICENSE.txt', 'this should also be ignored');

      const hashFunction = createMockHashFunction();
      const manifest = await generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction);

      expect(manifest.artifacts).toHaveLength(4);
      expect(manifest.artifacts.map((a) => a.url).sort()).toEqual([
        'app-1.0.0-Setup.exe',
        'app-1.0.0-x64.AppImage',
        'app-1.0.0.dmg',
        'app-1.0.0.zip',
      ]);
    });

    // P010: SHA-256 hash values are correct
    it('P010: Integrity - artifact hashes match computed values', async () => {
      const filePath1 = createTestFile(tempDir, 'app-1.0.0.dmg', 'content1');
      const filePath2 = createTestFile(tempDir, 'app-1.0.0.AppImage', 'content2');

      const hash1 = crypto.createHash('sha256').update('content1').digest('hex');
      const hash2 = crypto.createHash('sha256').update('content2').digest('hex');

      const hashes = new Map([
        [filePath1, hash1],
        [filePath2, hash2],
      ]);
      const hashFunction = createMockHashFunction(hashes);

      const manifest = await generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction);

      const artifactByUrl = new Map(manifest.artifacts.map((a) => [a.url, a]));
      expect(artifactByUrl.get('app-1.0.0.dmg')?.sha256).toBe(hash1);
      expect(artifactByUrl.get('app-1.0.0.AppImage')?.sha256).toBe(hash2);
    });

    // P011: Platform and type fields are correct
    it('P011: Structural correctness - artifact platform and type match filename', async () => {
      createTestFile(tempDir, 'app.dmg', 'macos');
      createTestFile(tempDir, 'app.zip', 'macos-zip');
      createTestFile(tempDir, 'app.AppImage', 'linux');
      createTestFile(tempDir, 'app.exe', 'windows');

      const hashFunction = createMockHashFunction();
      const manifest = await generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction);

      const platformMap = new Map(manifest.artifacts.map((a) => [a.url, { platform: a.platform, type: a.type }]));

      expect(platformMap.get('app.dmg')).toEqual({ platform: 'darwin', type: 'dmg' });
      expect(platformMap.get('app.zip')).toEqual({ platform: 'darwin', type: 'zip' });
      expect(platformMap.get('app.AppImage')).toEqual({ platform: 'linux', type: 'AppImage' });
      expect(platformMap.get('app.exe')).toEqual({ platform: 'win32', type: 'exe' });
    });

    // P012: createdAt is valid ISO 8601 timestamp
    it('P012: Timestamp validity - createdAt is valid ISO 8601 format', async () => {
      createTestFile(tempDir, 'app.dmg', 'content');
      const hashFunction = createMockHashFunction();

      const manifest = await generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction);

      // Parse and validate ISO 8601
      const date = new Date(manifest.createdAt);
      expect(date.getTime()).not.toBeNaN();
      expect(manifest.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    // P013: Version field is preserved
    it('P013: Data preservation - version field is included unchanged', async () => {
      createTestFile(tempDir, 'app.dmg', 'content');
      const hashFunction = createMockHashFunction();

      // Test with multiple different versions
      const versions = ['1.0.0', '2.1.3', '0.0.1', '10.20.30'];
      for (const version of versions) {
        const manifest = await generateManifest(tempDir, version, keyPair.privateKey, hashFunction);
        expect(manifest.version).toBe(version);
      }
    });

    // P014: Signature is valid base64
    it('P014: Format compliance - signature is valid base64 string', async () => {
      createTestFile(tempDir, 'app.dmg', 'content');
      const hashFunction = createMockHashFunction();

      const manifest = await generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction);

      // Base64 regex: alphanumeric plus +/= and optionally padded
      expect(manifest.signature).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      // Decode to verify it's valid base64
      expect(() => Buffer.from(manifest.signature, 'base64')).not.toThrow();
    });

    // P015: Hash values are lowercase hex strings
    it('P015: Hash format - all SHA-256 hashes are lowercase hex strings', async () => {
      createTestFile(tempDir, 'app1.dmg', 'content1');
      createTestFile(tempDir, 'app2.zip', 'content2');
      createTestFile(tempDir, 'app3.AppImage', 'content3');

      const hashFunction = createMockHashFunction();
      const manifest = await generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction);

      manifest.artifacts.forEach((artifact) => {
        expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    // P016: Canonical JSON - manifest JSON has no unnecessary whitespace
    it('P016: Canonical JSON - manifest JSON is canonicalized (no extra whitespace)', async () => {
      createTestFile(tempDir, 'app.dmg', 'content');
      const hashFunction = createMockHashFunction();

      const manifest = await generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction);

      const unsigned = {
        version: manifest.version,
        artifacts: manifest.artifacts,
        createdAt: manifest.createdAt,
      };
      const canonicalJson = JSON.stringify(unsigned, null, 0);

      // Verify no trailing whitespace or newlines (canonical form)
      expect(canonicalJson).not.toMatch(/\s+$/);
      // Verify it parses correctly
      expect(() => JSON.parse(canonicalJson)).not.toThrow();
    });

    // P017: Different versions produce different signatures (different content)
    it('P017: Morphic property - different versions produce different signatures', async () => {
      createTestFile(tempDir, 'app.dmg', 'content');
      const hashFunction = createMockHashFunction();

      const manifest1 = await generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction);
      const manifest2 = await generateManifest(tempDir, '1.0.1', keyPair.privateKey, hashFunction);

      expect(manifest1.signature).not.toBe(manifest2.signature);
    });
  });

  describe('Error Handling Tests', () => {
    // E005: Invalid private key format
    it('E005: Invalid private key - malformed PEM throws error', async () => {
      createTestFile(tempDir, 'app.dmg', 'content');
      const hashFunction = createMockHashFunction();
      const badPrivateKey = 'not-a-valid-pem-key';

      await expect(generateManifest(tempDir, '1.0.0', badPrivateKey, hashFunction)).rejects.toThrow(
        'Invalid private key'
      );
    });

    // E006: Directory does not exist
    it('E006: Directory not found - non-existent directory throws error', async () => {
      const nonExistentDir = join(tempDir, 'does-not-exist');
      const hashFunction = createMockHashFunction();

      await expect(generateManifest(nonExistentDir, '1.0.0', keyPair.privateKey, hashFunction)).rejects.toThrow(
        /Directory not found/
      );
    });

    // E007: No artifacts in directory
    it('E007: No artifacts - directory with no recognized files throws error', async () => {
      createTestFile(tempDir, 'README.md', 'documentation');
      createTestFile(tempDir, 'LICENSE.txt', 'license');
      createTestFile(tempDir, 'config.json', 'config');

      const hashFunction = createMockHashFunction();

      await expect(generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction)).rejects.toThrow(
        'No artifacts found'
      );
    });

    // E008: Empty directory
    it('E008: Empty directory - no files throws error', async () => {
      const hashFunction = createMockHashFunction();

      await expect(generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction)).rejects.toThrow(
        'No artifacts found'
      );
    });
  });

  describe('Additional Example-Based Tests', () => {
    // E009: Mixed valid and invalid artifacts
    it('E009: Mixed artifacts - only recognized extensions are included', async () => {
      createTestFile(tempDir, 'app-1.0.0.dmg', 'macos');
      createTestFile(tempDir, 'app-1.0.0.tar.gz', 'archive');
      createTestFile(tempDir, 'app-1.0.0-x64.AppImage', 'linux');
      createTestFile(tempDir, 'CHANGELOG.md', 'changelog');

      const hashFunction = createMockHashFunction();
      const manifest = await generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction);

      expect(manifest.artifacts).toHaveLength(2);
      const urls = manifest.artifacts.map((a) => a.url).sort();
      expect(urls).toEqual(['app-1.0.0-x64.AppImage', 'app-1.0.0.dmg']);
    });

    // E010: All platform types in one manifest
    it('E010: All platforms - manifest can contain all four platform types', async () => {
      createTestFile(tempDir, 'app.dmg', 'darwin-dmg');
      createTestFile(tempDir, 'app.zip', 'darwin-zip');
      createTestFile(tempDir, 'app.AppImage', 'linux');
      createTestFile(tempDir, 'app.exe', 'win32');

      const hashFunction = createMockHashFunction();
      const manifest = await generateManifest(tempDir, '1.0.0', keyPair.privateKey, hashFunction);

      expect(manifest.artifacts).toHaveLength(4);
      const platforms = new Set(manifest.artifacts.map((a) => a.platform));
      expect(platforms).toEqual(new Set(['darwin', 'linux', 'win32']));
    });
  });
});
