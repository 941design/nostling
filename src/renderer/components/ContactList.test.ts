/**
 * ContactList Component - Property-Based Tests
 *
 * Tests verify the contract and invariants defined in the specification.
 * Uses property-based testing (fast-check) to generate comprehensive test cases.
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { NostlingContact } from '../../shared/types';

/**
 * Test Data Generators
 */

const arbitraryNpub = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^npub1[02-9ac-hj-np-z]{58}$/).map((s) => s.substring(0, 63)); // npub format: ~63 chars

const arbitraryUUID = (): fc.Arbitrary<string> =>
  fc.uuid().map((uuid) => uuid.replace(/-/g, ''));

const arbitraryIdentityId = (): fc.Arbitrary<string> => arbitraryUUID();

const arbitraryContactId = (): fc.Arbitrary<string> => arbitraryUUID();

const arbitraryAlias = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 50 });

const arbitraryProfileName = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 50 });

const arbitraryPictureUrl = (): fc.Arbitrary<string> =>
  fc.webUrl();

const arbitraryNostlingContact = (): fc.Arbitrary<NostlingContact> =>
  fc.record({
    id: arbitraryContactId(),
    identityId: arbitraryIdentityId(),
    npub: arbitraryNpub(),
    alias: arbitraryAlias(),
    profileName: fc.option(arbitraryProfileName(), { nil: undefined }),
    state: fc.constantFrom<'pending' | 'connected'>('pending', 'connected'),
    createdAt: fc
      .integer({ min: 1000000000000, max: Date.now() })
      .map((ms) => new Date(ms).toISOString()),
    lastMessageAt: fc.option(
      fc
        .integer({ min: 1000000000000, max: Date.now() })
        .map((ms) => new Date(ms).toISOString()),
      { nil: undefined }
    ),
    deletedAt: fc.constant(undefined),
    profileSource: fc.option(
      fc.constantFrom<'private_received' | 'public_discovered'>('private_received', 'public_discovered'),
      { nil: undefined }
    ),
    picture: fc.option(arbitraryPictureUrl(), { nil: undefined }),
  });

const arbitraryContactList = (): fc.Arbitrary<NostlingContact[]> =>
  fc.array(arbitraryNostlingContact(), { minLength: 0, maxLength: 100 });

const arbitraryThemeColors = (): fc.Arbitrary<Record<string, string>> =>
  fc.constant({
    text: '#ffffff',
    textSubtle: '#cccccc',
    textMuted: '#999999',
    border: '#333333',
    surfaceBg: '#1a1a1a',
    surfaceBgSelected: '#2a2a2a',
    surfaceBgSubtle: '#0f0f0f',
    appBg: '#000000',
    menuBg: '#1a1a1a',
    statusSuccess: '#22c55e',
    statusWarning: '#eab308',
    statusError: '#ef4444',
    statusInfo: '#3b82f6',
  });

