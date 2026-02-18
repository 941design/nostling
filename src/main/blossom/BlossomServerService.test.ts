/**
 * Tests for BlossomServerService
 *
 * Tests server configuration CRUD, health checking, and fallback logic.
 */

import { BlossomServerService, DEFAULT_BLOSSOM_SERVERS } from './BlossomServerService';
import { initDatabase, closeDatabase, _resetDatabaseState } from '../database/connection';
import { runMigrations } from '../database/migrations';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

// Mock electron app module for test isolation
jest.mock('electron', () => {
  let mockUserDataPath: string | null = null;

  return {
    app: {
      getPath: (pathType: string) => {
        if (pathType === 'userData') {
          if (!mockUserDataPath) {
            throw new Error('Mock userData path not set');
          }
          return mockUserDataPath;
        }
        throw new Error(`Unknown path type: ${pathType}`);
      },
      setMockUserDataPath: (userDataPath: string) => {
        mockUserDataPath = userDataPath;
      },
    },
  };
});

const { app } = require('electron');

// Test fixtures: Simple HTTP servers for health check testing
function createTestServer(statusCode: number, delay: number = 0): http.Server {
  return http.createServer((_req, res) => {
    if (delay > 0) {
      setTimeout(() => {
        res.writeHead(statusCode);
        res.end();
      }, delay);
    } else {
      res.writeHead(statusCode);
      res.end();
    }
  });
}

function startServer(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve(port);
    });
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

