/**
 * Pagination Controls Component
 *
 * Displays Previous/Next navigation buttons for avatar search pagination.
 *
 * SPECIFICATION FOR pbt-dev AGENT:
 *
 * CONTRACT:
 *   Inputs:
 *     - currentPage: positive integer, 1-based page number
 *       Constraints: currentPage ≥ 1
 *       Example: 1 = first page, 2 = second page
 *     - hasNextPage: boolean flag, indicates if next page exists
 *       Derivation: true when last search returned full page (items.length === limit)
 *     - onPrevious: callback function invoked when Previous button clicked
 *       Signature: () => void
 *       Behavior: decrements page number in parent state
 *     - onNext: callback function invoked when Next button clicked
 *       Signature: () => void
 *       Behavior: increments page number in parent state
 *     - isLoading: boolean flag, indicates if API request in progress
 *       Effect: disables both buttons during loading
 *
 *   Outputs:
 *     - React element rendering pagination controls
 *     - Invokes onPrevious when Previous button clicked
 *     - Invokes onNext when Next button clicked
 *
 *   Invariants:
 *     - Previous button only enabled when currentPage > 1 AND !isLoading
 *     - Next button only enabled when hasNextPage === true AND !isLoading
 *     - Both buttons disabled during loading state
 *     - Page number display always shows current page (e.g., "Page 1", "Page 2")
 *
 *   Properties:
 *     - Accessibility: buttons have proper ARIA labels
 *     - Visual feedback: disabled buttons have reduced opacity
 *     - Click prevention: disabled buttons do not invoke callbacks
 *     - Loading state: both buttons disabled when isLoading = true
 *
 *   Algorithm:
 *     1. Render layout:
 *        a. HStack container with center alignment
 *        b. Previous button (left)
 *        c. Page indicator text (center) - "Page {currentPage}"
 *        d. Next button (right)
 *     2. Previous button logic:
 *        a. Disabled if: currentPage === 1 OR isLoading
 *        b. onClick handler: invoke onPrevious (only when enabled)
 *        c. Text: "Previous"
 *     3. Next button logic:
 *        a. Disabled if: !hasNextPage OR isLoading
 *        b. onClick handler: invoke onNext (only when enabled)
 *        c. Text: "Next"
 *     4. Page indicator:
 *        a. Display text: "Page {currentPage}"
 *        b. Styling: centered, medium font size
 *
 *   Styling:
 *     - Use Chakra UI Button component
 *     - Use HStack for horizontal layout with spacing
 *     - Use useThemeColors hook for consistent theming
 *     - Disabled buttons: opacity 0.4
 *     - Button size: medium
 *     - Spacing between elements: consistent gaps
 *
 *   Testing Considerations:
 *     - Property: Previous button disabled when currentPage = 1
 *     - Property: Next button disabled when hasNextPage = false
 *     - Property: both buttons disabled when isLoading = true
 *     - Property: onPrevious called exactly once when Previous clicked (when enabled)
 *     - Property: onNext called exactly once when Next clicked (when enabled)
 *     - Property: page indicator displays correct page number
 *
 * Implementation Notes:
 *   - Import Button, HStack, Text from @chakra-ui/react
 *   - Import useThemeColors from themes/ThemeContext
 *   - Use functional React component with typed props
 */

import React from 'react';
import { Button, HStack, Text } from '@chakra-ui/react';
import type { PaginationControlsProps } from './types';
import { useThemeColors } from '../../themes/ThemeContext';

export function PaginationControls({
  currentPage,
  hasNextPage,
  onPrevious,
  onNext,
  isLoading,
}: PaginationControlsProps): React.ReactElement {
  const colors = useThemeColors();

  const isPreviousDisabled = currentPage === 1 || isLoading;
  const isNextDisabled = !hasNextPage || isLoading;

  return (
    <HStack gap={4} justify="center">
      <Button
        onClick={onPrevious}
        disabled={isPreviousDisabled}
        size="md"
        aria-label="Previous page"
        opacity={isPreviousDisabled ? 0.4 : 1}
      >
        Previous
      </Button>
      <Text fontSize="md" color={colors.text}>
        Page {currentPage}
      </Text>
      <Button
        onClick={onNext}
        disabled={isNextDisabled}
        size="md"
        aria-label="Next page"
        opacity={isNextDisabled ? 0.4 : 1}
      >
        Next
      </Button>
    </HStack>
  );
}