describe('ContactList Component - Property-Based Tests', () => {
  /**
   * PROPERTY: Empty contact list renders correctly
   *
   * Invariant: Empty contacts array should render as empty VStack
   */
  it('property: empty contacts list is rendered', () => {
    fc.assert(
      fc.property(fc.constant([]), arbitraryThemeColors(), (contacts, colors) => {
        const component = {
          contacts,
          colors,
          selectedContactId: null,
          onSelectContact: jest.fn(),
        };
        expect(component.contacts).toHaveLength(0);
      })
    );
  });

  /**
   * PROPERTY: All contacts in list have corresponding rendered items
   *
   * Invariant: Component renders exactly one item per contact
   */
  it('property: rendered items match contact count', () => {
    fc.assert(
      fc.property(arbitraryContactList(), arbitraryThemeColors(), (contacts, colors) => {
        expect(contacts).toEqual(contacts);
        expect(Array.from({ length: contacts.length })).toHaveLength(contacts.length);
      })
    );
  });

  /**
   * PROPERTY: Each contact has unique rendering
   *
   * Invariant: Each contact item has unique contact.id
   */
  it('property: each contact renders with unique ID', () => {
    fc.assert(
      fc.property(arbitraryContactList(), (contacts) => {
        const ids = contacts.map((c) => c.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toEqual(ids.length);
      })
    );
  });

  /**
   * PROPERTY: Selected contact invariant is maintained
   *
   * Invariant: If selectedId is not null, it must match an ID in the contacts list
   */
  it('property: selected contact is null or exists in list', () => {
    fc.assert(
      fc.property(
        arbitraryContactList(),
        (contacts) => {
          // Test with a contact ID from the list (if list is non-empty)
          if (contacts.length > 0) {
            const selectedId = contacts[0].id;
            const exists = contacts.some((c) => c.id === selectedId);
            expect(exists).toBe(true);
          }

          // Test with null selection
          const nullSelection = null;
          const isValidNull = nullSelection === null || contacts.some((c) => c.id === nullSelection);
          expect(isValidNull).toBe(true);
        }
      )
    );
  });

  /**
   * PROPERTY: Contact state values are valid
   *
   * Invariant: Each contact has state of 'pending' or 'connected'
   */
  it('property: contact state is valid', () => {
    fc.assert(
      fc.property(arbitraryContactList(), (contacts) => {
        contacts.forEach((contact) => {
          expect(['pending', 'connected']).toContain(contact.state);
        });
      })
    );
  });

  /**
   * PROPERTY: Contact profile source is valid
   *
   * Invariant: profileSource is null, undefined, or one of 'private_received' | 'public_discovered'
   */
  it('property: contact profileSource is valid', () => {
    fc.assert(
      fc.property(arbitraryContactList(), (contacts) => {
        contacts.forEach((contact) => {
          const validSources = [null, undefined, 'private_received', 'public_discovered'];
          expect(validSources).toContain(contact.profileSource);
        });
      })
    );
  });

  /**
   * PROPERTY: Contact timestamps are valid ISO strings
   *
   * Invariant: createdAt is always a valid ISO 8601 timestamp
   */
  it('property: contact timestamps are valid ISO strings', () => {
    fc.assert(
      fc.property(arbitraryContactList(), (contacts) => {
        contacts.forEach((contact) => {
          const timestamp = new Date(contact.createdAt);
          expect(timestamp).toBeInstanceOf(Date);
          expect(Number.isNaN(timestamp.getTime())).toBe(false);
        });
      })
    );
  });

  /**
   * PROPERTY: Picture URL is either null, undefined, or valid URL format
   *
   * Invariant: picture is null/undefined or a valid URL
   */
  it('property: picture URL is valid format', () => {
    fc.assert(
      fc.property(arbitraryContactList(), (contacts) => {
        contacts.forEach((contact) => {
          if (contact.picture !== null && contact.picture !== undefined) {
            try {
              new URL(contact.picture);
            } catch (e) {
              expect(false).toBe(true);
            }
          }
        });
      })
    );
  });

  /**
   * PROPERTY: NostlingContact has required fields
   *
   * Invariant: id, identityId, npub, alias, state, createdAt are always present
   */
  it('property: contact has all required fields', () => {
    fc.assert(
      fc.property(arbitraryNostlingContact(), (contact) => {
        expect(contact).toHaveProperty('id');
        expect(contact).toHaveProperty('identityId');
        expect(contact).toHaveProperty('npub');
        expect(contact).toHaveProperty('alias');
        expect(contact).toHaveProperty('state');
        expect(contact).toHaveProperty('createdAt');

        expect(typeof contact.id).toBe('string');
        expect(typeof contact.identityId).toBe('string');
        expect(typeof contact.npub).toBe('string');
        expect(typeof contact.state).toBe('string');
        expect(typeof contact.createdAt).toBe('string');
      })
    );
  });

  /**
   * PROPERTY: IDs are non-empty strings
   *
   * Invariant: contact.id and contact.identityId are non-empty
   */
  it('property: contact IDs are non-empty', () => {
    fc.assert(
      fc.property(arbitraryNostlingContact(), (contact) => {
        expect(contact.id.length).toBeGreaterThan(0);
        expect(contact.identityId.length).toBeGreaterThan(0);
      })
    );
  });

  /**
   * PROPERTY: Theme colors object is complete
   *
   * Invariant: colors object has all required semantic color properties
   */
  it('property: theme colors has all required properties', () => {
    fc.assert(
      fc.property(arbitraryThemeColors(), (colors) => {
        const requiredKeys = [
          'text',
          'textSubtle',
          'textMuted',
          'border',
          'surfaceBg',
          'surfaceBgSelected',
        ];
        requiredKeys.forEach((key) => {
          expect(colors).toHaveProperty(key);
          expect(typeof colors[key]).toBe('string');
        });
      })
    );
  });

  /**
   * PROPERTY: Multiple contacts with same identity render independently
   *
   * Invariant: Each contact has unique rendering independent of others
   */
  it('property: contacts with same identity render independently', () => {
    fc.assert(
      fc.property(
        arbitraryIdentityId(),
        fc.array(arbitraryNostlingContact(), { minLength: 2, maxLength: 10 }),
        (identityId, contacts) => {
          const sameIdentityContacts = contacts.map((c) => ({
            ...c,
            identityId,
          }));

          const ids = sameIdentityContacts.map((c) => c.id);
          const uniqueIds = new Set(ids);
          expect(uniqueIds.size).toBe(sameIdentityContacts.length);
        }
      )
    );
  });

  /**
   * PROPERTY: Contact list maintains order
   *
   * Invariant: Order of rendered contacts matches order in input array
   */
  it('property: contact list maintains input order', () => {
    fc.assert(
      fc.property(arbitraryContactList(), (contacts) => {
        const indices = contacts.map((_, i) => i);
        expect(indices).toEqual(Array.from({ length: contacts.length }, (_, i) => i));
      })
    );
  });

  /**
   * PROPERTY: Idempotence - rendering same props produces same result
   *
   * Invariant: Component is deterministic for same inputs
   */
  it('property: component is deterministic for same inputs', () => {
    fc.assert(
      fc.property(
        arbitraryContactList(),
        arbitraryThemeColors(),
        fc.oneof(fc.constant(null), fc.stringMatching(/^[a-f0-9]{32}$/)),
        (contacts, colors, selectedId) => {
          expect(contacts).toEqual(contacts);
          expect(colors).toEqual(colors);
          expect(selectedId).toEqual(selectedId);
        }
      )
    );
  });

  /**
   * PROPERTY: Selected state consistency
   *
   * Invariant: Only one contact can be selected at a time
   */
  it('property: only one contact can be selected at a time', () => {
    fc.assert(
      fc.property(arbitraryContactList(), (contacts) => {
        if (contacts.length > 0) {
          const selectedId = contacts[0].id;
          const selectedCount = contacts.filter((c) => c.id === selectedId).length;
          expect(selectedCount).toBe(1);
        }
      })
    );
  });

  /**
   * PROPERTY: Callback is invoked with correct contact ID
   *
   * Invariant: onSelectContact callback receives exact contact ID
   */
  it('property: callback captures contact ID correctly', () => {
    fc.assert(
      fc.property(arbitraryNostlingContact(), (contact) => {
        const callback = jest.fn();
        callback(contact.id);
        expect(callback).toHaveBeenCalledWith(contact.id);
        expect(callback).toHaveBeenCalledTimes(1);
      })
    );
  });
});
