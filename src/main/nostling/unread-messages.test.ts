/**
 * Unit tests for unread message tracking functionality
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import initSqlJs, { Database } from 'sql.js';

// Helper to create a test database with the messages table
async function createTestDatabase(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create necessary tables with the is_read column
  db.run(`
    CREATE TABLE nostr_identities (
      id TEXT PRIMARY KEY,
      npub TEXT NOT NULL,
      secret_ref TEXT NOT NULL,
      label TEXT NOT NULL,
      relays TEXT,
      theme TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE nostr_contacts (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      npub TEXT NOT NULL,
      alias TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_message_at TEXT,
      deleted_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE nostr_messages (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      contact_id TEXT NOT NULL,
      sender_npub TEXT NOT NULL,
      recipient_npub TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      event_id TEXT,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      direction TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Create index for unread queries
  db.run('CREATE INDEX idx_nostr_messages_is_read ON nostr_messages(contact_id, is_read)');

  return db;
}

describe('Unread Message Tracking', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();

    // Insert test identity
    db.run(
      'INSERT INTO nostr_identities (id, npub, secret_ref, label) VALUES (?, ?, ?, ?)',
      ['identity-1', 'npub1test', 'secret-ref', 'Test Identity']
    );

    // Insert test contacts
    db.run(
      'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state) VALUES (?, ?, ?, ?, ?)',
      ['contact-1', 'identity-1', 'npub1contact1', 'Contact 1', 'connected']
    );
    db.run(
      'INSERT INTO nostr_contacts (id, identity_id, npub, alias, state) VALUES (?, ?, ?, ?, ?)',
      ['contact-2', 'identity-1', 'npub1contact2', 'Contact 2', 'connected']
    );
  });

  afterEach(() => {
    db.close();
  });

  describe('is_read column default behavior', () => {
    it('should default is_read to true for explicitly set values', () => {
      // Insert outgoing message (should be read by default)
      db.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['msg-1', 'identity-1', 'contact-1', 'npub1test', 'npub1contact1', 'Hello', '2024-01-01T00:00:00Z', 'sent', 'outgoing', 1]
      );

      const result = db.exec('SELECT is_read FROM nostr_messages WHERE id = ?', ['msg-1']);
      expect(result[0].values[0][0]).toBe(1);
    });

    it('should store is_read as false (0) for incoming unread messages', () => {
      // Insert incoming message marked as unread
      db.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['msg-2', 'identity-1', 'contact-1', 'npub1contact1', 'npub1test', 'Hi there', '2024-01-01T00:01:00Z', 'sent', 'incoming', 0]
      );

      const result = db.exec('SELECT is_read FROM nostr_messages WHERE id = ?', ['msg-2']);
      expect(result[0].values[0][0]).toBe(0);
    });
  });

  describe('markMessagesRead', () => {
    beforeEach(() => {
      // Insert some unread incoming messages
      db.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['msg-1', 'identity-1', 'contact-1', 'npub1contact1', 'npub1test', 'Message 1', '2024-01-01T00:00:00Z', 'sent', 'incoming', 0]
      );
      db.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['msg-2', 'identity-1', 'contact-1', 'npub1contact1', 'npub1test', 'Message 2', '2024-01-01T00:01:00Z', 'sent', 'incoming', 0]
      );
      // Insert an outgoing message (already read)
      db.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['msg-3', 'identity-1', 'contact-1', 'npub1test', 'npub1contact1', 'My reply', '2024-01-01T00:02:00Z', 'sent', 'outgoing', 1]
      );
      // Insert unread message for different contact
      db.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['msg-4', 'identity-1', 'contact-2', 'npub1contact2', 'npub1test', 'From contact 2', '2024-01-01T00:03:00Z', 'sent', 'incoming', 0]
      );
    });

    it('should mark only incoming unread messages for specific contact as read', () => {
      // Execute mark as read SQL
      db.run(
        'UPDATE nostr_messages SET is_read = 1 WHERE identity_id = ? AND contact_id = ? AND direction = ? AND is_read = 0',
        ['identity-1', 'contact-1', 'incoming']
      );
      const changes = db.getRowsModified();

      // Should have updated 2 messages (msg-1 and msg-2)
      expect(changes).toBe(2);

      // Verify contact-1 messages are now read
      const contact1Messages = db.exec(
        'SELECT id, is_read FROM nostr_messages WHERE contact_id = ? ORDER BY id',
        ['contact-1']
      );
      expect(contact1Messages[0].values).toEqual([
        ['msg-1', 1],
        ['msg-2', 1],
        ['msg-3', 1],
      ]);

      // Verify contact-2 message is still unread
      const contact2Messages = db.exec(
        'SELECT is_read FROM nostr_messages WHERE contact_id = ?',
        ['contact-2']
      );
      expect(contact2Messages[0].values[0][0]).toBe(0);
    });

    it('should not modify already read messages', () => {
      // First mark as read
      db.run(
        'UPDATE nostr_messages SET is_read = 1 WHERE identity_id = ? AND contact_id = ? AND direction = ? AND is_read = 0',
        ['identity-1', 'contact-1', 'incoming']
      );

      // Try marking again
      db.run(
        'UPDATE nostr_messages SET is_read = 1 WHERE identity_id = ? AND contact_id = ? AND direction = ? AND is_read = 0',
        ['identity-1', 'contact-1', 'incoming']
      );
      const changes = db.getRowsModified();

      // Should have modified 0 rows
      expect(changes).toBe(0);
    });
  });

  describe('getUnreadCounts', () => {
    beforeEach(() => {
      // Insert unread messages for contact-1
      db.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['msg-1', 'identity-1', 'contact-1', 'npub1contact1', 'npub1test', 'Message 1', '2024-01-01T00:00:00Z', 'sent', 'incoming', 0]
      );
      db.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['msg-2', 'identity-1', 'contact-1', 'npub1contact1', 'npub1test', 'Message 2', '2024-01-01T00:01:00Z', 'sent', 'incoming', 0]
      );
      // Insert unread messages for contact-2
      db.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['msg-3', 'identity-1', 'contact-2', 'npub1contact2', 'npub1test', 'From contact 2', '2024-01-01T00:02:00Z', 'sent', 'incoming', 0]
      );
      // Insert read message (should not be counted)
      db.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['msg-4', 'identity-1', 'contact-1', 'npub1contact1', 'npub1test', 'Old read message', '2024-01-01T00:03:00Z', 'sent', 'incoming', 1]
      );
      // Insert outgoing message (should not be counted)
      db.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['msg-5', 'identity-1', 'contact-1', 'npub1test', 'npub1contact1', 'My message', '2024-01-01T00:04:00Z', 'sent', 'outgoing', 1]
      );
    });

    it('should return correct unread counts per contact', () => {
      const result = db.exec(
        'SELECT contact_id, COUNT(*) as count FROM nostr_messages WHERE identity_id = ? AND direction = ? AND is_read = 0 GROUP BY contact_id',
        ['identity-1', 'incoming']
      );

      const counts: Record<string, number> = {};
      for (const row of result[0].values) {
        counts[row[0] as string] = row[1] as number;
      }

      expect(counts['contact-1']).toBe(2);
      expect(counts['contact-2']).toBe(1);
    });

    it('should return empty results when no unread messages', () => {
      // Mark all as read
      db.run('UPDATE nostr_messages SET is_read = 1 WHERE is_read = 0');

      const result = db.exec(
        'SELECT contact_id, COUNT(*) as count FROM nostr_messages WHERE identity_id = ? AND direction = ? AND is_read = 0 GROUP BY contact_id',
        ['identity-1', 'incoming']
      );

      expect(result.length).toBe(0);
    });

    it('should only count incoming messages', () => {
      // Add an unread outgoing message (hypothetical scenario - should still not be counted)
      db.run(
        'INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['msg-6', 'identity-1', 'contact-1', 'npub1test', 'npub1contact1', 'Outgoing unread', '2024-01-01T00:05:00Z', 'queued', 'outgoing', 0]
      );

      const result = db.exec(
        'SELECT COUNT(*) as count FROM nostr_messages WHERE identity_id = ? AND direction = ? AND is_read = 0',
        ['identity-1', 'incoming']
      );

      // Should still be 3 (2 for contact-1, 1 for contact-2)
      expect(result[0].values[0][0]).toBe(3);
    });
  });
});
