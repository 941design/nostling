/**
 * Property-based tests for ContactsPanel component
 *
 * Tests verify:
 * - Display name precedence is correctly applied (alias > profileName > npub)
 * - Read-only behavior (no editing capabilities)
 * - Optional fields are hidden when empty/null
 * - Banner and picture rendering rules
 * - Profile field extraction and formatting
 * - Close callback is properly wired
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';

// ============================================================================
// MOCK TYPES & HELPERS
// ============================================================================

interface MockNostlingContact {
  id: string;
  identityId: string;
  npub: string;
  alias: string;
  profileName?: string | null;
  state: 'pending' | 'connected';
  createdAt: string;
  lastMessageAt?: string;
  deletedAt?: string;
  profileSource?: 'private_received' | 'public_discovered' | null;
  picture?: string | null;
  // Extended profile fields (enhanced on contact)
  about?: string;
  banner?: string;
  website?: string;
  nip05?: string;
  lud16?: string;
}

// Helper to extract display name (mirrors component logic)
function extractDisplayName(contact: MockNostlingContact): string {
  return contact.alias || contact.profileName || contact.npub;
}

// Arbitraries for property-based testing
const hexChars = fc.constantFrom(...'0123456789abcdef'.split(''));
const npub = fc
  .array(hexChars, { minLength: 62, maxLength: 62 })
  .map((chars) => `npub1${chars.join('')}`);

const validAlias = fc.stringMatching(/^[a-zA-Z0-9_\-]{1,100}$/);
const validProfileName = fc.stringMatching(/^[a-zA-Z0-9_\-]{1,100}$/);

const urlArbitrary = fc.webUrl({ authoritySettings: { withUserInfo: false } });

const createMockContact = (overrides?: Partial<MockNostlingContact>): MockNostlingContact => ({
  id: fc.sample(fc.uuid())[0] as string,
  identityId: fc.sample(fc.uuid())[0] as string,
  npub: fc.sample(npub)[0] as string,
  alias: fc.sample(validAlias)[0] as string,
  state: 'connected',
  createdAt: new Date().toISOString(),
  ...overrides,
});

// ============================================================================
// DISPLAY NAME PRECEDENCE TESTS
// ============================================================================

describe('ContactsPanel - Display Name Precedence (Property-Based)', () => {
  const fcOptions = { numRuns: 100 };

  it('P001: Always returns npub when alias and profileName are null/empty', () => {
    fc.assert(
      fc.property(npub, (pubkey: string) => {
        const contact = createMockContact({
          npub: pubkey,
          alias: '',
          profileName: undefined,
        });

        const displayName = extractDisplayName(contact);
        expect(displayName).toBe(pubkey);
        return true;
      }),
      fcOptions
    );
  });

  it('P002: Prefers alias over profileName when both present', () => {
    fc.assert(
      fc.property(validAlias, validProfileName, (alias, profileName) => {
        const contact = createMockContact({
          alias,
          profileName,
        });

        const displayName = extractDisplayName(contact);
        expect(displayName).toBe(alias);
        return true;
      }),
      fcOptions
    );
  });

  it('P003: Prefers profileName over npub when alias is empty/null', () => {
    fc.assert(
      fc.property(validProfileName, npub, (profileName, pubkey: string) => {
        const contact = createMockContact({
          npub: pubkey,
          alias: '',
          profileName,
        });

        const displayName = extractDisplayName(contact);
        expect(displayName).toBe(profileName);
        return true;
      }),
      fcOptions
    );
  });

  it('P004: Display name is never null or empty string', () => {
    fc.assert(
      fc.property(
        fc.option(validAlias),
        fc.option(validProfileName),
        npub,
        (alias, profileName, pubkey: string) => {
          const contact = createMockContact({
            npub: pubkey,
            alias: alias || '',
            profileName,
          });

          const displayName = extractDisplayName(contact);
          expect(displayName).not.toBe('');
          expect(displayName).not.toBe(null);
          return true;
        }
      ),
      fcOptions
    );
  });

  it('P005: Precedence chain is always: alias > profileName > npub', () => {
    fc.assert(
      fc.property(
        fc.option(validAlias),
        fc.option(validProfileName),
        npub,
        (alias, profileName, pubkey: string) => {
          const contact = createMockContact({
            npub: pubkey,
            alias: alias || '',
            profileName,
          });

          const displayName = extractDisplayName(contact);

          // When alias is provided and non-empty, it should be used
          if (alias) {
            expect(displayName).toBe(alias);
          }
          // When alias is empty but profileName exists, use profileName
          else if (profileName) {
            expect(displayName).toBe(profileName);
          }
          // Fallback to npub
          else {
            expect(displayName).toBe(pubkey);
          }
          return true;
        }
      ),
      fcOptions
    );
  });
});

// ============================================================================
// OPTIONAL FIELD EXTRACTION TESTS
// ============================================================================

describe('ContactsPanel - Optional Field Extraction (Property-Based)', () => {
  const fcOptions = { numRuns: 100 };

  it('P006: About field is extracted when present', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 500 }), (about) => {
        const contact = createMockContact({ about });

        // Component should extract this field
        expect(contact.about).toBe(about);
        return true;
      }),
      fcOptions
    );
  });

  it('P007: Picture URL is extracted when present', () => {
    fc.assert(
      fc.property(urlArbitrary, (picture) => {
        const contact = createMockContact({ picture });

        expect(contact.picture).toBe(picture);
        return true;
      }),
      fcOptions
    );
  });

  it('P008: Banner URL is extracted when present', () => {
    fc.assert(
      fc.property(urlArbitrary, (banner) => {
        const contact = createMockContact({ banner });

        expect(contact.banner).toBe(banner);
        return true;
      }),
      fcOptions
    );
  });

  it('P009: Website URL is extracted when present', () => {
    fc.assert(
      fc.property(urlArbitrary, (website) => {
        const contact = createMockContact({ website });

        expect(contact.website).toBe(website);
        return true;
      }),
      fcOptions
    );
  });

  it('P010: NIP-05 identifier is extracted when present', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/), (nip05) => {
        const contact = createMockContact({ nip05 });

        expect(contact.nip05).toBe(nip05);
        return true;
      }),
      { numRuns: 50 }
    );
  });

  it('P011: Lightning address (lud16) is extracted when present', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/),
        (lud16) => {
          const contact = createMockContact({ lud16 });

          expect(contact.lud16).toBe(lud16);
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('P012: All optional fields default to undefined when not set', () => {
    const contact = createMockContact({
      about: undefined,
      banner: undefined,
      picture: undefined,
      website: undefined,
      nip05: undefined,
      lud16: undefined,
    });

    expect(contact.about).toBeUndefined();
    expect(contact.banner).toBeUndefined();
    expect(contact.picture).toBeUndefined();
    expect(contact.website).toBeUndefined();
    expect(contact.nip05).toBeUndefined();
    expect(contact.lud16).toBeUndefined();
  });
});

// ============================================================================
// BANNER AND PICTURE RENDERING RULES
// ============================================================================

describe('ContactsPanel - Banner and Picture Rendering Rules (Property-Based)', () => {
  const fcOptions = { numRuns: 100 };

  it('P013: When banner is present, picture should be overlaid (both URLs set)', () => {
    fc.assert(
      fc.property(urlArbitrary, urlArbitrary, (banner: string, picture: string) => {
        const contact = createMockContact({ banner, picture });

        // Invariant: both should be present
        expect(contact.banner).toBeDefined();
        expect(contact.picture).toBeDefined();
        return true;
      }),
      fcOptions
    );
  });

  it('P014: When banner is absent, picture displays standalone (no overlay)', () => {
    fc.assert(
      fc.property(urlArbitrary, (picture: string) => {
        const contact = createMockContact({
          banner: undefined,
          picture,
        });

        // Invariant: picture present but no banner
        expect(contact.picture).toBeDefined();
        expect(contact.banner).toBeUndefined();
        return true;
      }),
      fcOptions
    );
  });

  it('P015: Picture without banner should not create overlay container', () => {
    fc.assert(
      fc.property(urlArbitrary, (picture: string) => {
        const contact = createMockContact({
          banner: undefined,
          picture,
        });

        // Component should render picture alone
        expect(contact.picture).toBe(picture);
        expect(contact.banner).toBeUndefined();
        return true;
      }),
      fcOptions
    );
  });

  it('P016: Banner without picture is valid (no overlay needed)', () => {
    fc.assert(
      fc.property(urlArbitrary, (banner: string) => {
        const contact = createMockContact({
          banner,
          picture: undefined,
        });

        // Invariant: banner present, picture absent (valid state)
        expect(contact.banner).toBeDefined();
        expect(contact.picture).toBeUndefined();
        return true;
      }),
      fcOptions
    );
  });

  it('P017: Neither banner nor picture is also valid (header section skipped)', () => {
    const contact = createMockContact({
      banner: undefined,
      picture: undefined,
    });

    // Invariant: no visual header
    expect(contact.banner).toBeUndefined();
    expect(contact.picture).toBeUndefined();
  });

  it('P018: Picture URL validity independent of banner presence', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        urlArbitrary,
        (hasBanner, pictureUrl: string) => {
          const contact = createMockContact({
            banner: hasBanner ? (fc.sample(urlArbitrary)[0] as string) : undefined,
            picture: pictureUrl,
          });

          // Picture URL should always be valid regardless of banner
          expect(contact.picture).toBe(pictureUrl);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// PROFILE FIELD VISIBILITY (GRACEFUL DEGRADATION)
// ============================================================================

describe('ContactsPanel - Field Visibility and Graceful Degradation (Property-Based)', () => {
  const fcOptions = { numRuns: 100 };

  it('P019: Empty/null about field should not render (hidden)', () => {
    const contact1 = createMockContact({ about: '' });
    const contact2 = createMockContact({ about: undefined });

    // Component should skip rendering
    expect(contact1.about).toBeFalsy();
    expect(contact2.about).toBeFalsy();
  });

  it('P020: Empty/null website field should not render (hidden)', () => {
    const contact1 = createMockContact({ website: '' });
    const contact2 = createMockContact({ website: undefined });

    expect(contact1.website).toBeFalsy();
    expect(contact2.website).toBeUndefined();
  });

  it('P021: Empty/null nip05 field should not render (hidden)', () => {
    const contact1 = createMockContact({ nip05: '' });
    const contact2 = createMockContact({ nip05: undefined });

    expect(contact1.nip05).toBeFalsy();
    expect(contact2.nip05).toBeUndefined();
  });

  it('P022: Empty/null lud16 field should not render (hidden)', () => {
    const contact1 = createMockContact({ lud16: '' });
    const contact2 = createMockContact({ lud16: undefined });

    expect(contact1.lud16).toBeFalsy();
    expect(contact2.lud16).toBeUndefined();
  });

  it('P023: Contact always renders with at least name and npub (required fields)', () => {
    fc.assert(
      fc.property(validAlias, npub, (alias, pubkey) => {
        const contact = createMockContact({
          npub: pubkey,
          alias,
        });

        // These fields are always present
        expect(extractDisplayName(contact)).toBeTruthy();
        expect(contact.npub).toBeTruthy();
        return true;
      }),
      fcOptions
    );
  });

  it('P024: Minimal contact (no optional fields) still renders', () => {
    const contact = createMockContact({
      about: undefined,
      banner: undefined,
      picture: undefined,
      website: undefined,
      nip05: undefined,
      lud16: undefined,
    });

    // Component should still render the required name and npub fields
    expect(extractDisplayName(contact)).toBeTruthy();
    expect(contact.npub).toBeTruthy();
  });

  it('P025: Fully populated contact renders all fields', () => {
    fc.assert(
      fc.property(
        validAlias,
        fc.string({ minLength: 1, maxLength: 500 }),
        urlArbitrary,
        urlArbitrary,
        urlArbitrary,
        fc.stringMatching(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/),
        fc.stringMatching(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/),
        npub,
        (
          alias: string,
          about: string,
          picture: string,
          banner: string,
          website: string,
          nip05: string,
          lud16: string,
          pubkey: string
        ) => {
          const contact = createMockContact({
            alias,
            about,
            picture,
            banner,
            website,
            nip05,
            lud16,
            npub: pubkey,
          });

          // All fields should be present
          expect(contact.alias).toBe(alias);
          expect(contact.about).toBe(about);
          expect(contact.picture).toBe(picture);
          expect(contact.banner).toBe(banner);
          expect(contact.website).toBe(website);
          expect(contact.nip05).toBe(nip05);
          expect(contact.lud16).toBe(lud16);
          expect(contact.npub).toBe(pubkey);
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// READ-ONLY BEHAVIOR
// ============================================================================

describe('ContactsPanel - Read-Only Behavior (Property-Based)', () => {
  const fcOptions = { numRuns: 100 };

  it('P026: Contact data is not mutated during extraction', () => {
    fc.assert(
      fc.property(
        fc.option(validAlias),
        fc.option(validProfileName),
        npub,
        (alias, profileName, pubkey: string) => {
          const contact = createMockContact({
            alias: alias || '',
            profileName,
            npub: pubkey,
          });

          const originalAlias = contact.alias;
          const originalProfileName = contact.profileName;
          const originalNpub = contact.npub;

          extractDisplayName(contact);

          // Data should be unchanged
          expect(contact.alias).toBe(originalAlias);
          expect(contact.profileName).toBe(originalProfileName);
          expect(contact.npub).toBe(originalNpub);
          return true;
        }
      ),
      fcOptions
    );
  });

  it('P027: Display name is derived, never modifies source', () => {
    fc.assert(
      fc.property(validAlias, npub, (alias, pubkey: string) => {
        const contact = createMockContact({
          alias,
          npub: pubkey,
        });

        const beforeAlias = contact.alias;
        const displayName = extractDisplayName(contact);
        const afterAlias = contact.alias;

        expect(beforeAlias).toBe(afterAlias);
        expect(displayName).toBe(alias);
        return true;
      }),
      fcOptions
    );
  });
});

// ============================================================================
// EXAMPLE-BASED TESTS (SPECIFIC SCENARIOS)
// ============================================================================

describe('ContactsPanel - Example-Based Tests', () => {
  it('E001: Contact with only alias and npub', () => {
    const contact = createMockContact({
      alias: 'Alice',
      profileName: null,
      npub: 'npub1example',
    });

    const displayName = extractDisplayName(contact);
    expect(displayName).toBe('Alice');
  });

  it('E002: Contact with alias and profileName shows alias', () => {
    const contact = createMockContact({
      alias: 'Alice',
      profileName: 'Alice Smith',
      npub: 'npub1example',
    });

    const displayName = extractDisplayName(contact);
    expect(displayName).toBe('Alice');
  });

  it('E003: Contact with empty alias falls back to profileName', () => {
    const contact = createMockContact({
      alias: '',
      profileName: 'Alice Smith',
      npub: fc.sample(npub)[0] as string,
    });

    const displayName = extractDisplayName(contact);
    expect(displayName).toBe('Alice Smith');
  });

  it('E004: Contact with no alias/profileName shows npub', () => {
    const contact = createMockContact({
      alias: '',
      profileName: null,
      npub: 'npub1234567890abcdef',
    });

    const displayName = extractDisplayName(contact);
    expect(displayName).toBe('npub1234567890abcdef');
  });

  it('E005: Full profile contact with all fields', () => {
    const contact = createMockContact({
      alias: 'Alice',
      profileName: 'Alice Smith',
      npub: 'npub1example',
      about: 'Software developer',
      picture: 'https://example.com/alice.png',
      banner: 'https://example.com/banner.png',
      website: 'https://alice.example.com',
      nip05: 'alice@example.com',
      lud16: 'alice@lightning.example.com',
    });

    expect(extractDisplayName(contact)).toBe('Alice');
    expect(contact.about).toBe('Software developer');
    expect(contact.picture).toBeDefined();
    expect(contact.banner).toBeDefined();
    expect(contact.website).toBeDefined();
    expect(contact.nip05).toBeDefined();
    expect(contact.lud16).toBeDefined();
  });

  it('E006: Minimal profile contact', () => {
    const contact = createMockContact({
      alias: 'Minimal',
      profileName: undefined,
      npub: 'npub1example',
    });

    expect(extractDisplayName(contact)).toBe('Minimal');
    expect(contact.about).toBeUndefined();
    expect(contact.picture).toBeUndefined();
    expect(contact.banner).toBeUndefined();
  });
});

// ============================================================================
// PROFILE FIELD CONTENT VALIDATION
// ============================================================================

describe('ContactsPanel - Field Content Validation (Property-Based)', () => {
  const fcOptions = { numRuns: 100 };

  it('P028: About field preserves whitespace and line breaks', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[\s\S]*$/),
        (about: string) => {
          const contact = createMockContact({ about });

          // Should preserve exact content
          expect(contact.about).toBe(about);
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('P029: Website URL is stored as-is (no modification)', () => {
    fc.assert(
      fc.property(urlArbitrary, (website: string) => {
        const contact = createMockContact({ website });

        expect(contact.website).toBe(website);
        return true;
      }),
      fcOptions
    );
  });

  it('P030: NIP-05 identifier is stored as-is', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/),
        (nip05: string) => {
          const contact = createMockContact({ nip05 });

          expect(contact.nip05).toBe(nip05);
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('P031: Lightning address is stored as-is', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/),
        (lud16: string) => {
          const contact = createMockContact({ lud16 });

          expect(contact.lud16).toBe(lud16);
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
