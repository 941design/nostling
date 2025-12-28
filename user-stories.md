# User Stories

This document tracks user-centric feature stories organized by persona and epic.

## Personas

### Nostr User
A person using Nostling for encrypted Nostr messaging, identity management, and profile setup. They value privacy, ease of use, and secure communication.

**Goals:**
- Communicate securely with contacts via encrypted direct messages
- Manage one or more Nostr identities with private keys
- Set up and customize identity profiles without relying on public relay metadata
- Maintain control over what information is shared and with whom
- Use a desktop application that respects privacy and works offline when possible

**Technical Context:**
- May be new to Nostr or experienced with the protocol
- Comfortable with desktop applications but may not want to manage infrastructure
- Values open-source software and verifiable security

---

## Epics

### Epic: Identity & Profile Management

User stories related to creating, managing, and customizing Nostr identities and their associated profiles.

#### [Implemented] Avatar Image Selection
**As a** Nostr User
**I want** to browse and select a profile avatar from a curated collection
**So that** I can quickly set up my identity profile without needing to find, host, and manually enter image URLs

**Acceptance Criteria:**
- User can access avatar browser via "Browse" button in profile editor
- Avatars displayed in grid layout (4x5, 20 per page)
- User can filter avatars by subject using dropdown
- User can navigate pages using Previous/Next buttons
- Clicking avatar auto-populates picture URL field and closes modal
- Selected avatar displays as preview in profile editor
- Avatar images cached for offline availability and fast repeat browsing
- Modal includes disabled "Upload File" tab indicating future functionality

**Implementation:**
- Component: AvatarBrowserModal
- Integration: ProfileEditor with "Browse" button next to Picture URL field
- External API: https://wp10665333.server-he.de (Avatar Search CGI)
- Caching: Integrated with existing image-cache-service
- Tests: Comprehensive property-based tests covering API interaction, pagination, filtering, selection workflow

**Status:** ✓ Implemented (Version: Unreleased)

---

## Future Stories

Additional user stories and epics will be added here as features are planned and implemented.
