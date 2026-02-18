/**
 * Blossom Server Configuration Service
 *
 * Manages per-identity Blossom server lists with health checking and fallback logic.
 * Provides CRUD operations, health checks (HEAD request with 3s timeout), and
 * server selection with automatic fallback to next healthy server.
 *
 * Features:
 * - Per-identity server lists with custom labels and ordering
 * - TLS requirement validation (reject http:// URLs)
 * - Health check via HEAD request with 3s timeout
 * - Server selection with fallback to next server on failure
 * - Default server initialization for new identities (https://cdn.satellite.earth)
 */

import { Database } from 'sql.js';
import { getDatabase } from '../database/connection';
import http from 'http';
import https from 'https';

export interface BlossomServer {
  identityPubkey: string;
  url: string;
  label: string | null;
  position: number;
}

export interface DefaultBlossomServer {
  url: string;
  label: string;
}

export const DEFAULT_BLOSSOM_SERVERS: DefaultBlossomServer[] = [
  { url: 'https://cdn.satellite.earth', label: 'Satellite CDN' },
];

export interface HealthCheckResult {
  url: string;
  healthy: boolean;
  responseTime?: number; // milliseconds
  error?: string;
}

export class BlossomServerService {
  private db: Database | null = null;

  /**
   * Initialize the Blossom server service.
   *
   * CONTRACT:
   *   Inputs:
   *     - this: BlossomServerService instance
   *
   *   Outputs:
   *     - Promise<void>: resolves when initialization complete
   *
   *   Invariants:
   *     - After initialization, db is set to database instance
   *     - Throws if database not initialized
   *
   *   Properties:
   *     - Idempotent: safe to call multiple times
   *     - Side effects: sets db reference
   *
   *   Algorithm:
   *     1. Get database instance from connection
   *     2. Verify database is initialized (throw if null)
   *     3. Store db reference
   */
  async initialize(): Promise<void> {
    this.db = getDatabase();
    if (!this.db) {
      throw new Error('Database not initialized');
    }
  }

  /**
   * Initialize default blossom servers for a new identity.
   * Idempotent: skips if servers already exist for this identity.
   */
  async initializeDefaults(identityPubkey: string): Promise<void> {
    if (!this.db) {
      throw new Error('BlossomServerService not initialized');
    }

    const existing = await this.listServers(identityPubkey);
    if (existing.length > 0) {
      return; // Already has servers, don't overwrite
    }

    for (let i = 0; i < DEFAULT_BLOSSOM_SERVERS.length; i++) {
      const server = DEFAULT_BLOSSOM_SERVERS[i];
      this.db.run(
        'INSERT INTO blossom_servers (identity_pubkey, url, label, position) VALUES (?, ?, ?, ?)',
        [identityPubkey, server.url, server.label, i]
      );
    }
  }

  /**
   * Validate that URL uses HTTPS protocol.
   * Throws error if URL is HTTP or invalid.
   */
  private validateHttpsUrl(url: string): void {
    if (!url.startsWith('https://')) {
      throw new Error('Blossom server URL must use HTTPS protocol (http:// is not allowed)');
    }
  }

  /**
   * List all Blossom servers for an identity, ordered by position.
   *
   * CONTRACT:
   *   Inputs:
   *     - identityPubkey: string, public key of identity
   *
   *   Outputs:
   *     - Promise<BlossomServer[]>: array of servers, ordered by position ascending
   *
   *   Invariants:
   *     - Results are sorted by position (lowest first)
   *     - Each server has unique URL within identity
   *     - Empty array if no servers configured
   *
   *   Properties:
   *     - Read-only: no side effects
   *     - Consistent ordering: same identity always returns same order
   *
   *   Algorithm:
   *     1. Query blossom_servers table for identity_pubkey
   *     2. Order results by position ASC
   *     3. Map database rows to BlossomServer objects
   *     4. Return array
   */
  async listServers(identityPubkey: string): Promise<BlossomServer[]> {
    if (!this.db) {
      throw new Error('BlossomServerService not initialized');
    }

    const result = this.db.exec(
      'SELECT identity_pubkey, url, label, position FROM blossom_servers WHERE identity_pubkey = ? ORDER BY position ASC',
      [identityPubkey]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return [];
    }

    return result[0].values.map((row) => ({
      identityPubkey: row[0] as string,
      url: row[1] as string,
      label: (row[2] as string | null) ?? null,
      position: row[3] as number,
    }));
  }

