/**
 * Type definitions for Avatar Browser feature
 *
 * Defines data structures for avatar API communication and component props.
 */

/**
 * Avatar item from API search results
 *
 * CONTRACT:
 *   Structure:
 *     - url: string, relative URL path to avatar image
 *       Example: "/avatars/uuid.png"
 *       Constraints: non-empty string, must be relative path
 *
 *   Invariants:
 *     - url always starts with "/"
 *     - url points to PNG image resource
 *
 *   Usage:
 *     Received from avatar search API, prepend base URL to construct full image URL
 */
export interface AvatarItem {
  url: string;
}

/**
 * Search response from avatar API
 *
 * CONTRACT:
 *   Structure:
 *     - items: array of AvatarItem objects
 *       Constraints: may be empty array, length ≤ limit
 *     - limit: positive integer, pagination limit used in query
 *       Constraints: 1 ≤ limit ≤ 500
 *     - offset: non-negative integer, pagination offset used in query
 *       Constraints: offset ≥ 0
 *
 *   Invariants:
 *     - items.length ≤ limit
 *     - items ordered by ascending UUID (server-side ordering)
 *
 *   Properties:
 *     - Deterministic: same query parameters always return same page
 *     - End detection: items.length < limit indicates last page
 */
export interface AvatarSearchResponse {
  items: AvatarItem[];
  limit: number;
  offset: number;
}

/**
 * Vocabulary data from avatar API
 *
 * CONTRACT:
 *   Structure:
 *     - Record mapping filter keys to arrays of valid values
 *       Example: { "color": ["red", "blue"], "style": ["anime", "flat"] }
 *
 *   Invariants:
 *     - All keys are non-empty strings
 *     - All value arrays are non-empty
 *     - Value arrays contain unique strings (no duplicates)
 *     - Values are sorted alphabetically (server-side sorting)
 *
 *   Usage:
 *     Used to populate filter dropdowns and validate client-side filter selections
 */
export interface AvatarVocabulary {
  [key: string]: string[];
}

/**
 * Error response from avatar API
 *
 * CONTRACT:
 *   Structure:
 *     - error: string constant indicating error type
 *       Values: "invalid_query" | "server_error"
 *     - message: human-readable error description
 *       Example: "Unknown filter key: foo"
 *
 *   Invariants:
 *     - error is one of predefined error codes
 *     - message provides actionable context
 *
 *   HTTP Status Mapping:
 *     - 400 Bad Request: error = "invalid_query"
 *     - 500 Internal Server Error: error = "server_error"
 */
export interface AvatarApiError {
  error: 'invalid_query' | 'server_error';
  message: string;
}

/**
 * Props for AvatarBrowserModal component
 *
 * CONTRACT:
 *   Structure:
 *     - isOpen: boolean flag, controls modal visibility
 *     - onClose: callback function, invoked when modal should close
 *       Signature: () => void
 *     - onAvatarSelected: callback function, invoked when user selects avatar
 *       Signature: (avatarUrl: string) => void
 *       Parameter: full HTTPS URL to selected avatar image
 *
 *   Callback Behaviors:
 *     - onClose: called when user clicks close button, ESC key, or backdrop
 *     - onAvatarSelected: called with sanitized full URL when user clicks avatar thumbnail
 *       Modal should close automatically after invoking this callback
 */
export interface AvatarBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAvatarSelected: (avatarUrl: string) => void;
}

/**
 * Props for AvatarSearchTab component
 *
 * CONTRACT:
 *   Structure:
 *     - onAvatarSelected: callback function, invoked when user selects avatar
 *       Signature: (avatarUrl: string) => void
 *       Parameter: full HTTPS URL to selected avatar image
 *
 *   Responsibilities:
 *     Component manages its own state (vocabulary, search results, pagination, filters)
 */
export interface AvatarSearchTabProps {
  onAvatarSelected: (avatarUrl: string) => void;
}

/**
 * Props for AvatarGrid component
 *
 * CONTRACT:
 *   Structure:
 *     - avatars: array of AvatarItem objects to display
 *       Constraints: may be empty array
 *     - baseUrl: string, base URL to prepend to relative avatar paths
 *       Example: "https://wp10665333.server-he.de"
 *       Constraints: valid HTTPS URL
 *     - onAvatarClick: callback function, invoked when user clicks avatar
 *       Signature: (fullUrl: string) => void
 *       Parameter: full HTTPS URL constructed from baseUrl + avatar.url
 *
 *   Display Layout:
 *     - Grid: 4 columns × 5 rows = 20 avatars per page
 *     - Responsive: adapts to container width
 *     - Spacing: consistent gaps between thumbnails
 */
export interface AvatarGridProps {
  avatars: AvatarItem[];
  baseUrl: string;
  onAvatarClick: (fullUrl: string) => void;
}

/**
 * Props for PaginationControls component
 *
 * CONTRACT:
 *   Structure:
 *     - currentPage: positive integer, 1-based page number
 *       Constraints: currentPage ≥ 1
 *     - hasNextPage: boolean flag, indicates if next page exists
 *       Derived from: items.length === limit (server returned full page)
 *     - onPrevious: callback function, invoked when Previous button clicked
 *       Signature: () => void
 *       Constraints: only called when currentPage > 1
 *     - onNext: callback function, invoked when Next button clicked
 *       Signature: () => void
 *       Constraints: only called when hasNextPage is true
 *     - isLoading: boolean flag, indicates if API request in progress
 *       Effect: disables both buttons during loading
 *
 *   Button States:
 *     - Previous button: disabled when currentPage === 1 OR isLoading
 *     - Next button: disabled when !hasNextPage OR isLoading
 */
export interface PaginationControlsProps {
  currentPage: number;
  hasNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
  isLoading: boolean;
}

/**
 * Props for SubjectFilter component
 *
 * CONTRACT:
 *   Structure:
 *     - vocabulary: AvatarVocabulary object containing filter options
 *       Constraints: may be empty object during loading
 *     - selectedValue: string, currently selected filter value
 *       Constraints: empty string means "All" (no filter applied)
 *     - onChange: callback function, invoked when user changes filter selection
 *       Signature: (value: string) => void
 *       Parameter: selected filter value, empty string for "All"
 *     - isLoading: boolean flag, indicates if vocabulary is being fetched
 *       Effect: shows loading state in dropdown
 *
 *   Filter Behavior:
 *     - Default option: "All" (value = "")
 *     - Subject-specific options: populated from vocabulary["subject"] array
 *     - Selection change triggers immediate re-search (via onChange callback)
 */
export interface SubjectFilterProps {
  vocabulary: AvatarVocabulary;
  selectedValue: string;
  onChange: (value: string) => void;
  isLoading: boolean;
}
