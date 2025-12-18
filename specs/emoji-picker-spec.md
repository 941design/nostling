# Emoji Picker - Requirements Specification

## Problem Statement
Users need the ability to insert emojis into messages to enhance expressiveness and communication. Currently, the message input only supports plain text, requiring users to use system emoji pickers or copy-paste emojis from external sources. This feature will provide an integrated, consistent emoji insertion experience within the application.

## Core Functionality
Add an emoji picker UI component that allows users to:
- Browse and select from 24 popular emojis
- Insert selected emojis at the cursor position in the message input field
- View emojis rendered in both sent and received messages

## Functional Requirements

### FR1: Emoji Picker Button
- A button must be added to the message input textarea
- Button location: bottom-right corner of the textarea (inside or overlaid)
- Button should be theme-aware (using colors from useThemeColors() hook)
- Button should display an emoji icon or similar indicator
- **Acceptance Criteria**:
  - Button visible when textarea is focused or hovered
  - Button does not interfere with text input
  - Button styling consistent with application theme

### FR2: Emoji Selection UI
- Clicking the emoji button opens a dropdown/menu overlay
- Display 24 emojis in a 4x6 grid layout
- Emojis drawn from mixed categories (reactions, professional, universal favorites)
- UI should follow Chakra Menu pattern or similar dropdown/popover pattern
- **Acceptance Criteria**:
  - Grid displays 24 emoji buttons
  - Emojis are large enough to be easily clickable
  - Picker closes after selecting an emoji
  - Picker can be dismissed by clicking outside

### FR3: Emoji Insertion Behavior
- When user selects an emoji from the picker, insert it at the current cursor position in the textarea
- Preserve cursor position after insertion (cursor moves to after inserted emoji)
- If no cursor position exists, append to end of text
- **Acceptance Criteria**:
  - Emoji inserted at cursor position
  - Text before and after cursor preserved
  - Cursor positioned after inserted emoji
  - Works correctly with empty textarea

### FR4: Emoji Rendering in Messages
- Messages containing Unicode emoji characters render properly in MessageBubble components
- Both sent and received messages display emojis
- Emojis follow existing text rendering (whiteSpace="pre-wrap")
- **Acceptance Criteria**:
  - Emojis visible in sent messages
  - Emojis visible in received messages
  - No escaping or corruption of emoji characters

### FR5: Initial Emoji Set (24 emojis)
The initial set should include a balanced mix:
- **Reactions/Emotions**: 😀 😂 😊 😢 😍 🥰 😎 🤔
- **Gestures**: 👍 👋 🙏 ✌️ 👏 💪
- **Symbols**: ❤️ ✨ 🔥 💯 ✅ ❌
- **Objects**: 🎉 💡 📌 🔔 📝 ✉️

**Acceptance Criteria**: All 24 emojis selectable and renderable

## Critical Constraints

### C1: Consistent UI Patterns
- Must use Chakra UI components (Menu, Popover, or Dialog patterns)
- Must use theme colors from useThemeColors() hook
- Must follow existing modal/dropdown patterns in codebase

### C2: No Text Emoticon Replacement
- MUST NOT replace text emoticons like ':-)' or ':)' with emojis
- Only insert emojis via explicit user selection from picker
- Text emoticons remain as literal text characters

### C3: Framework Compatibility
- React 18.3.1
- Chakra UI 3.30.0
- TypeScript with proper typing

### C4: Message Content Integrity
- Emojis stored as standard Unicode characters in message content
- No custom encoding or special handling in message transport
- Compatible with NostlingMessage interface (content: string field)

## Integration Points

### Message Input Component
- Modify ConversationPane component (src/renderer/main.tsx:1187-1313)
- Enhance Textarea component (src/renderer/main.tsx:1294-1304)
- Add emoji picker button positioned relative to textarea
- Track cursor position for insertion

### Message Rendering
- MessageBubble component (src/renderer/main.tsx:1139-1177) already supports emoji rendering via whiteSpace="pre-wrap"
- No changes required to message display logic

### Theme System
- Use useThemeColors() hook for all color styling
- Follow existing theme-aware component patterns

## User Preferences

### UI Preference
- Dropdown menu pattern (similar to header menu) preferred over modal dialog
- Lightweight, non-intrusive UI that doesn't interrupt message composition flow

### Emoji Selection
- Top 24 most popular/useful emojis across mixed categories
- 4x6 grid layout for compact, scannable display

## Codebase Context

See `.exploration/emoji-picker-context.md` for exploration findings including:
- Existing dropdown/menu patterns
- Textarea component structure
- Theme integration patterns
- Keyboard handling utilities

## Related Artifacts

- **Exploration Context**: `.exploration/emoji-picker-context.md`

## Out of Scope

- Custom emoji upload
- Emoji search functionality
- Emoji categories/tabs
- Emoji skin tone variations
- Emoji autocomplete (e.g., `:smile:` → 😊)
- Emoji reactions to messages (this is about insertion in message composition)
- Text emoticon to emoji conversion
- Animated or custom emojis
- Recent/frequently used emoji tracking

---

**Note**: This is a requirements specification, not an architecture design.
Edge cases, error handling details, and implementation approach will be
determined by the integration-architect during design phase.
