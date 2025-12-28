/**
 * Avatar Grid Component
 *
 * Displays avatar thumbnails in a responsive grid layout with click handling.
 *
 * SPECIFICATION FOR pbt-dev AGENT:
 *
 * CONTRACT:
 *   Inputs:
 *     - avatars: array of AvatarItem objects to display
 *       Structure: [{ url: "/avatars/uuid.png" }, ...]
 *       Constraints: may be empty array (shows empty state)
 *     - baseUrl: string, base URL to prepend to relative avatar paths
 *       Example: "https://wp10665333.server-he.de"
 *       Constraints: valid HTTPS URL without trailing slash
 *     - onAvatarClick: callback function invoked when user clicks avatar thumbnail
 *       Signature: (fullUrl: string) => void
 *       Parameter: full HTTPS URL = baseUrl + avatar.url
 *
 *   Outputs:
 *     - React element rendering grid of avatar thumbnails
 *     - Invokes onAvatarClick with full URL when avatar clicked
 *
 *   Invariants:
 *     - Grid displays exactly avatars.length thumbnails
 *     - Each thumbnail uses CachedImage component for caching
 *     - Full URLs constructed by concatenating baseUrl + avatar.url
 *     - Empty array shows "No avatars found" message
 *     - Grid layout: 4 columns (responsive on small screens)
 *
 *   Properties:
 *     - Click handling: each avatar clickable, invokes onAvatarClick once per click
 *     - Image caching: leverages CachedImage for performance
 *     - Responsive: grid adapts to container width (4 cols desktop, fewer on mobile)
 *     - Empty state: friendly message when avatars array is empty
 *     - Hover feedback: visual feedback on hover (cursor pointer, slight scale)
 *
 *   Algorithm:
 *     1. If avatars array is empty:
 *        a. Render Box with centered text "No avatars found"
 *        b. Return early
 *     2. Render SimpleGrid container:
 *        a. Columns: 4 (desktop), 3 (tablet), 2 (mobile)
 *        b. Spacing: consistent gap between items
 *        c. Full width
 *     3. For each avatar in avatars array:
 *        a. Construct full URL: baseUrl + avatar.url
 *        b. Render Box wrapper (for click and hover handling):
 *           - onClick handler: invoke onAvatarClick(fullUrl)
 *           - Cursor: pointer
 *           - Border radius: rounded corners
 *           - Hover effect: slight scale (1.05) and shadow
 *           - Transition: smooth transform and shadow
 *        c. Inside Box, render CachedImage:
 *           - url prop: fullUrl
 *           - alt: "Avatar thumbnail"
 *           - width: 100% of container
 *           - height: auto (maintain aspect ratio)
 *           - border radius: inherit from Box
 *
 *   Styling:
 *     - Use Chakra UI SimpleGrid for responsive grid
 *     - Use Chakra UI Box for clickable containers
 *     - Use CachedImage component (existing) for image display
 *     - Use useThemeColors hook for consistent theming
 *     - Responsive columns: { base: 2, md: 3, lg: 4 }
 *     - Grid spacing: 4 (16px)
 *     - Box hover: transform scale(1.05), box shadow
 *     - Transition: all 0.2s ease
 *
 *   Empty State:
 *     - Text: "No avatars found"
 *     - Centered in container
 *     - Gray text color
 *     - Medium font size
 *
 *   Testing Considerations:
 *     - Property: grid renders avatars.length items
 *     - Property: empty array shows empty state message
 *     - Property: onAvatarClick called with correct full URL
 *     - Property: full URL format = baseUrl + avatar.url
 *     - Property: each avatar uses CachedImage with correct URL
 *     - Visual: hover effect applied on mouse over
 *     - Accessibility: clickable items have cursor pointer
 *
 * Implementation Notes:
 *   - Import SimpleGrid, Box, Text from @chakra-ui/react
 *   - Import CachedImage from existing components
 *   - Import useThemeColors from themes/ThemeContext
 *   - Use functional React component with typed props
 *   - Handle empty array gracefully with early return
 */

import React from 'react';
import { SimpleGrid, Box, Text } from '@chakra-ui/react';
import type { AvatarGridProps } from './types';
import { CachedImage } from '../CachedImage';
import { useThemeColors } from '../../themes/ThemeContext';

export function AvatarGrid({ avatars, baseUrl, onAvatarClick }: AvatarGridProps): React.ReactElement {
  const colors = useThemeColors();

  if (avatars.length === 0) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="200px"
      >
        <Text color={colors.textMuted} fontSize="md">
          No avatars found
        </Text>
      </Box>
    );
  }

  return (
    <SimpleGrid
      columns={{ base: 2, md: 3, lg: 4 }}
      gap={4}
      width="100%"
    >
      {avatars.map((avatar, index) => {
        const fullUrl = baseUrl + avatar.url;

        return (
          <Box
            key={index}
            onClick={() => onAvatarClick(fullUrl)}
            cursor="pointer"
            borderRadius="md"
            transition="all 0.2s ease"
            _hover={{
              transform: 'scale(1.05)',
              boxShadow: 'lg',
            }}
          >
            <CachedImage
              url={fullUrl}
              alt="Avatar thumbnail"
              width="100%"
              height="auto"
              borderRadius="md"
            />
          </Box>
        );
      })}
    </SimpleGrid>
  );
}
