/**
 * Seed Default Blossom Servers for Existing Identities
 *
 * Adds default blossom servers (blossom.primal.net, nostr.download, cdn.satellite.earth)
 * to all existing identities that don't already have them configured.
 * Appends after any existing servers so user-configured ordering is preserved.
 */

import { Knex } from 'knex';

const DEFAULT_SERVERS = [
  { url: 'https://blossom.primal.net', label: 'Primal' },
  { url: 'https://nostr.download', label: 'nostr.download' },
  { url: 'https://cdn.satellite.earth', label: 'Satellite CDN' },
];

export async function up(knex: Knex): Promise<void> {
  // For each default server, insert it for every identity that doesn't already have it.
  // Position is set to max(existing position) + 1 per identity, incrementing for each new server.
  for (let i = 0; i < DEFAULT_SERVERS.length; i++) {
    const server = DEFAULT_SERVERS[i];
    await knex.schema.raw(
      `INSERT INTO blossom_servers (identity_pubkey, url, label, position)
       SELECT ni.npub, '${server.url}', '${server.label}',
              COALESCE((SELECT MAX(bs.position) FROM blossom_servers bs WHERE bs.identity_pubkey = ni.npub), -1) + 1
       FROM nostr_identities ni
       WHERE NOT EXISTS (
         SELECT 1 FROM blossom_servers bs2
         WHERE bs2.identity_pubkey = ni.npub AND bs2.url = '${server.url}'
       )`
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove only the default servers that were added by this migration
  for (const server of DEFAULT_SERVERS) {
    await knex.schema.raw(
      `DELETE FROM blossom_servers WHERE url = '${server.url}'`
    );
  }
}
