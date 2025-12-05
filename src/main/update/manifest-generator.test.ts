import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import nacl from 'tweetnacl';
import { detectPlatform, generateManifest } from './manifest-generator';

describe('detectPlatform', () => {
  describe('property: extension-based detection determinism', () => {
    it('should consistently detect dmg files as darwin/dmg', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('/')),
          (basename) => {
            const filename = `${basename}.dmg`;
            const result = detectPlatform(filename);
            expect(result).toEqual({ platform: 'darwin', type: 'dmg' });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should consistently detect zip files as darwin/zip', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('/')),
          (basename) => {
            const filename = `${basename}.zip`;
            const result = detectPlatform(filename);
            expect(result).toEqual({ platform: 'darwin', type: 'zip' });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should consistently detect AppImage files as linux/AppImage', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('/')),
          (basename) => {
            const filename = `${basename}.AppImage`;
            const result = detectPlatform(filename);
            expect(result).toEqual({ platform: 'linux', type: 'AppImage' });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should consistently detect exe files as win32/exe', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('/')),
          (basename) => {
            const filename = `${basename}.exe`;
            const result = detectPlatform(filename);
            expect(result).toEqual({ platform: 'win32', type: 'exe' });
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('property: case-insensitive extension matching', () => {
    it('should match dmg regardless of case', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('/')), (basename) => {
          const lowercase = detectPlatform(`${basename}.dmg`);
          const uppercase = detectPlatform(`${basename}.DMG`);
          const mixed = detectPlatform(`${basename}.DmG`);

          expect(lowercase).toBeDefined();
          expect(uppercase).toBeDefined();
          expect(mixed).toBeDefined();
          expect(lowercase).toEqual(uppercase);
          expect(uppercase).toEqual(mixed);
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('property: non-artifact files return undefined', () => {
    it('should return undefined for unknown extensions', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes('/')),
            fc.string({ minLength: 2, maxLength: 5 }).filter((s) => !/(dmg|zip|appimage|exe)$/i.test(s))
          ),
          ([basename, ext]) => {
            const result = detectPlatform(`${basename}.${ext}`);
            expect(result).toBeUndefined();
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('example: specific filenames from spec', () => {
    it('should detect SlimChat-1.0.0.dmg', () => {
      const result = detectPlatform('SlimChat-1.0.0.dmg');
      expect(result).toEqual({ platform: 'darwin', type: 'dmg' });
    });

    it('should detect SlimChat-1.0.0-x64.AppImage', () => {
      const result = detectPlatform('SlimChat-1.0.0-x64.AppImage');
      expect(result).toEqual({ platform: 'linux', type: 'AppImage' });
    });

    it('should return undefined for unknown.txt', () => {
      const result = detectPlatform('unknown.txt');
      expect(result).toBeUndefined();
    });
  });
});

describe('generateManifest', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const createKeyPair = () => {
    const keypair = nacl.sign.keyPair();
    const privateKeyBase64 = Buffer.from(keypair.secretKey).toString('base64');
    return { privateKeyBase64, publicKey: keypair.publicKey };
  };

  const createHashFunction = () => {
    return async (filePath: string): Promise<string> => {
      const content = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    };
  };

  describe('property: manifest structure validity', () => {
    it('should always have required fields', async () => {
      const { privateKeyBase64 } = createKeyPair();
      const hashFunction = createHashFunction();

      fs.writeFileSync(path.join(tempDir, 'app.dmg'), 'content');

      const manifest = await generateManifest(tempDir, '1.0.0', privateKeyBase64, hashFunction);

      expect(manifest).toHaveProperty('version');
      expect(manifest).toHaveProperty('artifacts');
      expect(manifest).toHaveProperty('createdAt');
      expect(manifest).toHaveProperty('signature');
    });
  });

  describe('property: artifact inclusion completeness', () => {
    it('should include all recognized artifact types', async () => {
      const { privateKeyBase64 } = createKeyPair();
      const hashFunction = createHashFunction();

      fs.writeFileSync(path.join(tempDir, 'app.dmg'), 'dmg');
      fs.writeFileSync(path.join(tempDir, 'app.zip'), 'zip');
      fs.writeFileSync(path.join(tempDir, 'app.AppImage'), 'appimage');
      fs.writeFileSync(path.join(tempDir, 'app.exe'), 'exe');

      const manifest = await generateManifest(tempDir, '1.0.0', privateKeyBase64, hashFunction);

      expect(manifest.artifacts).toHaveLength(4);
    });
  });

  describe('property: non-artifact files filtered', () => {
    it('should exclude non-artifact files', async () => {
      const { privateKeyBase64 } = createKeyPair();
      const hashFunction = createHashFunction();

      fs.writeFileSync(path.join(tempDir, 'app.dmg'), 'artifact');
      fs.writeFileSync(path.join(tempDir, 'README.md'), 'not');

      const manifest = await generateManifest(tempDir, '1.0.0', privateKeyBase64, hashFunction);

      expect(manifest.artifacts).toHaveLength(1);
      expect(manifest.artifacts[0].url).toBe('app.dmg');
    });
  });

  describe('property: SHA-256 hash correctness', () => {
    it('artifact hashes match computed SHA-256', async () => {
      const { privateKeyBase64 } = createKeyPair();
      const hashFunction = createHashFunction();

      const testContent = 'test content';
      fs.writeFileSync(path.join(tempDir, 'test.dmg'), testContent);

      const manifest = await generateManifest(tempDir, '1.0.0', privateKeyBase64, hashFunction);

      const expectedHash = crypto.createHash('sha256').update(testContent).digest('hex');
      expect(manifest.artifacts[0].sha256).toBe(expectedHash);
    });
  });

  describe('property: platform detection in artifacts', () => {
    it('all artifacts have correct platform', async () => {
      const { privateKeyBase64 } = createKeyPair();
      const hashFunction = createHashFunction();

      fs.writeFileSync(path.join(tempDir, 'app.dmg'), 'c');
      fs.writeFileSync(path.join(tempDir, 'app.AppImage'), 'c');
      fs.writeFileSync(path.join(tempDir, 'app.exe'), 'c');

      const manifest = await generateManifest(tempDir, '1.0.0', privateKeyBase64, hashFunction);

      const platformMap: { [key: string]: string } = {
        dmg: 'darwin',
        AppImage: 'linux',
        exe: 'win32',
      };

      for (const artifact of manifest.artifacts) {
        expect(artifact.platform).toBe(platformMap[artifact.type]);
      }
    });
  });

  describe('property: timestamp is valid ISO 8601', () => {
    it('createdAt is valid ISO 8601 format', async () => {
      const { privateKeyBase64 } = createKeyPair();
      const hashFunction = createHashFunction();

      fs.writeFileSync(path.join(tempDir, 'app.dmg'), 'content');

      const manifest = await generateManifest(tempDir, '1.0.0', privateKeyBase64, hashFunction);

      const date = new Date(manifest.createdAt);
      expect(date.toString()).not.toBe('Invalid Date');
      expect(manifest.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('property: signature verification', () => {
    it('signature can be verified with public key', async () => {
      const { privateKeyBase64, publicKey } = createKeyPair();
      const hashFunction = createHashFunction();

      fs.writeFileSync(path.join(tempDir, 'app.dmg'), 'content');

      const manifest = await generateManifest(tempDir, '1.0.0', privateKeyBase64, hashFunction);

      const unsigned = {
        version: manifest.version,
        artifacts: manifest.artifacts,
        createdAt: manifest.createdAt,
      };

      const message = Buffer.from(JSON.stringify(unsigned, null, 0), 'utf-8');
      const signature = Buffer.from(manifest.signature, 'base64');

      const isValid = nacl.sign.detached.verify(message, signature, publicKey);
      expect(isValid).toBe(true);
    });
  });

  describe('property: empty directory valid manifest', () => {
    it('directory with no artifacts produces empty manifest', async () => {
      const { privateKeyBase64 } = createKeyPair();
      const hashFunction = createHashFunction();

      const manifest = await generateManifest(tempDir, '1.0.0', privateKeyBase64, hashFunction);

      expect(manifest.artifacts).toHaveLength(0);
      expect(manifest.version).toBe('1.0.0');
      expect(manifest).toHaveProperty('signature');
    });
  });

  describe('property: invalid private key rejection', () => {
    it('invalid base64 key throws error', async () => {
      const hashFunction = createHashFunction();

      fs.writeFileSync(path.join(tempDir, 'app.dmg'), 'content');

      await expect(generateManifest(tempDir, '1.0.0', 'invalid!!!', hashFunction)).rejects.toThrow(
        'Invalid private key'
      );
    });
  });

  describe('example: complete workflow', () => {
    it('generates valid signed manifest', async () => {
      const { privateKeyBase64, publicKey } = createKeyPair();
      const hashFunction = createHashFunction();

      fs.writeFileSync(path.join(tempDir, 'SlimChat-1.0.0.dmg'), 'macos');
      fs.writeFileSync(path.join(tempDir, 'SlimChat-1.0.0-x64.AppImage'), 'linux');
      fs.writeFileSync(path.join(tempDir, 'SlimChat-1.0.0-x64.exe'), 'windows');
      fs.writeFileSync(path.join(tempDir, 'README.md'), 'notes');

      const manifest = await generateManifest(tempDir, '1.0.0', privateKeyBase64, hashFunction);

      expect(manifest.version).toBe('1.0.0');
      expect(manifest.artifacts).toHaveLength(3);

      const platforms = manifest.artifacts.map((a) => a.platform).sort();
      expect(platforms).toEqual(['darwin', 'linux', 'win32']);

      const unsigned = {
        version: manifest.version,
        artifacts: manifest.artifacts,
        createdAt: manifest.createdAt,
      };
      const message = Buffer.from(JSON.stringify(unsigned, null, 0), 'utf-8');
      const signature = Buffer.from(manifest.signature, 'base64');

      const isValid = nacl.sign.detached.verify(message, signature, publicKey);
      expect(isValid).toBe(true);
    });
  });
});
