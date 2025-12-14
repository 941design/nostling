/**
 * Utility for conditional hover control visibility and interactivity.
 *
 * Controls are only visible and interactive when an item is selected (active).
 * On hover of a selected item, controls fade in.
 *
 * This prevents:
 * 1. Visual clutter by hiding controls on non-active items
 * 2. Accidental clicks on hidden controls
 */

/**
 * Calculate the opacity for hover controls based on selection and hover state.
 *
 * @param isSelected - Whether the item is currently selected/active
 * @param isHovered - Whether the item is currently being hovered
 * @returns 1 if both selected and hovered, 0 otherwise
 */
export function getHoverControlsOpacity(isSelected: boolean, isHovered: boolean): 0 | 1 {
  return isSelected && isHovered ? 1 : 0;
}

/**
 * Determine pointer events mode based on selection state.
 * Controls are only interactive when the item is selected.
 *
 * @param isSelected - Whether the item is currently selected/active
 * @returns 'auto' if selected (clickable), 'none' if not selected (disabled)
 */
export function getHoverControlsPointerEvents(isSelected: boolean): 'auto' | 'none' {
  return isSelected ? 'auto' : 'none';
}
