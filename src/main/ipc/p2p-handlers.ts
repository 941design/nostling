/**
 * P2P IPC Handlers
 *
 * Registers IPC handlers for P2P connection management.
 * Extends existing handler registration pattern from handlers.ts.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { Database } from 'sql.js';
import { RelayPool } from '../nostling/relay-pool';
import {
  P2PContactInfo,
  P2PLocalSignal,
  P2PStatusUpdate,
  P2PInitiateRequest,
  P2PRemoteSignal,
  P2PRole,
} from '../../shared/p2p-types';
import {
  attemptP2PConnection,
  getP2PConnectionStatus,
  handleRendererStatusUpdate,
  P2PAttemptResult,
} from '../nostling/p2p-connection-manager';
import { hexToNpub, deriveKeypair } from '../nostling/crypto';
import { log } from '../logging';
import { NostlingSecretStore } from '../nostling/secret-store';
import { getDevUpdateConfig } from '../dev-env';

/**
 * Dependencies for P2P IPC handlers
 */
export interface P2PIpcDependencies {
  getDatabase: () => Database;
  getRelayPool: () => RelayPool | null;
  getMainWindow: () => BrowserWindow | null;
  getSecretStore: () => NostlingSecretStore;
}

/**
 * Register P2P IPC handlers
 *
 * CONTRACT:
 *   Inputs:
 *     - dependencies: object with getDatabase, getRelayPool, getNostlingService, getMainWindow functions
 *
 *   Outputs:
 *     - void (side effect: registers IPC handlers)
 *
 *   Invariants:
 *     - All handlers use 'nostling:p2p:' domain prefix
 *     - Handlers registered with ipcMain.handle (async invoke pattern)
 *     - Bidirectional IPC: some handlers send messages back to renderer
 *
 *   Properties:
 *     - Consistency: channel names match preload API
 *     - Idempotent: calling multiple times re-registers handlers
 *
 *   Algorithm:
 *     1. Register 'nostling:p2p:attempt-connection' handler:
 *        a. Extract contactId from args
 *        b. Look up contact in database to get pubkey
 *        c. Get identity keypair for this contact's identity
 *        d. Call attemptP2PConnection(...)
 *        e. Return P2PAttemptResult
 *     2. Register 'nostling:p2p:get-status' handler:
 *        a. Extract contactId from args
 *        b. Look up contact to get identity and contact pubkeys
 *        c. Call getP2PConnectionStatus(...)
 *        d. Return P2PContactInfo or null
 *     3. Register 'nostling:p2p:close-connection' handler:
 *        a. Extract sessionId from args
 *        b. Send IPC to renderer: 'nostling:p2p:close-connection' with sessionId
 *        c. Update DB status to 'failed' with reason 'user'
 *     4. Register 'nostling:p2p:signal-ready' handler (from renderer):
 *        a. Extract sessionId, sdp, candidates from P2PLocalSignal
 *        b. Look up session in DB to get contact pubkey
 *        c. If offerer: send offer via sendP2POffer
 *        d. If answerer: send answer via sendP2PAnswer
 *        e. Send ICE candidates via sendP2PIceCandidate
 *     5. Register 'nostling:p2p:status-change' handler (from renderer):
 *        a. Extract sessionId, status, failureReason from P2PStatusUpdate
 *        b. Call handleRendererStatusUpdate(...)
 *        c. If status === 'connected': log success
 *        d. If status === 'failed': log failure
 */
