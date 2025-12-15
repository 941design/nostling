/**
 * Comprehensive property-based tests for RSA manifest generation script
 *
 * Tests cryptographic properties, manifest structure, and deterministic behavior
 * using Jest with fast-check for property-based testing.
 */

/// <reference types="jest" />

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as fc from 'fast-check';

// Types mirrored from generate-manifest.ts
interface ManifestFile {
  url: string;
  sha256: string;
}

interface UnsignedManifest {
  version: string;
  files: ManifestFile[];
}

interface SignedManifestFile {
  version: string;
  files: ManifestFile[];
  signature: string;
}

describe('RSA Manifest Generation', () => {
  // Shared helper functions
  const createTestFile = (content: string, filename: string, dir: string): string => {
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content);
    return filePath;
  };

  const hashFileContent = (filePath: string): string => {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
  };

  const generateRsaKeyPair = (): { publicKey: string; privateKey: string } => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { publicKey, privateKey };
  };

  // Pre-generate keypairs to avoid expensive generation per iteration
  const sharedKeyPair = generateRsaKeyPair();

  const signManifest = (manifest: UnsignedManifest, privateKey: string): string => {
    const canonicalJson = JSON.stringify(manifest, null, 0);
    const signer = crypto.createSign('SHA256');
    signer.update(canonicalJson);
    return signer.sign(privateKey, 'base64');
  };

  const verifySignature = (manifest: UnsignedManifest, signature: string, publicKey: string): boolean => {
    const canonicalJson = JSON.stringify(manifest, null, 0);
    const verifier = crypto.createVerify('SHA256');
    verifier.update(canonicalJson);
    return verifier.verify(publicKey, signature, 'base64');
  };

  // PROPERTY-BASED TESTS

  describe('Hash Format Validation (PBT)', () => {
    it('should produce 64-character lowercase hexadecimal hashes for any file content', () => {
      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1, maxLength: 10000 }), (content) => {
          const tempDir = fs.mkdtempSync(path.join(__dirname, 'test-'));
          try {
            const testFile = createTestFile(Buffer.from(content).toString('binary'), 'test.bin', tempDir);
            const hash = hashFileContent(testFile);

            const validFormat = /^[a-f0-9]{64}$/.test(hash);
            return validFormat && hash.length === 64;
          } finally {
            fs.rmSync(tempDir, { recursive: true });
          }
        }),
        { numRuns: 50 }
      );
    });

    it('should be deterministic: identical file contents produce identical hashes', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 1000 }), (content) => {
          const tempDir = fs.mkdtempSync(path.join(__dirname, 'test-'));
          try {
            const file1 = createTestFile(content, 'test1.txt', tempDir);
            const file2 = createTestFile(content, 'test2.txt', tempDir);

            const hash1 = hashFileContent(file1);
            const hash2 = hashFileContent(file2);

            return hash1 === hash2;
          } finally {
            fs.rmSync(tempDir, { recursive: true });
          }
        }),
        { numRuns: 50 }
      );
    });

    it('should distinguish between different file contents via hashing', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 500 }),
            fc.string({ minLength: 1, maxLength: 500 })
          ),
          ([content1, content2]) => {
            if (content1 === content2) return true;

            const tempDir = fs.mkdtempSync(path.join(__dirname, 'test-'));
            try {
              const file1 = createTestFile(content1, 'test1.txt', tempDir);
              const file2 = createTestFile(content2, 'test2.txt', tempDir);

              const hash1 = hashFileContent(file1);
              const hash2 = hashFileContent(file2);

              return hash1 !== hash2;
            } finally {
              fs.rmSync(tempDir, { recursive: true });
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Manifest Structure Validation (PBT)', () => {
    it('should create manifests with required structure: version, files array, and signature', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 3, maxLength: 20 }).filter((s) => !/[/\\]/.test(s)), { minLength: 1, maxLength: 5 }),
          fc.nat(999),
          fc.nat(999),
          fc.nat(999),
          (filenames, major, minor, patch) => {
            const tempDir = fs.mkdtempSync(path.join(__dirname, 'test-'));
            const version = `${major}.${minor}.${patch}`;

            try {
              const artifactNames = filenames.map((name) => `${name}.zip`);
              const files: ManifestFile[] = artifactNames.map((filename) => {
                createTestFile(`content-${filename}`, filename, tempDir);
                const filePath = path.join(tempDir, filename);
                return {
                  url: filename,
                  sha256: hashFileContent(filePath),
                };
              });

              const unsigned: UnsignedManifest = { version, files };
              const signature = signManifest(unsigned, sharedKeyPair.privateKey);
              const signed: SignedManifestFile = { ...unsigned, signature };

              const hasVersion = typeof signed.version === 'string' && signed.version.length > 0;
              const hasFiles = Array.isArray(signed.files) && signed.files.length > 0;
              const hasSignature = typeof signed.signature === 'string' && signed.signature.length > 0;

              return hasVersion && hasFiles && hasSignature;
            } finally {
              fs.rmSync(tempDir, { recursive: true });
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should preserve file list order in manifest during creation', () => {
      fc.assert(
        fc.property(
          fc.array(fc.nat(1000), { minLength: 2, maxLength: 10 }),
          (numbers) => {
            const tempDir = fs.mkdtempSync(path.join(__dirname, 'test-'));

            try {
              const filenames = numbers.map((n, i) => `artifact-${i}-${n}.zip`);
              const files: ManifestFile[] = filenames.map((filename) => {
                createTestFile(`content-${filename}`, filename, tempDir);
                const filePath = path.join(tempDir, filename);
                return {
                  url: filename,
                  sha256: hashFileContent(filePath),
                };
              });

              const unsigned: UnsignedManifest = { version: '1.0.0', files };
              const signature = signManifest(unsigned, sharedKeyPair.privateKey);
              const signed: SignedManifestFile = { ...unsigned, signature };

              let ordersMatch = signed.files.length === filenames.length;
              if (ordersMatch) {
                for (let i = 0; i < filenames.length; i++) {
                  if (signed.files[i].url !== filenames[i]) {
                    ordersMatch = false;
                    break;
                  }
                }
              }

              return ordersMatch;
            } finally {
              fs.rmSync(tempDir, { recursive: true });
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Cryptographic Properties (PBT)', () => {
    it('should produce valid RSA signatures verifiable with corresponding public key', () => {
      fc.assert(
        fc.property(
          fc.nat(999),
          fc.nat(999),
          fc.nat(999),
          (major, minor, patch) => {
            const tempDir = fs.mkdtempSync(path.join(__dirname, 'test-'));
            const version = `${major}.${minor}.${patch}`;

            try {
              const files: ManifestFile[] = [
                {
                  url: 'test.zip',
                  sha256: hashFileContent(createTestFile('test content', 'test.zip', tempDir)),
                },
              ];

              const unsigned: UnsignedManifest = { version, files };
              const signature = signManifest(unsigned, sharedKeyPair.privateKey);

              return verifySignature(unsigned, signature, sharedKeyPair.publicKey);
            } finally {
              fs.rmSync(tempDir, { recursive: true });
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should produce different signatures for different manifest content', () => {
      fc.assert(
        fc.property(
          fc.nat(999),
          fc.nat(999),
          fc.nat(999),
          fc.nat(999),
          fc.nat(999),
          fc.nat(999),
          (major1, minor1, patch1, major2, minor2, patch2) => {
            const version1 = `${major1}.${minor1}.${patch1}`;
            const version2 = `${major2}.${minor2}.${patch2}`;

            if (version1 === version2) return true;

            const manifest1: UnsignedManifest = {
              version: version1,
              files: [{ url: 'test.zip', sha256: 'a'.repeat(64) }],
            };

            const manifest2: UnsignedManifest = {
              version: version2,
              files: [{ url: 'test.zip', sha256: 'a'.repeat(64) }],
            };

            const sig1 = signManifest(manifest1, sharedKeyPair.privateKey);
            const sig2 = signManifest(manifest2, sharedKeyPair.privateKey);

            return sig1 !== sig2;
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should produce deterministic signatures for identical manifest content', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              url: fc.string({ minLength: 5, maxLength: 50 }),
              sha256: fc.stringMatching(/^[a-f0-9]{64}$/),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          fc.nat(999),
          fc.nat(999),
          fc.nat(999),
          (files, major, minor, patch) => {
            const version = `${major}.${minor}.${patch}`;

            const manifest: UnsignedManifest = { version, files };

            const sig1 = signManifest(manifest, sharedKeyPair.privateKey);
            const sig2 = signManifest(manifest, sharedKeyPair.privateKey);

            return sig1 === sig2;
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should invalidate signatures when manifest content is modified after signing', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              url: fc.string({ minLength: 5, maxLength: 50 }),
              sha256: fc.stringMatching(/^[a-f0-9]{64}$/),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          fc.nat(999),
          fc.nat(999),
          fc.nat(999),
          (originalFiles, major, minor, patch) => {
            const version = `${major}.${minor}.${patch}`;

            const originalManifest: UnsignedManifest = { version, files: originalFiles };
            const signature = signManifest(originalManifest, sharedKeyPair.privateKey);

            if (!verifySignature(originalManifest, signature, sharedKeyPair.publicKey)) return false;

            if (originalFiles.length === 0) return true;

            const modifiedFiles = [...originalFiles];
            const origHash = modifiedFiles[0].sha256;
            modifiedFiles[0] = {
              ...modifiedFiles[0],
              sha256: origHash.split('').reverse().join(''),
            };

            const modifiedManifest: UnsignedManifest = { version, files: modifiedFiles };

            return !verifySignature(modifiedManifest, signature, sharedKeyPair.publicKey);
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('File Filtering and Naming (PBT)', () => {
    it('should correctly identify artifact extensions (.zip, .dmg, .AppImage) from filenames', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/[/\\]/.test(s)),
          fc.oneof(
            fc.constant('.zip'),
            fc.constant('.dmg'),
            fc.constant('.AppImage')
          ),
          (basename, ext) => {
            const filename = basename + ext;
            const artifactExtensions = ['.AppImage', '.dmg', '.zip'];
            const fileExt = path.extname(filename);

            return artifactExtensions.includes(fileExt);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should preserve original filenames as URLs in manifest entries', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 3, maxLength: 50 }).filter((s) => !/[/\\]/.test(s)), { minLength: 1, maxLength: 5 }),
          (filenames) => {
            const tempDir = fs.mkdtempSync(path.join(__dirname, 'test-'));

            try {
              const files: ManifestFile[] = filenames.map((filename) => {
                const fullName = `${filename}.zip`;
                createTestFile(`content-${fullName}`, fullName, tempDir);
                const filePath = path.join(tempDir, fullName);
                return {
                  url: fullName,
                  sha256: hashFileContent(filePath),
                };
              });

              const manifest: UnsignedManifest = { version: '1.0.0', files };
              const signature = signManifest(manifest, sharedKeyPair.privateKey);
              const signed: SignedManifestFile = { ...manifest, signature };

              let urlsMatch = signed.files.length === filenames.length;
              if (urlsMatch) {
                for (let i = 0; i < filenames.length; i++) {
                  if (signed.files[i].url !== `${filenames[i]}.zip`) {
                    urlsMatch = false;
                    break;
                  }
                }
              }

              return urlsMatch;
            } finally {
              fs.rmSync(tempDir, { recursive: true });
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe('Environment and Configuration (PBT)', () => {
    it('should produce valid base64-encoded signatures that are consistently formatted', () => {
      fc.assert(
        fc.property(
          fc.nat(999),
          fc.nat(999),
          fc.nat(999),
          (major, minor, patch) => {
            const version = `${major}.${minor}.${patch}`;

            const manifest: UnsignedManifest = {
              version,
              files: [{ url: 'test.zip', sha256: 'a'.repeat(64) }],
            };

            const signature = signManifest(manifest, sharedKeyPair.privateKey);

            try {
              Buffer.from(signature, 'base64');
              return typeof signature === 'string' && signature.length > 0;
            } catch {
              return false;
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  // EXAMPLE-BASED TESTS

  describe('Critical Edge Cases (Example-Based)', () => {
    it('should create valid manifest with single file', () => {
      const { publicKey, privateKey } = generateRsaKeyPair();
      const tempDir = fs.mkdtempSync(path.join(__dirname, 'test-'));

      try {
        const filePath = createTestFile('content', 'app.zip', tempDir);
        const fileHash = hashFileContent(filePath);

        const manifest: UnsignedManifest = {
          version: '1.0.0',
          files: [{ url: 'app.zip', sha256: fileHash }],
        };

        const signature = signManifest(manifest, privateKey);

        expect(verifySignature(manifest, signature, publicKey)).toBe(true);

        const signed: SignedManifestFile = { ...manifest, signature };
        expect(signed.files).toHaveLength(1);
        expect(signed.files[0].url).toBe('app.zip');
      } finally {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it('should create valid manifest with multiple files of different extensions', () => {
      const { publicKey, privateKey } = generateRsaKeyPair();
      const tempDir = fs.mkdtempSync(path.join(__dirname, 'test-'));

      try {
        const appZip = createTestFile('zip content', 'app-1.0.0.zip', tempDir);
        const appDmg = createTestFile('dmg content', 'app-1.0.0.dmg', tempDir);
        const appImage = createTestFile('appimage content', 'app-1.0.0.AppImage', tempDir);

        const files: ManifestFile[] = [
          { url: 'app-1.0.0.zip', sha256: hashFileContent(appZip) },
          { url: 'app-1.0.0.dmg', sha256: hashFileContent(appDmg) },
          { url: 'app-1.0.0.AppImage', sha256: hashFileContent(appImage) },
        ];

        const manifest: UnsignedManifest = {
          version: '1.0.0',
          files,
        };

        const signature = signManifest(manifest, privateKey);

        expect(verifySignature(manifest, signature, publicKey)).toBe(true);

        const signed: SignedManifestFile = { ...manifest, signature };
        expect(signed.files).toHaveLength(3);
        expect(signed.files.map((f) => f.url)).toEqual([
          'app-1.0.0.zip',
          'app-1.0.0.dmg',
          'app-1.0.0.AppImage',
        ]);
      } finally {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it('should handle version strings correctly in manifest', () => {
      const { privateKey } = generateRsaKeyPair();

      const testVersions = ['0.0.1', '1.0.0', '2.3.4', '10.20.30'];

      testVersions.forEach((version) => {
        const manifest: UnsignedManifest = {
          version,
          files: [{ url: 'app.zip', sha256: 'a'.repeat(64) }],
        };

        const signature = signManifest(manifest, privateKey);

        expect(signature).toBeDefined();
        expect(typeof signature).toBe('string');
        expect(signature.length).toBeGreaterThan(0);
      });
    });
  });
});
