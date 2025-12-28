/**
 * Avatar Browser Modal Component
 *
 * Main modal dialog for browsing and selecting avatar images.
 * Contains two tabs: "Browse Server" (active) and "Upload File" (disabled placeholder).
 *
 * SPECIFICATION FOR pbt-dev AGENT:
 *
 * CONTRACT:
 *   Inputs:
 *     - isOpen: boolean flag, controls modal visibility
 *       true = modal visible, false = modal hidden
 *     - onClose: callback function invoked when modal should close
 *       Signature: () => void
 *       Triggers: close button click, ESC key press, backdrop click
 *     - onAvatarSelected: callback function invoked when user selects avatar
 *       Signature: (avatarUrl: string) => void
 *       Parameter: full HTTPS URL to selected avatar (sanitized)
 *       Behavior: parent component populates picture URL field
 *
 *   Outputs:
 *     - React element rendering modal dialog
 *     - Invokes onClose when user dismisses modal
 *     - Invokes onAvatarSelected when user selects avatar, then auto-closes modal
 *
 *   Invariants:
 *     - Modal only renders when isOpen = true (Chakra Dialog behavior)
 *     - Two tabs always present: "Browse Server" and "Upload File"
 *     - "Browse Server" tab is active and enabled
 *     - "Upload File" tab is disabled with tooltip "Coming soon"
 *     - Modal closes automatically after avatar selection
 *     - ESC key and backdrop click trigger onClose
 *
 *   Properties:
 *     - Accessibility: proper ARIA attributes, keyboard navigation
 *     - Modal behavior: backdrop prevents interaction with underlying UI
 *     - Auto-close on selection: modal closes after onAvatarSelected invoked
 *     - Responsive: modal adapts to screen size
 *     - Theme integration: uses Chakra theme and useThemeColors
 *
 *   Algorithm:
 *     1. Render Dialog.Root:
 *        a. open prop: isOpen
 *        b. onOpenChange prop: handles close events → invoke onClose
 *     2. Render Dialog.Backdrop:
 *        a. Semi-transparent overlay
 *     3. Render Dialog.Content:
 *        a. Size: large (lg) for desktop, responsive on mobile
 *        b. Max width: 800px
 *     4. Render Dialog.Header:
 *        a. Title: "Select Avatar"
 *        b. Close button (Dialog.CloseTrigger)
 *     5. Render Dialog.Body:
 *        a. Tabs.Root component with two tabs:
 *           - "Browse Server" tab (value: "browse")
 *           - "Upload File" tab (value: "upload")
 *        b. Default selected tab: "browse"
 *        c. Tabs.List (tab buttons):
 *           - First tab: "Browse Server" (enabled)
 *           - Second tab: "Upload File" (disabled = true)
 *             * Wrapped in Tooltip: "Coming soon"
 *        d. Tabs.Content for "browse" tab:
 *           - Render AvatarSearchTab component
 *           - onAvatarSelected prop: handleAvatarSelected
 *     6. handleAvatarSelected function:
 *        a. Receive avatarUrl parameter (sanitized by AvatarSearchTab)
 *        b. Invoke onAvatarSelected(avatarUrl) callback
 *        c. Invoke onClose() to dismiss modal
 *
 *   Modal Layout:
 *     - Header: Title "Select Avatar" with close button
 *     - Body: Tabs with two tab buttons at top
 *       * "Browse Server" content: AvatarSearchTab component
 *       * "Upload File" content: none (tab disabled)
 *     - Footer: none (actions handled within tabs)
 *
 *   Styling:
 *     - Use Chakra UI Dialog.* components
 *     - Use Chakra UI Tabs.* components
 *     - Use Chakra UI Tooltip for disabled tab
 *     - Use useThemeColors hook for consistent theming
 *     - Modal size: lg (large)
 *     - Modal max width: 800px
 *     - Modal max height: 90vh (scrollable content)
 *
 *   Disabled Tab Tooltip:
 *     - Text: "Coming soon"
 *     - Placement: top
 *     - Show on hover of disabled tab button
 *
 *   Testing Considerations:
 *     - Property: modal renders when isOpen = true
 *     - Property: modal does not render when isOpen = false
 *     - Property: onClose called when close button clicked
 *     - Property: onClose called when ESC pressed
 *     - Property: onClose called when backdrop clicked
 *     - Property: onAvatarSelected called before onClose on selection
 *     - Property: "Upload File" tab is disabled
 *     - Property: "Browse Server" tab is active by default
 *     - Visual: tooltip shows "Coming soon" on disabled tab hover
 *
 * Implementation Notes:
 *   - Import Dialog from @chakra-ui/react
 *   - Import Tabs from @chakra-ui/react
 *   - Import Tooltip from @chakra-ui/react
 *   - Import AvatarSearchTab from same directory
 *   - Import useThemeColors from themes/ThemeContext
 *   - Use functional React component with typed props
 *   - Use useCallback for handleAvatarSelected to prevent re-renders
 */

import React, { useCallback } from 'react';
import { Dialog, Button } from '@chakra-ui/react';
import { Tabs } from '@chakra-ui/react';
import { Tooltip } from '@chakra-ui/react';
import type { AvatarBrowserModalProps } from './types';
import { AvatarSearchTab } from './AvatarSearchTab';

export function AvatarBrowserModal({ isOpen, onClose, onAvatarSelected }: AvatarBrowserModalProps): React.ReactElement {
  const handleAvatarSelected = useCallback(
    (avatarUrl: string) => {
      onAvatarSelected(avatarUrl);
      onClose();
    },
    [onAvatarSelected, onClose],
  );

  // Stop Escape key from bubbling up to parent components (like IdentitiesPanel)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
    }
  }, []);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(details) => { if (!details.open) onClose(); }}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content
          maxW="800px"
          maxH="90vh"
          onKeyDown={handleKeyDown}
        >
          <Dialog.Header>
            <Dialog.Title>Select Avatar</Dialog.Title>
            <Dialog.CloseTrigger asChild>
              <Button variant="ghost" size="sm">×</Button>
            </Dialog.CloseTrigger>
          </Dialog.Header>

          <Dialog.Body>
            <Tabs.Root defaultValue="browse">
              <Tabs.List>
                <Tabs.Trigger value="browse">Browse Server</Tabs.Trigger>
                <Tooltip.Root positioning={{ placement: 'top' }}>
                  <Tooltip.Trigger asChild>
                    <Tabs.Trigger value="upload" disabled>
                      Upload File
                    </Tabs.Trigger>
                  </Tooltip.Trigger>
                  <Tooltip.Positioner>
                    <Tooltip.Content>Coming soon</Tooltip.Content>
                  </Tooltip.Positioner>
                </Tooltip.Root>
              </Tabs.List>

              <Tabs.Content value="browse">
                <AvatarSearchTab onAvatarSelected={handleAvatarSelected} />
              </Tabs.Content>
            </Tabs.Root>
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