export function registerP2PIpcHandlers(dependencies: P2PIpcDependencies): void {
  // Guard against undefined ipcMain in test environments
  if (!ipcMain?.handle) {
    return;
  }

  // Handler: attempt P2P connection
  ipcMain.handle('nostling:p2p:attempt-connection', async (_, contactId: string) => {
    // Check if P2P is enabled before attempting connection
    const devConfig = getDevUpdateConfig();
    if (!devConfig.enableP2P) {
      log('debug', 'P2P disabled, rejecting connection attempt');
      return {
        contactId,
        sessionId: '',
        role: 'offerer' as P2PRole,
        status: 'unavailable',
        error: 'P2P connections are disabled',
      } as P2PAttemptResult;
    }

    try {
      const database = dependencies.getDatabase();
      const relayPool = dependencies.getRelayPool();

      if (!relayPool) {
        throw new Error('Relay pool not initialized');
      }

      const result = database.exec(
        `SELECT c.npub, i.npub as identity_npub FROM nostr_contacts c
         JOIN nostr_identities i ON c.identity_id = i.id WHERE c.id = ?`,
        [contactId]
      );

      if (!result.length || !result[0].values.length) {
        throw new Error(`Contact not found: ${contactId}`);
      }

      const [contactNpub, identityNpub] = result[0].values[0];
      const { npubToHex } = await import('../nostling/crypto');
      const contactPubkeyHex = npubToHex(contactNpub as string);

      // Retrieve identity keypair from secure storage
      const identityResult = database.exec(
        `SELECT id, secret_ref FROM nostr_identities WHERE npub = ?`,
        [identityNpub]
      );
      if (!identityResult.length || !identityResult[0].values.length) {
        throw new Error(`Identity not found for npub: ${identityNpub}`);
      }
      const secretRef = identityResult[0].values[0][1] as string;
      const nsec = await dependencies.getSecretStore().getSecret(secretRef);
      if (!nsec) {
        throw new Error(`Secret not found for identity: ${identityNpub}`);
      }
      const identityKeypair = deriveKeypair(nsec);

      const ipcSendToRenderer = (channel: string, ...args: any[]) => {
        const mainWindow = dependencies.getMainWindow();
        // Translate channel names to full nostling:p2p:* prefix
        if (channel === 'p2p:initiate-connection') {
          sendP2PInitiateToRenderer(mainWindow, args[0]);
        } else if (channel === 'p2p:remote-signal') {
          sendP2PRemoteSignalToRenderer(mainWindow, args[0]);
        } else {
          log('warn', `Unknown P2P IPC channel: ${channel}`);
        }
      };

      const result2 = await attemptP2PConnection(
        database,
        relayPool,
        identityKeypair,
        contactId,
        contactPubkeyHex,
        ipcSendToRenderer
      );

      return result2;
    } catch (error) {
      log('error', `P2P attempt-connection failed: ${error}`);
      throw error;
    }
  });

  // Handler: get P2P connection status
  ipcMain.handle('nostling:p2p:get-status', async (_, contactId: string) => {
    try {
      const database = dependencies.getDatabase();

      const result = database.exec(
        `SELECT c.npub, i.npub as identity_npub FROM nostr_contacts c
         JOIN nostr_identities i ON c.identity_id = i.id WHERE c.id = ?`,
        [contactId]
      );

      if (!result.length || !result[0].values.length) {
        return null;
      }

      const [contactNpub, identityNpub] = result[0].values[0];
      const { npubToHex } = await import('../nostling/crypto');
      const contactPubkeyHex = npubToHex(contactNpub as string);
      const identityPubkeyHex = npubToHex(identityNpub as string);

      const connectionState = getP2PConnectionStatus(database, identityPubkeyHex, contactPubkeyHex);

      if (!connectionState) {
        return null;
      }

      const contactInfo: P2PContactInfo = {
        contactId,
        status: connectionState.status,
        sessionId: connectionState.sessionId,
        lastAttemptAt: connectionState.lastAttemptAt,
        lastSuccessAt: connectionState.lastSuccessAt,
        lastFailureReason: connectionState.lastFailureReason,
      };

      return contactInfo;
    } catch (error) {
      log('error', `P2P get-status failed: ${error}`);
      throw error;
    }
  });

  // Handler: close connection
  ipcMain.handle('nostling:p2p:close-connection', async (_, sessionId: string) => {
    try {
      const database = dependencies.getDatabase();
      const mainWindow = dependencies.getMainWindow();

      if (mainWindow) {
        mainWindow.webContents.send('nostling:p2p:close-connection', sessionId);
      }

      database.run(
        `UPDATE p2p_connection_state
         SET status = 'failed', last_failure_reason = 'user', updated_at = CURRENT_TIMESTAMP
         WHERE session_id = ?`,
        [sessionId]
      );
    } catch (error) {
      log('error', `P2P close-connection failed: ${error}`);
      throw error;
    }
  });

  // Handler: signal ready (from renderer)
  ipcMain.handle('nostling:p2p:signal-ready', async (_, signal: P2PLocalSignal) => {
    // Check if P2P is enabled before processing signals
    const devConfig = getDevUpdateConfig();
    if (!devConfig.enableP2P) {
      log('debug', 'P2P disabled, ignoring signal-ready');
      return;
    }

    try {
      const database = dependencies.getDatabase();
      const relayPool = dependencies.getRelayPool();

      if (!relayPool) {
        throw new Error('Relay pool not initialized');
      }

      const result = database.exec(
        `SELECT contact_pubkey, identity_pubkey, role FROM p2p_connection_state WHERE session_id = ?`,
        [signal.sessionId]
      );

      if (!result.length || !result[0].values.length) {
        throw new Error(`Session not found: ${signal.sessionId}`);
      }

      const [contactPubkey, identityPubkey, role] = result[0].values[0];

      // Retrieve identity keypair from secure storage using identity_pubkey (hex)
      const identityNpub = hexToNpub(identityPubkey as string);
      const identityResult = database.exec(
        `SELECT secret_ref FROM nostr_identities WHERE npub = ?`,
        [identityNpub]
      );
      if (!identityResult.length || !identityResult[0].values.length) {
        throw new Error(`Identity not found for pubkey: ${identityPubkey}`);
      }
      const secretRef = identityResult[0].values[0][0] as string;
      const nsec = await dependencies.getSecretStore().getSecret(secretRef);
      if (!nsec) {
        throw new Error(`Secret not found for identity: ${identityNpub}`);
      }
      const identityKeypair = deriveKeypair(nsec);

      if (role === 'offerer') {
        await (await import('../nostling/p2p-signal-handler')).sendP2POffer(
          identityKeypair,
          contactPubkey as string,
          signal.sessionId,
          signal.sdp,
          '',
          undefined,
          relayPool,
          database
        );
      } else {
        await (await import('../nostling/p2p-signal-handler')).sendP2PAnswer(
          identityKeypair,
          contactPubkey as string,
          signal.sessionId,
          signal.sdp,
          '',
          undefined,
          relayPool,
          database
        );
      }

      for (const candidate of signal.candidates) {
        await (await import('../nostling/p2p-signal-handler')).sendP2PIceCandidate(
          identityKeypair,
          contactPubkey as string,
          signal.sessionId,
          candidate,
          relayPool,
          database
        );
      }
    } catch (error) {
      log('error', `P2P signal-ready failed: ${error}`);
      throw error;
    }
  });

  // Handler: status change (from renderer)
  ipcMain.handle('nostling:p2p:status-change', async (_, update: P2PStatusUpdate) => {
    try {
      handleRendererStatusUpdate(dependencies.getDatabase(), update.sessionId, update.status, update.failureReason);

      if (update.status === 'connected') {
        log('info', `P2P connection established: ${update.sessionId}`);
      } else if (update.status === 'failed') {
        log('warn', `P2P connection failed: ${update.sessionId} - ${update.failureReason}`);
      }

      // Broadcast status change to renderer for reactive UI updates
      const mainWindow = dependencies.getMainWindow();
      if (mainWindow) {
        const database = dependencies.getDatabase();
        // Look up contact_pubkey from session
        const stmt = database.prepare(
          'SELECT contact_pubkey FROM p2p_connection_state WHERE session_id = ?'
        );
        stmt.bind([update.sessionId]);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          const contactPubkey = row.contact_pubkey as string;
          stmt.free();

          // Convert hex to npub and look up contactId
          const npub = hexToNpub(contactPubkey);
          const contactStmt = database.prepare(
            'SELECT id FROM nostr_contacts WHERE npub = ? AND deleted_at IS NULL LIMIT 1'
          );
          contactStmt.bind([npub]);
          if (contactStmt.step()) {
            const contactRow = contactStmt.getAsObject();
            const contactId = contactRow.id as string;
            contactStmt.free();

            // Broadcast to renderer
            mainWindow.webContents.send('nostling:p2p:status-changed', contactId, update.status);
          } else {
            contactStmt.free();
          }
        } else {
          stmt.free();
        }
      }
    } catch (error) {
      log('error', `P2P status-change failed: ${error}`);
      throw error;
    }
  });
}