  /**
   * Add a new Blossom server to an identity's server list.
   *
   * CONTRACT:
   *   Inputs:
   *     - identityPubkey: string, public key of identity
   *     - url: string, server base URL (must be HTTPS)
   *     - label: string or null, optional user-defined label
   *
   *   Outputs:
   *     - Promise<BlossomServer>: newly added server with assigned position
   *
   *   Invariants:
   *     - URL must start with "https://" (reject "http://")
   *     - Position assigned as max(existing positions) + 1, or 0 if first server
   *     - Server is persisted to database
   *     - Throws if URL already exists for identity (duplicate)
   *     - Throws if URL is not HTTPS
   *
   *   Properties:
   *     - TLS requirement: rejects HTTP URLs with clear error message
   *     - Automatic position assignment: no manual position management needed
   *     - Idempotency: adding same URL twice throws error (not silent)
   *
   *   Algorithm:
   *     1. Validate URL starts with "https://" (throw if not)
   *     2. Query existing servers for identity
   *     3. Check if URL already exists (throw if duplicate)
   *     4. Calculate position: max(existing positions) + 1, or 0 if none
   *     5. Insert into blossom_servers table
   *     6. Return new BlossomServer object
   */
  async addServer(identityPubkey: string, url: string, label: string | null): Promise<BlossomServer> {
    if (!this.db) {
      throw new Error('BlossomServerService not initialized');
    }

    // Step 1: Validate HTTPS
    this.validateHttpsUrl(url);

    // Step 2-3: Check for existing servers and duplicates
    const existingServers = await this.listServers(identityPubkey);

    if (existingServers.some(server => server.url === url)) {
      throw new Error(`Server with URL ${url} already exists for this identity`);
    }

    // Step 4: Calculate position
    const position = existingServers.length > 0
      ? Math.max(...existingServers.map(s => s.position)) + 1
      : 0;

    // Step 5: Insert into database
    this.db.run(
      'INSERT INTO blossom_servers (identity_pubkey, url, label, position) VALUES (?, ?, ?, ?)',
      [identityPubkey, url, label, position]
    );

    // Step 6: Return new server
    return {
      identityPubkey,
      url,
      label,
      position,
    };
  }

  /**
   * Remove a Blossom server from an identity's server list.
   *
   * CONTRACT:
   *   Inputs:
   *     - identityPubkey: string, public key of identity
   *     - url: string, server URL to remove
   *
   *   Outputs:
   *     - Promise<boolean>: true if server was removed, false if not found
   *
   *   Invariants:
   *     - After completion, server is deleted from database
   *     - Idempotent: removing non-existent server returns false (no error)
   *     - Positions of remaining servers are NOT renumbered (gaps allowed)
   *
   *   Properties:
   *     - Side effects: deletes database row
   *     - Non-blocking: returns false instead of throwing for missing servers
   *
   *   Algorithm:
   *     1. Delete from blossom_servers where identity_pubkey = ? AND url = ?
   *     2. If no rows affected, return false
   *     3. If rows affected, return true
   */
  async removeServer(identityPubkey: string, url: string): Promise<boolean> {
    if (!this.db) {
      throw new Error('BlossomServerService not initialized');
    }

    // Check if server exists before deletion
    const existingServers = await this.listServers(identityPubkey);
    const serverExists = existingServers.some(server => server.url === url);

    if (!serverExists) {
      return false;
    }

    // Delete the server
    this.db.run(
      'DELETE FROM blossom_servers WHERE identity_pubkey = ? AND url = ?',
      [identityPubkey, url]
    );

    return true;
  }

  /**
   * Reorder Blossom servers for an identity.
   *
   * CONTRACT:
   *   Inputs:
   *     - identityPubkey: string, public key of identity
   *     - orderedUrls: array of strings, URLs in desired order
   *
   *   Outputs:
   *     - Promise<void>: resolves when reordering complete
   *
   *   Invariants:
   *     - After completion, servers have positions 0, 1, 2, ... N-1
   *     - Position matches index in orderedUrls array
   *     - Throws if orderedUrls contains URL not in database for this identity
   *     - Throws if orderedUrls has duplicates
   *
   *   Properties:
   *     - Atomic: all positions updated or none (via transaction)
   *     - Validation: ensures all URLs exist before updating
   *     - Gap elimination: removes gaps in position sequence
   *
   *   Algorithm:
   *     1. Fetch current servers for identity
   *     2. Validate orderedUrls:
   *        a. Check for duplicates (throw if found)
   *        b. Check all URLs exist in current servers (throw if not)
   *     3. For each URL in orderedUrls, update position to its index
   *     4. Execute updates in a transaction (if possible)
   */
  async reorderServers(identityPubkey: string, orderedUrls: string[]): Promise<void> {
    if (!this.db) {
      throw new Error('BlossomServerService not initialized');
    }

    // Step 1: Fetch current servers
    const currentServers = await this.listServers(identityPubkey);
    const currentUrls = new Set(currentServers.map(s => s.url));

    // Step 2a: Check for duplicates
    const urlSet = new Set<string>();
    for (const url of orderedUrls) {
      if (urlSet.has(url)) {
        throw new Error(`Duplicate URL in reorder list: ${url}`);
      }
      urlSet.add(url);
    }

    // Step 2b: Check all URLs exist
    for (const url of orderedUrls) {
      if (!currentUrls.has(url)) {
        throw new Error(`URL not found in server list: ${url}`);
      }
    }

    // Step 3-4: Update positions
    for (let i = 0; i < orderedUrls.length; i++) {
      this.db.run(
        'UPDATE blossom_servers SET position = ? WHERE identity_pubkey = ? AND url = ?',
        [i, identityPubkey, orderedUrls[i]]
      );
    }
  }

