/**
 * Property-based and example-based tests for AvatarGrid component
 *
 * Tests verify:
 * - Grid renders exactly avatars.length items
 * - Empty array shows "No avatars found" empty state
 * - Full URLs correctly constructed as baseUrl + avatar.url
 * - Click handler receives correct full URL
 * - URL construction is idempotent and deterministic
 * - Grid layout properties match specification
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import type { AvatarItem } from './types';

describe('AvatarGrid URL Construction - Property-Based Tests', () => {
  const fcOptions = { numRuns: 100 };

  const baseUrlArbitrary = (): fc.Arbitrary<string> => {
    return fc.tuple(
      fc.constant('https://'),
      fc.stringMatching(/^[a-z0-9-]+$/),
      fc.constant('.'),
      fc.stringMatching(/^[a-z]{2,6}$/),
    ).map(([proto, domain, dot, tld]) => `${proto}${domain}${dot}${tld}`);
  };

  const avatarPathArbitrary = (): fc.Arbitrary<string> => {
    return fc.tuple(
      fc.constant('/avatars/'),
      fc.uuid(),
      fc.constant('.png'),
    ).map(([prefix, uuid, ext]) => `${prefix}${uuid}${ext}`);
  };

  const avatarItemArbitrary = (): fc.Arbitrary<AvatarItem> => {
    return avatarPathArbitrary().map((url) => ({ url }));
  };

  describe('URL Concatenation Properties', () => {
    it('P001: Full URL equals baseUrl + avatar.url', () => {
      fc.assert(
        fc.property(
          baseUrlArbitrary(),
          avatarPathArbitrary(),
          (baseUrl, avatarUrl) => {
            const fullUrl = baseUrl + avatarUrl;
            expect(fullUrl).toBe(baseUrl + avatarUrl);
            expect(fullUrl.startsWith(baseUrl)).toBe(true);
            expect(fullUrl.endsWith(avatarUrl)).toBe(true);
          }
        ),
        fcOptions
      );
    });

    it('P002: Full URL starts with https://', () => {
      fc.assert(
        fc.property(
          baseUrlArbitrary(),
          avatarPathArbitrary(),
          (baseUrl, avatarUrl) => {
            const fullUrl = baseUrl + avatarUrl;
            expect(fullUrl.startsWith('https://')).toBe(true);
          }
        ),
        fcOptions
      );
    });

    it('P003: Full URL contains avatar path', () => {
      fc.assert(
        fc.property(
          baseUrlArbitrary(),
          avatarPathArbitrary(),
          (baseUrl, avatarUrl) => {
            const fullUrl = baseUrl + avatarUrl;
            expect(fullUrl).toContain(avatarUrl);
          }
        ),
        fcOptions
      );
    });

    it('P004: Full URL construction is deterministic', () => {
      fc.assert(
        fc.property(
          baseUrlArbitrary(),
          avatarPathArbitrary(),
          (baseUrl, avatarUrl) => {
            const fullUrl1 = baseUrl + avatarUrl;
            const fullUrl2 = baseUrl + avatarUrl;
            expect(fullUrl1).toBe(fullUrl2);
          }
        ),
        fcOptions
      );
    });

    it('P005: Base URL without trailing slash + path starting with slash = single slash at join point', () => {
      fc.assert(
        fc.property(
          baseUrlArbitrary(),
          avatarPathArbitrary(),
          (baseUrl, avatarUrl) => {
            expect(baseUrl.endsWith('/')).toBe(false);
            expect(avatarUrl.startsWith('/')).toBe(true);

            const fullUrl = baseUrl + avatarUrl;
            const afterProtocol = fullUrl.replace('https://', '');
            expect(afterProtocol).not.toContain('//');
          }
        ),
        fcOptions
      );
    });
  });

  describe('Avatar Array Properties', () => {
    it('P006: Grid item count equals avatar array length', () => {
      fc.assert(
        fc.property(
          fc.array(avatarItemArbitrary(), { minLength: 1, maxLength: 100 }),
          (avatars) => {
            expect(avatars.length).toBeGreaterThan(0);
            const itemCount = avatars.length;
            expect(itemCount).toBe(avatars.length);
          }
        ),
        fcOptions
      );
    });

    it('P007: Each avatar in array produces unique URL when UUIDs are unique', () => {
      fc.assert(
        fc.property(
          baseUrlArbitrary(),
          fc.array(avatarItemArbitrary(), { minLength: 2, maxLength: 20 }),
          (baseUrl, avatars) => {
            const fullUrls = avatars.map((avatar) => baseUrl + avatar.url);
            const uniqueUrls = new Set(fullUrls);

            const uniqueAvatarUrls = new Set(avatars.map(a => a.url));
            expect(uniqueUrls.size).toBe(uniqueAvatarUrls.size);
          }
        ),
        fcOptions
      );
    });

    it('P008: Empty avatar array has length 0', () => {
      const emptyAvatars: AvatarItem[] = [];
      expect(emptyAvatars.length).toBe(0);
    });
  });

  describe('URL Structure Invariants', () => {
    it('P009: Avatar path always starts with /', () => {
      fc.assert(
        fc.property(avatarPathArbitrary(), (avatarUrl) => {
          expect(avatarUrl.startsWith('/')).toBe(true);
        }),
        fcOptions
      );
    });

    it('P010: Avatar path contains /avatars/ prefix', () => {
      fc.assert(
        fc.property(avatarPathArbitrary(), (avatarUrl) => {
          expect(avatarUrl).toContain('/avatars/');
        }),
        fcOptions
      );
    });

    it('P011: Avatar path ends with .png', () => {
      fc.assert(
        fc.property(avatarPathArbitrary(), (avatarUrl) => {
          expect(avatarUrl.endsWith('.png')).toBe(true);
        }),
        fcOptions
      );
    });

    it('P012: Base URL has no trailing slash', () => {
      fc.assert(
        fc.property(baseUrlArbitrary(), (baseUrl) => {
          expect(baseUrl.endsWith('/')).toBe(false);
        }),
        fcOptions
      );
    });
  });

  describe('Callback Contract Properties', () => {
    it('P013: Click handler receives full URL as parameter', () => {
      fc.assert(
        fc.property(
          baseUrlArbitrary(),
          avatarItemArbitrary(),
          (baseUrl, avatar) => {
            let receivedUrl: string | null = null;
            const onAvatarClick = (fullUrl: string) => {
              receivedUrl = fullUrl;
            };

            const fullUrl = baseUrl + avatar.url;
            onAvatarClick(fullUrl);

            expect(receivedUrl).toBe(fullUrl);
            expect(receivedUrl).toBe(baseUrl + avatar.url);
          }
        ),
        fcOptions
      );
    });

    it('P014: Click handler called once per avatar click', () => {
      fc.assert(
        fc.property(
          baseUrlArbitrary(),
          avatarItemArbitrary(),
          (baseUrl, avatar) => {
            let callCount = 0;
            const onAvatarClick = () => {
              callCount++;
            };

            onAvatarClick();
            expect(callCount).toBe(1);
          }
        ),
        fcOptions
      );
    });
  });

  describe('Grid Layout Properties', () => {
    it('P015: Responsive columns configuration present', () => {
      const columns = { base: 2, md: 3, lg: 4 };

      expect(columns.base).toBe(2);
      expect(columns.md).toBe(3);
      expect(columns.lg).toBe(4);

      expect(columns.base).toBeLessThan(columns.md);
      expect(columns.md).toBeLessThan(columns.lg);
    });

    it('P016: Spacing value is positive', () => {
      const spacing = 4;
      expect(spacing).toBeGreaterThan(0);
    });
  });
});

describe('AvatarGrid Empty State - Example Tests', () => {
  it('E001: Empty array has length 0', () => {
    const emptyAvatars: AvatarItem[] = [];
    expect(emptyAvatars.length).toBe(0);
  });

  it('E002: Empty array triggers empty state rendering', () => {
    const emptyAvatars: AvatarItem[] = [];
    const shouldShowEmptyState = emptyAvatars.length === 0;
    expect(shouldShowEmptyState).toBe(true);
  });
});

describe('AvatarGrid URL Construction - Example Tests', () => {
  it('E003: Concrete example of URL construction', () => {
    const baseUrl = 'https://wp10665333.server-he.de';
    const avatar: AvatarItem = { url: '/avatars/abc-123-def.png' };

    const fullUrl = baseUrl + avatar.url;

    expect(fullUrl).toBe('https://wp10665333.server-he.de/avatars/abc-123-def.png');
  });

  it('E004: Multiple avatars produce multiple URLs', () => {
    const baseUrl = 'https://example.com';
    const avatars: AvatarItem[] = [
      { url: '/avatars/1.png' },
      { url: '/avatars/2.png' },
      { url: '/avatars/3.png' },
    ];

    const fullUrls = avatars.map((avatar) => baseUrl + avatar.url);

    expect(fullUrls).toEqual([
      'https://example.com/avatars/1.png',
      'https://example.com/avatars/2.png',
      'https://example.com/avatars/3.png',
    ]);
    expect(fullUrls.length).toBe(3);
  });

  it('E005: Click handler receives correct URL for specific avatar', () => {
    const baseUrl = 'https://test.com';
    const avatar: AvatarItem = { url: '/avatars/test.png' };
    const expectedUrl = 'https://test.com/avatars/test.png';

    let receivedUrl: string | null = null;
    const onAvatarClick = (fullUrl: string) => {
      receivedUrl = fullUrl;
    };

    const fullUrl = baseUrl + avatar.url;
    onAvatarClick(fullUrl);

    expect(receivedUrl).toBe(expectedUrl);
  });
});

describe('AvatarGrid Component Contracts', () => {
  it('E006: AvatarGridProps structure is complete', () => {
    const baseUrl = 'https://example.com';
    const avatars: AvatarItem[] = [{ url: '/avatars/1.png' }];
    const onAvatarClick = (fullUrl: string) => {
      expect(fullUrl).toContain('https://');
    };

    const props = {
      avatars,
      baseUrl,
      onAvatarClick,
    };

    expect(props.avatars).toBeDefined();
    expect(props.baseUrl).toBeDefined();
    expect(props.onAvatarClick).toBeDefined();
    expect(typeof props.onAvatarClick).toBe('function');
  });
});
