/**
 * Integration stubs for contacts panel in main.tsx.
 *
 * These functions/components will be integrated into main.tsx to add contacts view.
 * They follow existing patterns from identities panel integration.
 */

/**
 * STUB: Add menu item to Header component hamburger menu.
 *
 * CONTRACT:
 *   Location: Header component, in menu items list
 *
 *   Action to add:
 *     MenuItem with:
 *       - Text: "View Contact Profiles"
 *       - onClick: () => setCurrentView('contacts')
 *       - Icon: appropriate icon (e.g., UserIcon, ContactIcon)
 *
 *   Algorithm:
 *     1. Find Header component in main.tsx
 *     2. Locate menu items section (around "View Relay Config", "View Identity Profiles")
 *     3. Add new MenuItem for contacts
 */
export const MENU_ITEM_STUB = `
  Add to Header menu items:
  <MenuItem onClick={() => setCurrentView('contacts')}>
    View Contact Profiles
  </MenuItem>
`;

/**
 * STUB: Add ContactList to sidebar rendering logic.
 *
 * CONTRACT:
 *   Location: main.tsx sidebar rendering section (around line 2290)
 *
 *   Condition: currentView === 'contacts'
 *
 *   Render:
 *     <ContactList
 *       contacts={filteredContactsForSelectedIdentity}
 *       selectedContactId={selectedContactId}
 *       onSelectContact={setSelectedContactId}
 *       colors={colors}
 *     />
 *
 *   Algorithm:
 *     1. Filter contacts by selectedIdentityId (use nostling.contacts)
 *     2. Conditionally render ContactList when currentView === 'contacts'
 *     3. Replace identity list in sidebar with contact list
 */
export const SIDEBAR_STUB = `
  In sidebar rendering logic, add condition:

  {currentView === 'contacts' ? (
    <ContactList
      contacts={nostling.contacts.filter(c => c.identity_id === selectedIdentityId)}
      selectedContactId={selectedContactId}
      onSelectContact={setSelectedContactId}
      colors={colors}
    />
  ) : currentView === 'identities' ? (
    <IdentityList ... />
  ) : (
    // existing chat sidebar
  )}
`;

/**
 * STUB: Add ContactsPanel to main content rendering logic.
 *
 * CONTRACT:
 *   Location: main.tsx main content area (around line 2344)
 *
 *   Condition: currentView === 'contacts'
 *
 *   Render:
 *     <ContactsPanel
 *       selectedContact={selectedContactObject}
 *       onClose={() => setCurrentView('chat')}
 *     />
 *
 *   Algorithm:
 *     1. Find selected contact object from nostling.contacts by selectedContactId
 *     2. Render ContactsPanel when currentView === 'contacts'
 *     3. onClose returns to chat view
 */
export const MAIN_CONTENT_STUB = `
  In main content area, add condition:

  {currentView === 'contacts' ? (
    selectedContactId ? (
      <ContactsPanel
        selectedContact={nostling.contacts.find(c => c.id === selectedContactId)!}
        onClose={() => setCurrentView('chat')}
      />
    ) : (
      <Box>Select a contact to view profile</Box>
    )
  ) : currentView === 'identities' ? (
    <IdentitiesPanel ... />
  ) : ...
`;

/**
 * STUB: Add Escape key handler for contacts view.
 *
 * CONTRACT:
 *   Location: Keyboard event handler in main.tsx (around existing Escape handlers)
 *
 *   Logic:
 *     if (event.key === 'Escape' && currentView === 'contacts') {
 *       setCurrentView('chat');
 *       return;
 *     }
 *
 *   Algorithm:
 *     1. In keyboard event handler, check for Escape + contacts view
 *     2. Return to chat view
 *     3. No unsaved changes check needed (read-only)
 */
export const KEYBOARD_HANDLER_STUB = `
  In keyboard event handler, add:

  if (event.key === 'Escape' && currentView === 'contacts') {
    setCurrentView('chat');
    return;
  }
`;

/**
 * Integration checklist for pbt-dev agent:
 *
 * 1. Import ContactList and ContactsPanel components
 * 2. Add menu item in Header component (MENU_ITEM_STUB)
 * 3. Add ContactList rendering in sidebar (SIDEBAR_STUB)
 * 4. Add ContactsPanel rendering in main content (MAIN_CONTENT_STUB)
 * 5. Add Escape key handler (KEYBOARD_HANDLER_STUB)
 * 6. Ensure selectedIdentityId is set (required for filtering contacts)
 * 7. Test view transitions: chat <-> contacts
 */
