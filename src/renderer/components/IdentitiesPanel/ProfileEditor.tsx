/**
 * ProfileEditor Component
 *
 * Form for editing all identity profile fields with live preview.
 * Supports both identity-specific fields (label) and profile content fields
 * (name, about, picture, banner, website, nip05, lud16).
 *
 * SPECIFICATION FOR pbt-dev AGENT:
 *
 * CONTRACT:
 *   Inputs:
 *     - profile: IdentityProfileData containing label and content
 *       Constraints: label is non-empty string, content is ProfileContent object
 *     - disabled: optional boolean flag for disabling form during save
 *       Default: false
 *     - onChange: callback function invoked when any field changes
 *       Signature: (profile: IdentityProfileData) => void
 *     - onDirtyChange: optional callback invoked when dirty state toggles
 *       Signature: (isDirty: boolean) => void
 *
 *   Outputs:
 *     - React element rendering form fields
 *     - Calls onChange with updated profile on every field change
 *     - Calls onDirtyChange when dirty state transitions
 *
 *   Invariants:
 *     - onChange is called immediately when user types (live preview)
 *     - Dirty state is true when current profile differs from initial profile
 *     - All fields are optional except label (can be empty strings)
 *     - Image previews only shown when picture/banner URLs are non-empty
 *     - Form is disabled when disabled prop is true
 *
 *   Properties:
 *     - Reactivity: Field changes immediately propagate via onChange
 *     - Dirty tracking: onDirtyChange called on transition from clean to dirty and vice versa
 *     - Image preview: Valid image URLs display preview, invalid URLs show no preview
 *     - Accessibility: All fields have proper labels and ARIA attributes
 *
 *   Algorithm:
 *     1. Initialize component:
 *        a. Store initial profile in ref for dirty comparison
 *        b. Create controlled input state from props.profile
 *     2. On field change (onChange handler for each input):
 *        a. Update local state with new value
 *        b. Create updated IdentityProfileData object
 *        c. Calculate dirty state: compare updated profile to initial profile
 *        d. If dirty state changed, call onDirtyChange
 *        e. Call props.onChange with updated profile
 *     3. Render form:
 *        a. Label field (identity-specific, required)
 *        b. Name field (ProfileContent)
 *        c. About field (ProfileContent, multiline textarea)
 *        d. Picture URL field with image preview if valid
 *        e. Banner URL field with image preview if valid
 *        f. Website URL field
 *        g. NIP-05 field (verification identifier)
 *        h. LUD16 field (Lightning address)
 *     4. Image preview logic:
 *        a. Show img element when URL is non-empty string
 *        b. Handle image load errors gracefully (onError handler)
 *        c. Use max width/height constraints for preview
 *
 *   Styling:
 *     - Use useThemeColors hook for consistent theming
 *     - Use Chakra UI Input, Textarea, Field components
 *     - Use VStack for vertical field layout with consistent spacing
 *     - Image previews: max width 200px, max height 150px, rounded corners
 *     - Disabled state: reduce opacity to 0.6
 *
 *   Testing Considerations:
 *     - Property: onChange called exactly once per field change
 *     - Property: dirty state reflects actual data changes (not just typing events)
 *     - Property: all 8 fields are rendered and editable
 *     - Property: image preview only visible when URL non-empty
 *     - Property: form respects disabled prop
 *
 * TODO (pbt-dev): Implement using React hooks and Chakra UI
 *   - Use useState for controlled form inputs
 *   - Use useRef to store initial profile for dirty comparison
 *   - Use useCallback for onChange handlers
 *   - Use useEffect to call onDirtyChange when dirty state changes
 *   - Import Field, Input, Textarea from @chakra-ui/react
 *   - Import useThemeColors from themes/ThemeContext
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { VStack, Box, Image, HStack, Button } from '@chakra-ui/react';
import { Field } from '@chakra-ui/react';
import { Input } from '@chakra-ui/react';
import { Textarea } from '@chakra-ui/react';
import type { ProfileEditorProps, IdentityProfileData } from './types';
import { useThemeColors } from '../../themes/ThemeContext';
import { AvatarBrowserModal } from '../AvatarBrowserModal/AvatarBrowserModal';

export function ProfileEditor({
  profile,
  disabled = false,
  onChange,
  onDirtyChange,
}: ProfileEditorProps): React.ReactElement {
  const colors = useThemeColors();
  const initialProfileRef = useRef<IdentityProfileData>(profile);
  const [isDirty, setIsDirty] = useState(false);
  const [pictureError, setPictureError] = useState(false);
  const [bannerError, setBannerError] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  // Reset initial profile when prop changes from outside
  useEffect(() => {
    initialProfileRef.current = profile;
    setIsDirty(false);
  }, [profile]);

  // Calculate and notify dirty state
  const updateDirtyState = useCallback((updatedProfile: IdentityProfileData) => {
    const newIsDirty = JSON.stringify(updatedProfile) !== JSON.stringify(initialProfileRef.current);
    if (newIsDirty !== isDirty) {
      setIsDirty(newIsDirty);
      onDirtyChange?.(newIsDirty);
    }
  }, [isDirty, onDirtyChange]);

  // Handle field changes
  const handleLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const updated = { ...profile, label: e.target.value };
    onChange(updated);
    updateDirtyState(updated);
  }, [profile, onChange, updateDirtyState]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const updated = {
      ...profile,
      content: { ...profile.content, name: e.target.value },
    };
    onChange(updated);
    updateDirtyState(updated);
  }, [profile, onChange, updateDirtyState]);

  const handleAboutChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const updated = {
      ...profile,
      content: { ...profile.content, about: e.target.value },
    };
    onChange(updated);
    updateDirtyState(updated);
  }, [profile, onChange, updateDirtyState]);

  const handlePictureChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPictureError(false);
    const updated = {
      ...profile,
      content: { ...profile.content, picture: e.target.value },
    };
    onChange(updated);
    updateDirtyState(updated);
  }, [profile, onChange, updateDirtyState]);

  const handleBannerChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setBannerError(false);
    const updated = {
      ...profile,
      content: { ...profile.content, banner: e.target.value },
    };
    onChange(updated);
    updateDirtyState(updated);
  }, [profile, onChange, updateDirtyState]);

  const handleWebsiteChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const updated = {
      ...profile,
      content: { ...profile.content, website: e.target.value },
    };
    onChange(updated);
    updateDirtyState(updated);
  }, [profile, onChange, updateDirtyState]);

  const handleNip05Change = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const updated = {
      ...profile,
      content: { ...profile.content, nip05: e.target.value },
    };
    onChange(updated);
    updateDirtyState(updated);
  }, [profile, onChange, updateDirtyState]);

  const handleLud16Change = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const updated = {
      ...profile,
      content: { ...profile.content, lud16: e.target.value },
    };
    onChange(updated);
    updateDirtyState(updated);
  }, [profile, onChange, updateDirtyState]);

  const handleOpenAvatarBrowser = useCallback(() => {
    setIsAvatarModalOpen(true);
  }, []);

  const handleCloseAvatarBrowser = useCallback(() => {
    setIsAvatarModalOpen(false);
  }, []);

  const handleAvatarSelected = useCallback((avatarUrl: string) => {
    setPictureError(false);
    const updated = {
      ...profile,
      content: { ...profile.content, picture: avatarUrl },
    };
    onChange(updated);
    updateDirtyState(updated);
  }, [profile, onChange, updateDirtyState]);

  const opacity = disabled ? 0.6 : 1;

  return (
    <VStack gap={4} align="stretch" opacity={opacity}>
      <Field.Root required>
        <Field.Label>Label</Field.Label>
        <Input
          value={profile.label}
          onChange={handleLabelChange}
          disabled={disabled}
          placeholder="Work, Personal, etc."
          data-testid="profile-editor-label"
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>Name</Field.Label>
        <Input
          value={profile.content.name || ''}
          onChange={handleNameChange}
          disabled={disabled}
          placeholder="Display name"
          data-testid="profile-editor-name"
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>About</Field.Label>
        <Textarea
          value={profile.content.about || ''}
          onChange={handleAboutChange}
          disabled={disabled}
          placeholder="Bio or description"
          rows={4}
          data-testid="profile-editor-about"
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>Picture URL</Field.Label>
        <HStack gap={2}>
          <Input
            value={profile.content.picture || ''}
            onChange={handlePictureChange}
            disabled={disabled}
            placeholder="https://example.com/avatar.jpg"
            data-testid="profile-editor-picture"
            flex={1}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleOpenAvatarBrowser}
            disabled={disabled}
            data-testid="profile-editor-browse-button"
          >
            Browse
          </Button>
        </HStack>
        {profile.content.picture && !pictureError && (
          <Box mt={2}>
            <Image
              src={profile.content.picture}
              alt="Profile picture preview"
              maxW="200px"
              maxH="150px"
              borderRadius="md"
              onError={() => setPictureError(true)}
              data-testid="profile-editor-picture-preview"
            />
          </Box>
        )}
      </Field.Root>

      <Field.Root>
        <Field.Label>Banner URL</Field.Label>
        <Input
          value={profile.content.banner || ''}
          onChange={handleBannerChange}
          disabled={disabled}
          placeholder="https://example.com/banner.jpg"
          data-testid="profile-editor-banner"
        />
        {profile.content.banner && !bannerError && (
          <Box mt={2}>
            <Image
              src={profile.content.banner}
              alt="Banner preview"
              maxW="200px"
              maxH="150px"
              borderRadius="md"
              onError={() => setBannerError(true)}
              data-testid="profile-editor-banner-preview"
            />
          </Box>
        )}
      </Field.Root>

      <Field.Root>
        <Field.Label>Website</Field.Label>
        <Input
          value={profile.content.website || ''}
          onChange={handleWebsiteChange}
          disabled={disabled}
          placeholder="https://example.com"
          data-testid="profile-editor-website"
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>NIP-05 Identifier</Field.Label>
        <Input
          value={profile.content.nip05 || ''}
          onChange={handleNip05Change}
          disabled={disabled}
          placeholder="user@domain.com"
          data-testid="profile-editor-nip05"
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>Lightning Address (LUD16)</Field.Label>
        <Input
          value={profile.content.lud16 || ''}
          onChange={handleLud16Change}
          disabled={disabled}
          placeholder="user@lightning.address"
          data-testid="profile-editor-lud16"
        />
      </Field.Root>

      <AvatarBrowserModal
        isOpen={isAvatarModalOpen}
        onClose={handleCloseAvatarBrowser}
        onAvatarSelected={handleAvatarSelected}
      />
    </VStack>
  );
}

ProfileEditor.displayName = 'ProfileEditor';
