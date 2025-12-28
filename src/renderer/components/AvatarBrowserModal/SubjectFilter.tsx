/**
 * Subject Filter Component
 *
 * Dropdown selector for filtering avatars by subject.
 *
 * SPECIFICATION FOR pbt-dev AGENT:
 *
 * CONTRACT:
 *   Inputs:
 *     - vocabulary: AvatarVocabulary object containing filter options
 *       Structure: { "subject": ["cat", "dog", "strawberry", ...], ... }
 *       Constraints: may be empty object during loading
 *     - selectedValue: string, currently selected filter value
 *       Constraints: empty string = "All" (no filter), otherwise value from vocabulary["subject"]
 *       Example: "" (all), "cat", "strawberry"
 *     - onChange: callback function invoked when user changes selection
 *       Signature: (value: string) => void
 *       Parameter: selected value, empty string for "All"
 *     - isLoading: boolean flag, indicates if vocabulary is being fetched
 *       Effect: shows loading placeholder in dropdown
 *
 *   Outputs:
 *     - React element rendering dropdown select component
 *     - Invokes onChange with selected value when user changes selection
 *
 *   Invariants:
 *     - First option is always "All" with value ""
 *     - Subject options populated from vocabulary["subject"] array
 *     - Current selection matches selectedValue prop (controlled component)
 *     - Dropdown disabled during loading state
 *
 *   Properties:
 *     - Controlled component: selectedValue determines current selection
 *     - Reactivity: onChange called immediately when selection changes
 *     - Loading state: shows "Loading filters..." when isLoading = true
 *     - Empty vocabulary: shows only "All" option when vocabulary["subject"] missing
 *     - Accessibility: proper label and ARIA attributes
 *
 *   Algorithm:
 *     1. Extract subject options from vocabulary:
 *        a. If vocabulary["subject"] exists, use it
 *        b. Otherwise, use empty array
 *     2. Render Field with label "Subject":
 *        a. Label text: "Subject"
 *     3. Render Select component:
 *        a. Controlled value: selectedValue prop
 *        b. onChange handler: extract selected value, invoke onChange callback
 *        c. Disabled: isLoading = true
 *     4. Render options:
 *        a. First option: "All" with value ""
 *        b. For each subject in vocabulary["subject"]:
 *           - Option text: capitalized subject name
 *           - Option value: subject name
 *     5. Loading state:
 *        a. If isLoading, show placeholder option "Loading filters..."
 *        b. Disable select during loading
 *
 *   Styling:
 *     - Use Chakra UI Field and Select components
 *     - Use useThemeColors hook for consistent theming
 *     - Select width: fit content or 200px min width
 *     - Label: standard field label styling
 *
 *   Option Display:
 *     - "All" option: no filter applied
 *     - Subject options: capitalize first letter for display
 *       Example: "strawberry" → "Strawberry"
 *
 *   Testing Considerations:
 *     - Property: "All" option always present as first option
 *     - Property: options count = 1 + vocabulary["subject"].length
 *     - Property: onChange called with correct value when selection changes
 *     - Property: selectedValue controls current selection
 *     - Property: dropdown disabled when isLoading = true
 *     - Property: empty vocabulary renders only "All" option
 *
 * Implementation Notes:
 *   - Import Field from @chakra-ui/react
 *   - Import Select (native select) from @chakra-ui/react
 *   - Import useThemeColors from themes/ThemeContext
 *   - Use functional React component with typed props
 *   - Capitalize helper: value.charAt(0).toUpperCase() + value.slice(1)
 */

import React from 'react';
import { Field } from '@chakra-ui/react';
import type { SubjectFilterProps } from './types';
import { useThemeColors } from '../../themes/ThemeContext';

export function SubjectFilter({ vocabulary, selectedValue, onChange, isLoading }: SubjectFilterProps): React.ReactElement {
  const colors = useThemeColors();

  const subjects = vocabulary['subject'] ?? [];

  const capitalize = (str: string): string => {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value);
  };

  return (
    <Field.Root>
      <Field.Label>Subject</Field.Label>
      <select
        value={selectedValue}
        onChange={handleChange}
        disabled={isLoading}
        style={{
          minWidth: '200px',
          padding: '0.5rem',
          borderRadius: '0.375rem',
          border: `1px solid ${colors.inputBorder}`,
          backgroundColor: colors.inputBg,
          color: colors.text,
        }}
      >
        {isLoading ? (
          <option>Loading filters...</option>
        ) : (
          <>
            <option value="">All</option>
            {subjects.map((subject) => (
              <option key={subject} value={subject}>
                {capitalize(subject)}
              </option>
            ))}
          </>
        )}
      </select>
    </Field.Root>
  );
}