/**
 * Send P2P initiate request to renderer
 *
 * CONTRACT:
 *   Inputs:
 *     - mainWindow: BrowserWindow instance or null
 *     - request: P2PInitiateRequest with session details
 *
 *   Outputs:
 *     - void (side effect: sends IPC message to renderer)
 *
 *   Invariants:
 *     - if mainWindow is null: log warning, no-op
 *     - if mainWindow exists: sends 'nostling:p2p:initiate-connection' event
 *
 *   Properties:
 *     - Safe: handles null window gracefully
 *     - Event-driven: renderer reacts to this message
 *
 *   Algorithm:
 *     1. Check if mainWindow is null
 *     2. If null: log warning, return
 *     3. Send IPC event: mainWindow.webContents.send('nostling:p2p:initiate-connection', request)
 */
export function sendP2PInitiateToRenderer(
  mainWindow: BrowserWindow | null,
  request: P2PInitiateRequest
): void {
  if (!mainWindow) {
    log('warn', 'Cannot send P2P initiate: no main window');
    return;
  }
  mainWindow.webContents.send('nostling:p2p:initiate-connection', request);
}

/**
 * Send P2P remote signal to renderer
 *
 * CONTRACT:
 *   Inputs:
 *     - mainWindow: BrowserWindow instance or null
 *     - signal: P2PRemoteSignal with SDP or ICE candidates
 *
 *   Outputs:
 *     - void (side effect: sends IPC message to renderer)
 *
 *   Invariants:
 *     - Same as sendP2PInitiateToRenderer
 *
 *   Properties:
 *     - Same as sendP2PInitiateToRenderer
 *
 *   Algorithm:
 *     Similar to sendP2PInitiateToRenderer, but channel is 'nostling:p2p:remote-signal'
 */
export function sendP2PRemoteSignalToRenderer(
  mainWindow: BrowserWindow | null,
  signal: P2PRemoteSignal
): void {
  if (!mainWindow) {
    log('warn', 'Cannot send P2P remote signal: no main window');
    return;
  }
  mainWindow.webContents.send('nostling:p2p:remote-signal', signal);
}
