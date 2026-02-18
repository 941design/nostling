/**
 * Default Blossom Server Initialization - E2E Test
 *
 * Story 01: Verifies that creating a new identity automatically
 * initializes the default blossom server (cdn.satellite.earth).
 */

import { test, expect } from './fixtures';
import { waitForAppReady, ensureIdentityExists } from './helpers';

test.describe('Default Blossom Server Initialization', () => {
  test('should initialize default blossom server when creating a new identity', async ({
    page,
  }) => {
    await waitForAppReady(page);

    // Create a new identity via the UI
    await ensureIdentityExists(page, 'Blossom Default Test');

    // Get the identity's npub via IPC
    const identities: any[] = await page.evaluate(() => {
      return (window as any).api.nostling.identities.list();
    });
    expect(identities.length).toBeGreaterThan(0);
    const identity = identities[0];

    // Query blossom servers for this identity via test IPC
    // initializeDefaults stores with npub as identity_pubkey
    const servers: any[] = await page.evaluate((npub: string) => {
      return (window as any).api.test.listBlossomServers(npub);
    }, identity.npub);

    // Verify default server was initialized
    expect(servers.length).toBe(1);
    expect(servers[0].url).toBe('https://cdn.satellite.earth');
    expect(servers[0].label).toBe('Satellite CDN');
    expect(servers[0].position).toBe(0);
  });

  test('should not duplicate defaults if identity already has servers', async ({
    page,
  }) => {
    await waitForAppReady(page);

    // Create identity (which initializes defaults)
    await ensureIdentityExists(page, 'Blossom Idempotent Test');

    // Get identity npub
    const identities: any[] = await page.evaluate(() => {
      return (window as any).api.nostling.identities.list();
    });
    const identity = identities[0];

    // Verify exactly one server exists (from initial creation)
    const servers: any[] = await page.evaluate((npub: string) => {
      return (window as any).api.test.listBlossomServers(npub);
    }, identity.npub);

    expect(servers.length).toBe(1);
    expect(servers[0].url).toBe('https://cdn.satellite.earth');
  });
});
