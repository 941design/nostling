/**
 * IdentitiesPanel Component
 *
 * Main panel for editing identity profiles. Manages identity selection,
 * profile loading/saving, and coordinates with ProfileEditor.
 *
 * SPECIFICATION FOR pbt-dev AGENT:
 *
 * CONTRACT:
 *   Inputs:
 *     - selectedIdentityId: string | null, currently selected identity for editing
 *     - onSelectIdentity: callback to notify parent of identity selection change
 *       Signature: (identityId: string) => void
 *     - onCancel: callback to return to chat view
 *       Signature: () => void
 *
 *   Outputs:
 *     - React element rendering SubPanel with ProfileEditor
 *     - Calls onSelectIdentity when user clicks identity in sidebar list
 *     - Calls onCancel when user clicks Cancel or presses Escape
 *     - Updates identity label in database on Apply
 *     - Updates profile content in database on Apply
 *     - Sends profile to all contacts on Apply
 *
 *   Invariants:
 *     - Profile loaded from IPC on identity selection
 *     - Identity switching blocked when dirty (unsaved changes exist)
 *     - Apply commits both label and profile content atomically
 *     - Cancel discards all staged changes
 *     - Sidebar shows identity list (contacts hidden)
 *
 *   Properties:
 *     - Isolation: Changes staged in component state, not committed until Apply
 *     - Atomicity: Label and profile content updated together on Apply
 *     - Idempotence: Multiple Apply clicks don't cause duplicate sends
 *     - Protection: Cannot switch identities with dirty state
 *
 *   Algorithm:
 *     1. Initialization:
 *        a. Read identities from useNostlingState hook
 *        b. Load initial profile for selectedIdentityId via IPC
 *        c. Initialize staging state with loaded profile
 *        d. Set dirty state to false
 *     2. Identity selection (user clicks identity in sidebar):
 *        a. Check if dirty state is true
 *        b. If dirty, block selection (show visual feedback, don't call onSelectIdentity)
 *        c. If not dirty, call onSelectIdentity with new identity ID
 *     3. Profile change (ProfileEditor calls onChange):
 *        a. Update staged profile state
 *        b. Update dirty state based on comparison to original
 *     4. Cancel action:
 *        a. Reset staged profile to original
 *        b. Set dirty state to false
 *        c. Call onCancel to return to chat view
 *     5. Apply action:
 *        a. Set applying state to true (disable form and buttons)
 *        b. Call IPC to update identity label: api.nostling.identities.updateLabel(identityId, stagedProfile.label)
 *        c. Call IPC to update profile: api.nostling.profiles.updatePrivate({ identityId, content: stagedProfile.content })
 *        d. On success:
 *           - Update original profile state to staged profile
 *           - Set dirty state to false
 *           - Set applying state to false
 *           - Call onCancel to return to chat view
 *        e. On error:
 *           - Set error message state
 *           - Set applying state to false
 *           - Stay on panel to show error
 *     6. Keyboard handling:
 *        a. Escape key: call handleCancel (unless applying)
 *        b. Other keys: no special handling
 *
 *   Rendering:
 *     - Use SubPanel component with title "Edit Identity Profile"
 *     - SubPanel actions: Cancel and Apply buttons
 *     - Main content: ProfileEditor with staged profile
 *     - Error display: Show error message if apply fails
 *     - Button states:
 *       * Cancel: disabled when applying
 *       * Apply: disabled when applying or not dirty
 *
 *   Data Loading:
 *     - Profile loading via IPC when selectedIdentityId changes:
 *       * Query identity from identities array for label
 *       * Call api.nostling.profiles.getPrivateAuthored(identityId) for content
 *       * Handle case where no profile exists (use empty ProfileContent)
 *     - Identity list from useNostlingState().identities
 *
 *   Error Handling:
 *     - Profile load failure: Show error in panel, disable editing
 *     - Apply failure: Show error message, keep changes staged
 *     - Network errors: Capture in error state, show to user
 *
 *   Styling:
 *     - Use useThemeColors for consistent theming
 *     - Use existing identity list patterns from main.tsx
 *     - Identity items: show label, profile name, picture
 *     - Selected identity: highlighted background
 *     - Disabled identities (when dirty): reduced opacity, no pointer events
 *
 *   Testing Considerations:
 *     - Property: Apply only enabled when dirty is true
 *     - Property: Identity switching blocked when dirty is true
 *     - Property: Cancel always discards changes
 *     - Property: Apply calls both updateLabel and updatePrivate
 *     - Property: Escape key behaves same as Cancel button
 *
 * TODO (pbt-dev): Implement using React hooks, SubPanel, and ProfileEditor
 *   - Use useState for staging state, dirty state, applying state, error state
 *   - Use useEffect to load profile when selectedIdentityId changes
 *   - Use useCallback for handlers
 *   - Use useNostlingState to access identities list
 *   - Import SubPanel from ../SubPanel
 *   - Import ProfileEditor from ./ProfileEditor
 *   - Import useThemeColors from themes/ThemeContext
 *   - Import window.api for IPC calls
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box } from '@chakra-ui/react';
import type { IdentitiesPanelProps, IdentityProfileData } from './types';
import { SubPanel } from '../SubPanel';
import { ProfileEditor } from './ProfileEditor';

export function IdentitiesPanel({
  selectedIdentityId,
  identities,
  onSelectIdentity,
  onCancel,
  onDirtyChange,
}: IdentitiesPanelProps): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);

  const [originalProfile, setOriginalProfile] = useState<IdentityProfileData | null>(null);
  const [stagedProfile, setStagedProfile] = useState<IdentityProfileData | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load profile when identity selected
  useEffect(() => {
    const loadProfile = async () => {
      if (!selectedIdentityId) {
        setOriginalProfile(null);
        setStagedProfile(null);
        setIsDirty(false);
        onDirtyChange?.(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Find identity to get label
        const identity = identities.find((i) => i.id === selectedIdentityId);
        if (!identity) {
          throw new Error('Identity not found');
        }

        // Load profile content via IPC
        const profileRecord = await window.api.nostling!.profiles.getPrivateAuthored(selectedIdentityId);

        // Build profile data
        const profileData: IdentityProfileData = {
          label: identity.label,
          content: profileRecord?.content || {},
        };

        setOriginalProfile(profileData);
        setStagedProfile(profileData);
        setIsDirty(false);
        onDirtyChange?.(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
        setOriginalProfile(null);
        setStagedProfile(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();

    // Auto-focus panel for keyboard navigation
    setTimeout(() => {
      panelRef.current?.focus();
    }, 0);
  }, [selectedIdentityId, identities, onDirtyChange]);

  // Handle profile change from ProfileEditor
  const handleProfileChange = useCallback((updatedProfile: IdentityProfileData) => {
    setStagedProfile(updatedProfile);

    // Calculate dirty state
    const dirty = originalProfile
      ? JSON.stringify(updatedProfile) !== JSON.stringify(originalProfile)
      : false;
    setIsDirty(dirty);
    onDirtyChange?.(dirty);
  }, [originalProfile, onDirtyChange]);

  // Handle Cancel action
  const handleCancel = useCallback(() => {
    if (originalProfile) {
      setStagedProfile(originalProfile);
      setIsDirty(false);
      onDirtyChange?.(false);
    }
    onCancel();
  }, [originalProfile, onCancel, onDirtyChange]);

  // Handle Apply action
  const handleApply = useCallback(async () => {
    if (!selectedIdentityId || !stagedProfile) return;

    setIsApplying(true);
    setError(null);

    try {
      // Update identity label
      await window.api.nostling!.identities.updateLabel(selectedIdentityId, stagedProfile.label);

      // Update profile content
      const result = await window.api.nostling!.profiles.updatePrivate({
        identityId: selectedIdentityId,
        content: stagedProfile.content,
      });

      // Check for partial/complete send failures
      const failedSends = result.sendResults.filter((r: any) => !r.success);
      if (failedSends.length > 0) {
        const totalContacts = result.sendResults.length;
        if (failedSends.length === totalContacts) {
          setError(`Profile saved but failed to send to all ${totalContacts} contact(s)`);
        } else {
          setError(`Profile saved but failed to send to ${failedSends.length} of ${totalContacts} contact(s)`);
        }
        // Don't return to chat on partial failure - let user see the error
        setOriginalProfile(stagedProfile);
        setIsDirty(false);
        onDirtyChange?.(false);
      } else {
        // Complete success: update original and return to chat
        setOriginalProfile(stagedProfile);
        setIsDirty(false);
        onDirtyChange?.(false);
        onCancel();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsApplying(false);
    }
  }, [selectedIdentityId, stagedProfile, onCancel]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isApplying) {
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCancel, isApplying]);

  // Define SubPanel actions
  const actions = [
    {
      label: 'Cancel',
      onClick: handleCancel,
      variant: 'ghost' as const,
      disabled: isApplying,
      testId: 'identities-panel-cancel',
    },
    {
      label: isApplying ? 'Saving...' : 'Apply',
      onClick: handleApply,
      variant: 'outline' as const,
      colorPalette: 'blue' as const,
      disabled: isApplying || !isDirty,
      testId: 'identities-panel-apply',
    },
  ];

  return (
    <SubPanel
      title="Edit Identity Profile"
      actions={actions}
      testId="identities-panel"
    >
      <Box
        ref={panelRef}
        tabIndex={0}
        outline="none"
        data-testid="identities-panel-content"
      >
        {isLoading && (
          <Box data-testid="identities-panel-loading">
            Loading profile...
          </Box>
        )}

        {error && (
          <Box
            bg="rgb(239, 68, 68)"
            color="#fecaca"
            p={3}
            borderRadius="md"
            mb={4}
            data-testid="identities-panel-error"
          >
            {error}
          </Box>
        )}

        {!isLoading && stagedProfile && (
          <ProfileEditor
            profile={stagedProfile}
            disabled={isApplying}
            onChange={handleProfileChange}
            data-testid="identities-panel-profile-editor"
          />
        )}
      </Box>
    </SubPanel>
  );
}

IdentitiesPanel.displayName = 'IdentitiesPanel';
