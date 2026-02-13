/**
 * Blossom Server API Client
 *
 * Renderer-side API for Blossom server configuration.
 * Provides typed interface to IPC handlers.
 */

import { BlossomServer, HealthCheckResult } from '../../main/blossom/BlossomServerService';

/**
 * Renderer API for Blossom server operations.
 *
 * CONTRACT:
 *   This interface defines the renderer-side API surface.
 *   Each method corresponds to an IPC handler in blossom-handlers.ts.
 *
 *   All methods are asynchronous and return Promises.
 *   Errors from main process are propagated as rejected Promises.
 */
export interface BlossomApi {
  /**
   * List all Blossom servers for an identity.
   *
   * CONTRACT:
   *   Inputs:
   *     - identityPubkey: string, public key of identity
   *
   *   Outputs:
   *     - Promise<BlossomServer[]>: array of servers, ordered by position
   *
   *   Invariants:
   *     - Returns empty array if no servers configured
   *     - Results are sorted by position ascending
   *
   *   Properties:
   *     - IPC channel: "blossom:list-servers"
   *     - Read-only operation
   */
  listServers(identityPubkey: string): Promise<BlossomServer[]>;

  /**
   * Add a new Blossom server to identity's server list.
   *
   * CONTRACT:
   *   Inputs:
   *     - identityPubkey: string, public key of identity
   *     - url: string, server base URL (must be HTTPS)
   *     - label: string or null, optional user-defined label
   *
   *   Outputs:
   *     - Promise<BlossomServer>: newly added server
   *
   *   Invariants:
   *     - Throws if URL is not HTTPS
   *     - Throws if URL already exists for identity
   *
   *   Properties:
   *     - IPC channel: "blossom:add-server"
   *     - Side effect: persists to database
   */
  addServer(identityPubkey: string, url: string, label: string | null): Promise<BlossomServer>;

  /**
   * Remove a Blossom server from identity's server list.
   *
   * CONTRACT:
   *   Inputs:
   *     - identityPubkey: string, public key of identity
   *     - url: string, server URL to remove
   *
   *   Outputs:
   *     - Promise<boolean>: true if removed, false if not found
   *
   *   Invariants:
   *     - Returns false for non-existent servers (no error)
   *
   *   Properties:
   *     - IPC channel: "blossom:remove-server"
   *     - Side effect: deletes from database
   */
  removeServer(identityPubkey: string, url: string): Promise<boolean>;

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
   *     - Throws if orderedUrls contains URL not in database
   *     - Throws if orderedUrls has duplicates
   *
   *   Properties:
   *     - IPC channel: "blossom:reorder-servers"
   *     - Side effect: updates positions in database
   */
  reorderServers(identityPubkey: string, orderedUrls: string[]): Promise<void>;

  /**
   * Check health of a Blossom server.
   *
   * CONTRACT:
   *   Inputs:
   *     - url: string, server base URL to check
   *
   *   Outputs:
   *     - Promise<HealthCheckResult>: health check result
   *
   *   Invariants:
   *     - Timeout after 3 seconds
   *     - Returns result even on failure (no throw)
   *
   *   Properties:
   *     - IPC channel: "blossom:check-health"
   *     - Read-only operation (no side effects)
   */
  checkHealth(url: string): Promise<HealthCheckResult>;
}

/**
 * Implementation using window.api (provided by preload script).
 */
export const blossomApi: BlossomApi = {
  listServers: (identityPubkey: string) => {
    return (window as any).api.invoke('blossom:list-servers', identityPubkey);
  },

  addServer: (identityPubkey: string, url: string, label: string | null) => {
    return (window as any).api.invoke('blossom:add-server', { identityPubkey, url, label });
  },

  removeServer: (identityPubkey: string, url: string) => {
    return (window as any).api.invoke('blossom:remove-server', { identityPubkey, url });
  },

  reorderServers: (identityPubkey: string, orderedUrls: string[]) => {
    return (window as any).api.invoke('blossom:reorder-servers', { identityPubkey, orderedUrls });
  },

  checkHealth: (url: string) => {
    return (window as any).api.invoke('blossom:check-health', url);
  },
};