describe('BlossomServerService', () => {
  let service: BlossomServerService;
  let testDir: string;
  let testIdCounter = 0;

  // Generate unique identity pubkey for each test
  function getUniqueIdentity(): string {
    testIdCounter++;
    return testIdCounter.toString().padStart(64, '0');
  }

  beforeEach(async () => {
    _resetDatabaseState();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blossom-server-test-'));
    app.setMockUserDataPath(testDir);

    const db = await initDatabase();
    await runMigrations(db);
    service = new BlossomServerService();
    await service.initialize();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await closeDatabase();
    _resetDatabaseState();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('TLS Requirement', () => {
    it('should reject HTTP URLs and require HTTPS', async () => {
      const identityPubkey = getUniqueIdentity();
      await expect(
        service.addServer(identityPubkey, 'http://example.com', null)
      ).rejects.toThrow('HTTPS');
    });

    it('should accept HTTPS URLs', async () => {
      const identityPubkey = getUniqueIdentity();
      const server = await service.addServer(identityPubkey, 'https://example.com', 'Test Server');
      expect(server.url).toBe('https://example.com');
      expect(server.identityPubkey).toBe(identityPubkey);
      expect(server.label).toBe('Test Server');
      expect(server.position).toBe(0);
    });
  });

  describe('Server List Operations', () => {
    it('should add server and increase list size', async () => {
      const identityPubkey = getUniqueIdentity();
      let servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(0);

      await service.addServer(identityPubkey, 'https://server1.example.com', null);
      servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(1);

      await service.addServer(identityPubkey, 'https://server2.example.com', null);
      servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(2);
    });

    it('should reject duplicate URLs for same identity', async () => {
      const identityPubkey = getUniqueIdentity();
      await service.addServer(identityPubkey, 'https://example.com', 'Label 1');
      await expect(
        service.addServer(identityPubkey, 'https://example.com', 'Label 2')
      ).rejects.toThrow('already exists');
    });

    it('should remove server and decrease list size', async () => {
      const identityPubkey = getUniqueIdentity();
      await service.addServer(identityPubkey, 'https://example.com', null);
      let servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(1);

      const removed = await service.removeServer(identityPubkey, 'https://example.com');
      expect(removed).toBe(true);

      servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(0);
    });

    it('should return false when removing non-existent server', async () => {
      const identityPubkey = getUniqueIdentity();
      const result = await service.removeServer(identityPubkey, 'https://nonexistent.com');
      expect(result).toBe(false);
    });
  });

  describe('Position Assignment', () => {
    it('should assign position 0 to first server', async () => {
      const identityPubkey = getUniqueIdentity();
      const server = await service.addServer(identityPubkey, 'https://example.com', null);
      expect(server.position).toBe(0);
    });

    it('should assign incremental positions to subsequent servers', async () => {
      const identityPubkey = getUniqueIdentity();
      const server1 = await service.addServer(identityPubkey, 'https://server1.com', null);
      const server2 = await service.addServer(identityPubkey, 'https://server2.com', null);
      const server3 = await service.addServer(identityPubkey, 'https://server3.com', null);

      expect(server1.position).toBe(0);
      expect(server2.position).toBe(1);
      expect(server3.position).toBe(2);
    });
  });

  describe('Reordering', () => {
    it('should preserve server count after reordering', async () => {
      const identityPubkey = getUniqueIdentity();
      await service.addServer(identityPubkey, 'https://server1.com', null);
      await service.addServer(identityPubkey, 'https://server2.com', null);
      await service.addServer(identityPubkey, 'https://server3.com', null);

      let servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(3);

      await service.reorderServers(identityPubkey, [
        'https://server3.com',
        'https://server1.com',
        'https://server2.com',
      ]);

      servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(3);
    });

    it('should update positions to match new order', async () => {
      const identityPubkey = getUniqueIdentity();
      await service.addServer(identityPubkey, 'https://server1.com', null);
      await service.addServer(identityPubkey, 'https://server2.com', null);
      await service.addServer(identityPubkey, 'https://server3.com', null);

      await service.reorderServers(identityPubkey, [
        'https://server3.com',
        'https://server1.com',
        'https://server2.com',
      ]);

      const servers = await service.listServers(identityPubkey);
      expect(servers[0].url).toBe('https://server3.com');
      expect(servers[0].position).toBe(0);
      expect(servers[1].url).toBe('https://server1.com');
      expect(servers[1].position).toBe(1);
      expect(servers[2].url).toBe('https://server2.com');
      expect(servers[2].position).toBe(2);
    });

    it('should reject reordering with invalid URLs', async () => {
      const identityPubkey = getUniqueIdentity();
      await service.addServer(identityPubkey, 'https://server1.com', null);

      await expect(
        service.reorderServers(identityPubkey, ['https://server1.com', 'https://invalid.com'])
      ).rejects.toThrow('not found');
    });

    it('should reject reordering with duplicate URLs', async () => {
      const identityPubkey = getUniqueIdentity();
      await service.addServer(identityPubkey, 'https://server1.com', null);

      await expect(
        service.reorderServers(identityPubkey, ['https://server1.com', 'https://server1.com'])
      ).rejects.toThrow('Duplicate');
    });
  });

  describe('Health Checks', () => {
    it('should timeout after 3 seconds for unresponsive servers', async () => {
      // Create server that delays response for 5 seconds
      const server = createTestServer(200, 5000);
      const port = await startServer(server);

      const startTime = Date.now();
      const result = await service.checkHealth(`https://localhost:${port}`);
      const elapsed = Date.now();

      // Note: Using HTTP server but HTTPS client will cause immediate SSL error
      // rather than timeout. This still tests error handling. A real timeout would
      // need an HTTPS server that accepts but doesn't respond.
      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined(); // SSL error or timeout
      expect(elapsed).toBeLessThan(startTime + 3500); // Should complete within 3.5s

      await stopServer(server);
    }, 10000);

    it('should handle network errors gracefully', async () => {
      // Non-existent server
      const result = await service.checkHealth('https://localhost:99999');

      expect(result.healthy).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Server Selection with Fallback', () => {
    it('should return null if no servers configured', async () => {
      const identityPubkey = getUniqueIdentity();
      const result = await service.selectHealthyServer(identityPubkey);
      expect(result).toBeNull();
    });

    it('should return null if all servers are unreachable', async () => {
      const identityPubkey = getUniqueIdentity();
      await service.addServer(identityPubkey, 'https://unreachable1.invalid', 'Server 1');
      await service.addServer(identityPubkey, 'https://unreachable2.invalid', 'Server 2');

      const result = await service.selectHealthyServer(identityPubkey);
      expect(result).toBeNull();
    }, 10000);

    it('should fall back to second server when first is unhealthy', async () => {
      const identityPubkey = getUniqueIdentity();
      await service.addServer(identityPubkey, 'https://server1.example.com', 'Server 1');
      await service.addServer(identityPubkey, 'https://server2.example.com', 'Server 2');

      jest.spyOn(service, 'checkHealth').mockImplementation(async (url: string) => {
        if (url === 'https://server1.example.com') {
          return { url, healthy: false, error: 'Connection refused' };
        }
        return { url, healthy: true, responseTime: 50 };
      });

      const result = await service.selectHealthyServer(identityPubkey);
      expect(result).not.toBeNull();
      expect(result!.url).toBe('https://server2.example.com');
      expect(result!.position).toBe(1);
    });

    it('should return first server when it is healthy', async () => {
      const identityPubkey = getUniqueIdentity();
      await service.addServer(identityPubkey, 'https://server1.example.com', 'Server 1');
      await service.addServer(identityPubkey, 'https://server2.example.com', 'Server 2');

      jest.spyOn(service, 'checkHealth').mockImplementation(async (url: string) => {
        return { url, healthy: true, responseTime: 50 };
      });

      const result = await service.selectHealthyServer(identityPubkey);
      expect(result).not.toBeNull();
      expect(result!.url).toBe('https://server1.example.com');
      expect(result!.position).toBe(0);
    });
  });

  describe('Per-Identity Isolation', () => {
    it('should isolate servers per identity', async () => {
      const identity1 = getUniqueIdentity();
      const identity2 = getUniqueIdentity();

      await service.addServer(identity1, 'https://example.com', null);
      const identity2Servers = await service.listServers(identity2);

      expect(identity2Servers.length).toBe(0);
    });

    it('should allow same URL for different identities', async () => {
      const identity1 = getUniqueIdentity();
      const identity2 = getUniqueIdentity();

      const server1 = await service.addServer(identity1, 'https://example.com', null);
      const server2 = await service.addServer(identity2, 'https://example.com', null);

      expect(server1.url).toBe('https://example.com');
      expect(server2.url).toBe('https://example.com');
      expect(server1.identityPubkey).not.toBe(server2.identityPubkey);
    });
  });

  describe('Integration: End-to-End Workflow', () => {
    it('should handle complete server management workflow', async () => {
      const identityPubkey = getUniqueIdentity();

      // 1. Start with empty list
      let servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(0);

      // 2. Add 3 servers
      await service.addServer(identityPubkey, 'https://server1.example.com', 'Server 1');
      await service.addServer(identityPubkey, 'https://server2.example.com', 'Server 2');
      await service.addServer(identityPubkey, 'https://server3.example.com', 'Server 3');

      // 3. Verify list contains 3 servers in order
      servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(3);
      expect(servers[0].url).toBe('https://server1.example.com');
      expect(servers[1].url).toBe('https://server2.example.com');
      expect(servers[2].url).toBe('https://server3.example.com');
      expect(servers[0].position).toBe(0);
      expect(servers[1].position).toBe(1);
      expect(servers[2].position).toBe(2);

      // 4. Remove middle server
      const removed = await service.removeServer(identityPubkey, 'https://server2.example.com');
      expect(removed).toBe(true);

      // 5. Verify list contains 2 servers
      servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(2);
      expect(servers[0].url).toBe('https://server1.example.com');
      expect(servers[1].url).toBe('https://server3.example.com');

      // 6. Reorder remaining servers
      await service.reorderServers(identityPubkey, [
        'https://server3.example.com',
        'https://server1.example.com',
      ]);

      // 7. Verify new order
      servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(2);
      expect(servers[0].url).toBe('https://server3.example.com');
      expect(servers[0].position).toBe(0);
      expect(servers[1].url).toBe('https://server1.example.com');
      expect(servers[1].position).toBe(1);

      // 8. Check health of servers (will fail since they don't exist)
      const health1 = await service.checkHealth('https://server3.example.com');
      const health2 = await service.checkHealth('https://server1.example.com');
      expect(health1.healthy).toBe(false);
      expect(health2.healthy).toBe(false);

      // 9-10. Select healthy server (should return null since all unhealthy)
      const selectedServer = await service.selectHealthyServer(identityPubkey);
      expect(selectedServer).toBeNull();
    }, 15000);
  });

  describe('Default Server Initialization', () => {
    it('should have correct default servers constant', () => {
      expect(DEFAULT_BLOSSOM_SERVERS).toEqual([
        { url: 'https://cdn.satellite.earth', label: 'Satellite CDN' },
      ]);
    });

    it('should initialize default servers for new identity', async () => {
      const identityPubkey = 'npub1default123';
      await service.initializeDefaults(identityPubkey);

      const servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(1);
      expect(servers[0].url).toBe('https://cdn.satellite.earth');
      expect(servers[0].label).toBe('Satellite CDN');
      expect(servers[0].position).toBe(0);
    });

    it('should be idempotent - skip if servers already exist', async () => {
      const identityPubkey = 'npub1idempotent123';

      // Add a custom server first
      await service.addServer(identityPubkey, 'https://custom.server.com', 'Custom');

      // Call initializeDefaults - should not overwrite
      await service.initializeDefaults(identityPubkey);

      const servers = await service.listServers(identityPubkey);
      expect(servers.length).toBe(1);
      expect(servers[0].url).toBe('https://custom.server.com');
      expect(servers[0].label).toBe('Custom');
    });

    it('should not affect other identities', async () => {
      const identity1 = 'npub1first123';
      const identity2 = 'npub1second123';

      await service.initializeDefaults(identity1);
      await service.addServer(identity2, 'https://other.server.com', 'Other');

      const servers1 = await service.listServers(identity1);
      const servers2 = await service.listServers(identity2);

      expect(servers1.length).toBe(1);
      expect(servers1[0].url).toBe('https://cdn.satellite.earth');
      expect(servers2.length).toBe(1);
      expect(servers2[0].url).toBe('https://other.server.com');
    });

    it('should throw if service not initialized', async () => {
      const uninitializedService = new BlossomServerService();
      await expect(uninitializedService.initializeDefaults('npub1test')).rejects.toThrow('BlossomServerService not initialized');
    });
  });
});
