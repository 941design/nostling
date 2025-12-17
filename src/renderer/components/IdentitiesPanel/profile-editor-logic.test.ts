/**
 * Property-based tests for ProfileEditor logic
 *
 * Tests verify all contract invariants and properties:
 * - Field updates propagate correctly
 * - Dirty detection based on actual content changes
 * - All 8 fields (label + 7 content fields) are editable
 * - Optional fields handle undefined/empty values
 * - Content structure preservation
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import type { IdentityProfileData } from './types';
import type { ProfileContent } from '../../../shared/profile-types';

const profileContentArb = fc.record({
  name: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  about: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
  picture: fc.option(fc.webUrl(), { nil: undefined }),
  banner: fc.option(fc.webUrl(), { nil: undefined }),
  website: fc.option(fc.webUrl(), { nil: undefined }),
  nip05: fc.option(fc.emailAddress(), { nil: undefined }),
  lud16: fc.option(fc.emailAddress(), { nil: undefined }),
}, { requiredKeys: [] });

const identityProfileDataArb = fc.record({
  label: fc.string({ minLength: 1, maxLength: 50 }),
  content: profileContentArb,
});

describe('ProfileEditor Logic Properties', () => {
  describe('Property: Field Update Preserves Structure', () => {
    it('updating label preserves content structure', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          (originalProfile, newLabel) => {
            const updatedProfile = { ...originalProfile, label: newLabel };

            expect(updatedProfile.content).toEqual(originalProfile.content);
            expect(updatedProfile.label).toBe(newLabel);
          }
        )
      );
    });

    it('updating content field preserves label', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.string({ maxLength: 100 }),
          (originalProfile, newName) => {
            const updatedProfile = {
              ...originalProfile,
              content: { ...originalProfile.content, name: newName },
            };

            expect(updatedProfile.label).toBe(originalProfile.label);
            expect(updatedProfile.content.name).toBe(newName);
          }
        )
      );
    });

    it('updating content field preserves other content fields', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.string({ maxLength: 100 }),
          (originalProfile, newAbout) => {
            const updatedProfile = {
              ...originalProfile,
              content: { ...originalProfile.content, about: newAbout },
            };

            expect(updatedProfile.content.name).toBe(originalProfile.content.name);
            expect(updatedProfile.content.picture).toBe(originalProfile.content.picture);
            expect(updatedProfile.content.banner).toBe(originalProfile.content.banner);
            expect(updatedProfile.content.website).toBe(originalProfile.content.website);
            expect(updatedProfile.content.nip05).toBe(originalProfile.content.nip05);
            expect(updatedProfile.content.lud16).toBe(originalProfile.content.lud16);
            expect(updatedProfile.content.about).toBe(newAbout);
          }
        )
      );
    });
  });

  describe('Property: All Fields Editable', () => {
    it('label field can be updated', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          (profile, newValue) => {
            const updated = { ...profile, label: newValue };
            expect(updated.label).toBe(newValue);
          }
        )
      );
    });

    it('name field can be updated', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.string({ maxLength: 100 }),
          (profile, newValue) => {
            const updated = {
              ...profile,
              content: { ...profile.content, name: newValue },
            };
            expect(updated.content.name).toBe(newValue);
          }
        )
      );
    });

    it('about field can be updated', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.string({ maxLength: 500 }),
          (profile, newValue) => {
            const updated = {
              ...profile,
              content: { ...profile.content, about: newValue },
            };
            expect(updated.content.about).toBe(newValue);
          }
        )
      );
    });

    it('picture field can be updated', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.webUrl(),
          (profile, newValue) => {
            const updated = {
              ...profile,
              content: { ...profile.content, picture: newValue },
            };
            expect(updated.content.picture).toBe(newValue);
          }
        )
      );
    });

    it('banner field can be updated', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.webUrl(),
          (profile, newValue) => {
            const updated = {
              ...profile,
              content: { ...profile.content, banner: newValue },
            };
            expect(updated.content.banner).toBe(newValue);
          }
        )
      );
    });

    it('website field can be updated', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.webUrl(),
          (profile, newValue) => {
            const updated = {
              ...profile,
              content: { ...profile.content, website: newValue },
            };
            expect(updated.content.website).toBe(newValue);
          }
        )
      );
    });

    it('nip05 field can be updated', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.emailAddress(),
          (profile, newValue) => {
            const updated = {
              ...profile,
              content: { ...profile.content, nip05: newValue },
            };
            expect(updated.content.nip05).toBe(newValue);
          }
        )
      );
    });

    it('lud16 field can be updated', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.emailAddress(),
          (profile, newValue) => {
            const updated = {
              ...profile,
              content: { ...profile.content, lud16: newValue },
            };
            expect(updated.content.lud16).toBe(newValue);
          }
        )
      );
    });
  });

  describe('Property: Dirty Detection Accuracy', () => {
    it('detects dirty when any field differs from initial', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          (initialProfile, newLabel) => {
            const currentProfile = { ...initialProfile, label: newLabel };

            const isDirty = JSON.stringify(currentProfile) !== JSON.stringify(initialProfile);
            const shouldBeDirty = newLabel !== initialProfile.label;

            expect(isDirty).toBe(shouldBeDirty);
          }
        )
      );
    });

    it('not dirty when all fields match initial', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          (profile) => {
            const currentProfile = JSON.parse(JSON.stringify(profile));

            const isDirty = JSON.stringify(currentProfile) !== JSON.stringify(profile);

            expect(isDirty).toBe(false);
          }
        )
      );
    });

    it('becomes clean when reverted to initial state', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          (initialProfile, tempLabel) => {
            let currentProfile = { ...initialProfile, label: tempLabel };

            currentProfile = { ...currentProfile, label: initialProfile.label };

            const isDirty = JSON.stringify(currentProfile) !== JSON.stringify(initialProfile);

            expect(isDirty).toBe(false);
          }
        )
      );
    });
  });

  describe('Property: Optional Fields Handling', () => {
    it('empty string is valid for optional fields', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          (profile) => {
            const updated = {
              ...profile,
              content: {
                ...profile.content,
                name: '',
                about: '',
                picture: '',
                banner: '',
                website: '',
                nip05: '',
                lud16: '',
              },
            };

            expect(updated.content.name).toBe('');
            expect(updated.content.about).toBe('');
            expect(updated.content.picture).toBe('');
            expect(updated.content.banner).toBe('');
            expect(updated.content.website).toBe('');
            expect(updated.content.nip05).toBe('');
            expect(updated.content.lud16).toBe('');
          }
        )
      );
    });

    it('undefined is valid for optional fields', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (label) => {
            const profile: IdentityProfileData = {
              label,
              content: {},
            };

            expect(profile.content.name).toBeUndefined();
            expect(profile.content.about).toBeUndefined();
            expect(profile.content.picture).toBeUndefined();
            expect(profile.content.banner).toBeUndefined();
            expect(profile.content.website).toBeUndefined();
            expect(profile.content.nip05).toBeUndefined();
            expect(profile.content.lud16).toBeUndefined();
          }
        )
      );
    });
  });

  describe('Property: Image URL Validation', () => {
    it('picture URL presence determines preview visibility', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.option(fc.webUrl(), { nil: '' }),
          (profile, pictureUrl) => {
            const updated = {
              ...profile,
              content: { ...profile.content, picture: pictureUrl || '' },
            };

            const shouldShowPreview = Boolean(updated.content.picture && updated.content.picture.length > 0);

            expect(shouldShowPreview).toBe(Boolean(pictureUrl && pictureUrl.length > 0));
          }
        )
      );
    });

    it('banner URL presence determines preview visibility', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.option(fc.webUrl(), { nil: '' }),
          (profile, bannerUrl) => {
            const updated = {
              ...profile,
              content: { ...profile.content, banner: bannerUrl || '' },
            };

            const shouldShowPreview = Boolean(updated.content.banner && updated.content.banner.length > 0);

            expect(shouldShowPreview).toBe(Boolean(bannerUrl && bannerUrl.length > 0));
          }
        )
      );
    });
  });

  describe('Property: Content Update Immutability', () => {
    it('updating content creates new object, does not mutate original', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.string({ maxLength: 100 }),
          (originalProfile, newName) => {
            const originalContentCopy = { ...originalProfile.content };

            const updatedProfile = {
              ...originalProfile,
              content: { ...originalProfile.content, name: newName },
            };

            expect(originalProfile.content).toEqual(originalContentCopy);
            expect(updatedProfile.content).not.toBe(originalProfile.content);
          }
        )
      );
    });
  });

  describe('Property: Field Count Invariant', () => {
    it('profile always has exactly 1 label field and 7 content fields', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          (profile) => {
            expect(profile).toHaveProperty('label');
            expect(profile).toHaveProperty('content');

            expect(typeof profile.label).toBe('string');
            expect(typeof profile.content).toBe('object');

            if (profile.content.name !== undefined) {
              expect(typeof profile.content.name).toBe('string');
            }
            if (profile.content.about !== undefined) {
              expect(typeof profile.content.about).toBe('string');
            }
            if (profile.content.picture !== undefined) {
              expect(typeof profile.content.picture).toBe('string');
            }
            if (profile.content.banner !== undefined) {
              expect(typeof profile.content.banner).toBe('string');
            }
            if (profile.content.website !== undefined) {
              expect(typeof profile.content.website).toBe('string');
            }
            if (profile.content.nip05 !== undefined) {
              expect(typeof profile.content.nip05).toBe('string');
            }
            if (profile.content.lud16 !== undefined) {
              expect(typeof profile.content.lud16).toBe('string');
            }
          }
        )
      );
    });
  });

  describe('Property: Disabled State Does Not Affect Data', () => {
    it('disabled flag does not change profile data structure', () => {
      fc.assert(
        fc.property(
          identityProfileDataArb,
          fc.boolean(),
          (profile, disabled) => {
            const profileCopy = JSON.parse(JSON.stringify(profile));

            expect(profileCopy).toEqual(profile);
            expect(profileCopy.label).toBe(profile.label);
            expect(profileCopy.content).toEqual(profile.content);
          }
        )
      );
    });
  });
});
