/**
 * Blossom Server Configuration IPC Handlers
 *
 * Exposes Blossom server management operations to renderer process.
 * Follows existing IPC handler patterns with domain:action naming.
 */

import { ipcMain } from 'electron';
import { BlossomServerService, BlossomServer, HealthCheckResult } from '../blossom/BlossomServerService';

export interface BlossomIpcDependencies {
  blossomServerService: BlossomServerService;
}

/**
 * Register Blossom server IPC handlers.
 *
 * CONTRACT:
 *   Inputs:
 *     - dependencies: object containing:
 *       - blossomServerService: BlossomServerService instance
 *
 *   Outputs:
 *     - void (side effect: registers IPC handlers)
 *
 *   Invariants:
 *     - All handlers use "blossom:" domain prefix
 *     - Handlers registered with ipcMain.handle (async invoke pattern)
 *     - Channel names:
 *       - "blossom:list-servers"
 *       - "blossom:add-server"
 *       - "blossom:remove-server"
 *       - "blossom:reorder-servers"
 *       - "blossom:check-health"
 *
 *   Properties:
 *     - Completeness: all BlossomServerService public methods exposed
 *     - Consistency: channel names match TypeScript type definitions
 *     - Error propagation: errors from service layer propagate to renderer
 *
 *   Algorithm:
 *     1. Register "blossom:list-servers" handler:
 *        - Accepts identityPubkey parameter
 *        - Calls blossomServerService.listServers(identityPubkey)
 *        - Returns BlossomServer[]
 *     2. Register "blossom:add-server" handler:
 *        - Accepts {identityPubkey, url, label} parameters
 *        - Calls blossomServerService.addServer(identityPubkey, url, label)
 *        - Returns BlossomServer
 *     3. Register "blossom:remove-server" handler:
 *        - Accepts {identityPubkey, url} parameters
 *        - Calls blossomServerService.removeServer(identityPubkey, url)
 *        - Returns boolean
 *     4. Register "blossom:reorder-servers" handler:
 *        - Accepts {identityPubkey, orderedUrls} parameters
 *        - Calls blossomServerService.reorderServers(identityPubkey, orderedUrls)
 *        - Returns void
 *     5. Register "blossom:check-health" handler:
 *        - Accepts {url} parameter
 *        - Calls blossomServerService.checkHealth(url)
 *        - Returns HealthCheckResult
 */
export function registerBlossomHandlers(dependencies: BlossomIpcDependencies): void {
  const { blossomServerService } = dependencies;

  // List servers for identity
  ipcMain.handle('blossom:list-servers', async (_event, identityPubkey: string): Promise<BlossomServer[]> => {
    return blossomServerService.listServers(identityPubkey);
  });

  // Add server
  ipcMain.handle(
    'blossom:add-server',
    async (
      _event,
      params: { identityPubkey: string; url: string; label: string | null }
    ): Promise<BlossomServer> => {
      return blossomServerService.addServer(params.identityPubkey, params.url, params.label);
    }
  );

  // Remove server
  ipcMain.handle(
    'blossom:remove-server',
    async (_event, params: { identityPubkey: string; url: string }): Promise<boolean> => {
      return blossomServerService.removeServer(params.identityPubkey, params.url);
    }
  );

  // Reorder servers
  ipcMain.handle(
    'blossom:reorder-servers',
    async (_event, params: { identityPubkey: string; orderedUrls: string[] }): Promise<void> => {
      return blossomServerService.reorderServers(params.identityPubkey, params.orderedUrls);
    }
  );

  // Check server health
  ipcMain.handle('blossom:check-health', async (_event, url: string): Promise<HealthCheckResult> => {
    return blossomServerService.checkHealth(url);
  });
}