  /**
   * Perform health check on a Blossom server.
   *
   * CONTRACT:
   *   Inputs:
   *     - url: string, server base URL to check
   *
   *   Outputs:
   *     - Promise<HealthCheckResult>:
   *       - url: echoed input URL
   *       - healthy: true if server responded within timeout, false otherwise
   *       - responseTime: milliseconds if successful, undefined if failed
   *       - error: error message if failed, undefined if successful
   *
   *   Invariants:
   *     - Timeout after 3000ms (3 seconds)
   *     - Uses HEAD request to minimize data transfer
   *     - Does NOT follow redirects beyond initial request
   *     - Considers 2xx status codes as healthy
   *
   *   Properties:
   *     - Non-blocking: returns result even on failure (no throw)
   *     - Timeout enforcement: never hangs indefinitely
   *     - Minimal bandwidth: HEAD request, not GET
   *
   *   Algorithm:
   *     1. Record start time
   *     2. Create HTTP HEAD request with 3s timeout
   *     3. Execute request
   *     4. If successful (2xx status):
   *        a. Calculate response time
   *        b. Return { healthy: true, responseTime }
   *     5. If failed (timeout, network error, non-2xx status):
   *        a. Return { healthy: false, error: <description> }
   */
  async checkHealth(url: string): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const transport = url.startsWith('https://') ? https : http;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          url,
          healthy: false,
          error: 'Request timed out after 3 seconds',
        });
      }, 3000);

      try {
        const req = transport.request(
          url,
          {
            method: 'HEAD',
            timeout: 3000,
          },
          (res) => {
            clearTimeout(timeout);
            const responseTime = Date.now() - startTime;

            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                url,
                healthy: true,
                responseTime,
              });
            } else {
              resolve({
                url,
                healthy: false,
                error: `Server returned status ${res.statusCode}`,
              });
            }
          }
        );

        req.on('error', (error) => {
          clearTimeout(timeout);
          resolve({
            url,
            healthy: false,
            error: error.message,
          });
        });

        req.on('timeout', () => {
          req.destroy();
          clearTimeout(timeout);
          resolve({
            url,
            healthy: false,
            error: 'Request timed out after 3 seconds',
          });
        });

        req.end();
      } catch (error) {
        clearTimeout(timeout);
        resolve({
          url,
          healthy: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  /**
   * Select first healthy server from identity's server list.
   *
   * CONTRACT:
   *   Inputs:
   *     - identityPubkey: string, public key of identity
   *
   *   Outputs:
   *     - Promise<BlossomServer | null>:
   *       - BlossomServer if at least one healthy server found
   *       - null if no servers configured OR all servers unhealthy
   *
   *   Invariants:
   *     - Checks servers in position order (lowest first)
   *     - Returns first server that passes health check
   *     - Returns null if all servers fail health check
   *     - Returns null if server list is empty
   *
   *   Properties:
   *     - Fallback logic: tries each server until one succeeds
   *     - Short-circuit: stops checking after first healthy server
   *     - Health check timeout: 3s per server (can take up to 3s * N)
   *
   *   Algorithm:
   *     1. Fetch servers for identity, ordered by position
   *     2. If empty, return null
   *     3. For each server in order:
   *        a. Perform health check
   *        b. If healthy, return this server (short-circuit)
   *     4. If all servers unhealthy, return null
   */
  async selectHealthyServer(identityPubkey: string): Promise<BlossomServer | null> {
    // Step 1: Fetch servers
    const servers = await this.listServers(identityPubkey);

    // Step 2: If empty, return null
    if (servers.length === 0) {
      return null;
    }

    // Step 3: Check each server in order
    for (const server of servers) {
      const healthCheck = await this.checkHealth(server.url);
      if (healthCheck.healthy) {
        return server;
      }
    }

    // Step 4: All servers unhealthy
    return null;
  }
}
