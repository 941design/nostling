/**
 * Mnemonic Backup Modal Component
 *
 * Displays a user's BIP39 mnemonic phrase for backup purposes.
 * Shows security warnings and requires user confirmation before displaying.
 *
 * UX Flow:
 * 1. User clicks "Show Backup Phrase" button in identity settings
 * 2. Modal opens with security warning
 * 3. User clicks "I Understand, Show Phrase" to reveal mnemonic
 * 4. Mnemonic displayed in grid format with word numbers
 * 5. Copy button provided for convenience
 * 6. User must explicitly close modal after backing up
 *
 * Security considerations:
 * - Mnemonic only displayed after explicit user acknowledgment
 * - Warning about anyone with mnemonic can access account
 * - Recommendation to write down on paper, not digital storage
 * - No automatic clipboard copying without user action
 */

import React, { useState } from 'react';
import { Dialog } from '@chakra-ui/react';

// ============================================================================
// CONTRACT: MnemonicBackupModalProps
// ============================================================================

/**
 * Props for MnemonicBackupModal component
 *
 * CONTRACT:
 *   Properties:
 *     - isOpen: boolean, whether modal is currently displayed
 *       Constraints: controlled by parent component
 *     - onClose: function, callback when user closes modal
 *       Signature: () => void
 *       Behavior: parent should set isOpen to false
 *     - mnemonic: string, BIP39 mnemonic phrase to display
 *       Format: space-separated words from BIP39 word list
 *       Example: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
 *       Constraints: must be valid BIP39 mnemonic (12 or 24 words)
 *     - identityLabel: string, human-readable identity label for context
 *       Example: "Personal Account"
 *       Constraints: non-empty string
 *
 *   Invariants:
 *     - Modal only renders when isOpen is true
 *     - Mnemonic is never displayed until user clicks reveal button
 *     - onClose is called when user clicks close/cancel buttons
 */
export interface MnemonicBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  mnemonic: string;
  identityLabel: string;
}

// ============================================================================
// CONTRACT: MnemonicBackupModal
// ============================================================================

/**
 * Modal for displaying mnemonic backup phrase with security warnings
 *
 * CONTRACT:
 *   Inputs:
 *     - props: MnemonicBackupModalProps (see above)
 *
 *   Outputs:
 *     - React component rendering modal dialog
 *
 *   State:
 *     - isRevealed: boolean, whether mnemonic is currently visible
 *       Initial: false (mnemonic hidden)
 *       Transitions: false → true when user clicks "Show Phrase" button
 *       Never transitions: true → false (stays revealed until modal closes)
 *
 *   Behavior:
 *     - Initial state: Security warning displayed, mnemonic hidden
 *     - After reveal: Mnemonic displayed in numbered grid format
 *     - Copy button: Copies mnemonic to clipboard when clicked
 *     - Close button: Calls onClose callback
 *
 *   UI Elements (before reveal):
 *     - Modal title: "Backup Recovery Phrase"
 *     - Identity label: "For identity: {identityLabel}"
 *     - Warning icon (large, prominent)
 *     - Warning text:
 *       "This recovery phrase gives COMPLETE ACCESS to your identity.
 *        Anyone with this phrase can read your messages and impersonate you."
 *     - Best practices list:
 *       * Write it down on paper
 *       * Store in a secure location
 *       * Never share it with anyone
 *       * Never store it digitally (screenshots, cloud storage, etc.)
 *     - Button: "I Understand, Show Phrase" (primary, warning color)
 *     - Button: "Cancel" (secondary)
 *
 *   UI Elements (after reveal):
 *     - Modal title: "Backup Recovery Phrase"
 *     - Identity label: "For identity: {identityLabel}"
 *     - Mnemonic display:
 *       * Grid layout: 2 columns for 12 words, 3 columns for 24 words
 *       * Each word: number (1-12 or 1-24) + word text
 *       * Monospace font for mnemonic words
 *       * Highlighted background for easy reading
 *     - Copy button: "Copy to Clipboard" with icon
 *     - Reminder text: "Write this down on paper and store securely"
 *     - Button: "Done" (primary, closes modal)
 *
 *   Properties:
 *     - Security-first: mnemonic hidden until explicit user action
 *     - User confirmation: requires acknowledgment before reveal
 *     - Accessibility: proper ARIA labels, keyboard navigation
 *     - Responsive: grid layout adapts to word count
 *     - Copy feedback: visual confirmation when copied to clipboard
 *
 *   Implementation Notes:
 *     - Use Chakra UI Dialog components (Dialog.Root, Dialog.Content, etc.)
 *     - Use useState for isRevealed state
 *     - Split mnemonic into words array for grid display
 *     - Use navigator.clipboard.writeText for copy functionality
 *     - Use Chakra UI toast/notification for copy feedback
 *     - Follow existing modal patterns in codebase (see QrCodeDisplayModal.tsx)
 *
 *   Styling:
 *     - Warning icon: large (48px), warning color (yellow/orange)
 *     - Mnemonic words: monospace font, larger size (16px), high contrast
 *     - Grid spacing: comfortable padding between words
 *     - Modal width: responsive, max 600px
 *     - Button colors: follow Chakra UI semantic colors (primary, warning)
 */
export const MnemonicBackupModal: React.FC<MnemonicBackupModalProps> = (props) => {
  const [isRevealed, setIsRevealed] = useState(false);

  const handleClose = () => {
    setIsRevealed(false);
    props.onClose();
  };

  const handleReveal = () => {
    setIsRevealed(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.mnemonic);
    } catch (err) {
      console.error('Failed to copy mnemonic to clipboard:', err);
    }
  };

  const words = props.mnemonic.split(' ');
  const isLongPhrase = words.length >= 24;
  const gridColumns = isLongPhrase ? 3 : 2;

  return (
    <Dialog.Root open={props.isOpen} onOpenChange={(e) => !e.open && handleClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxW="600px" data-testid="mnemonic-backup-modal">
          <Dialog.Header>
            <Dialog.Title>Backup Recovery Phrase</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger onClick={handleClose} />
          <Dialog.Body>
            {!isRevealed ? (
              <WarningView identityLabel={props.identityLabel} onReveal={handleReveal} />
            ) : (
              <RevealedView
                words={words}
                gridColumns={gridColumns}
                onCopy={handleCopy}
                onDone={handleClose}
              />
            )}
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
};

interface WarningViewProps {
  identityLabel: string;
  onReveal: () => void;
}

function WarningView({ identityLabel, onReveal }: WarningViewProps) {
  return (
    <div data-testid="mnemonic-warning-view">
      <div style={{ marginBottom: '16px' }}>
        <p style={{ fontSize: '14px', color: '#888' }}>
          For identity: <strong>{identityLabel}</strong>
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '16px',
          padding: '16px',
          backgroundColor: '#fff5e6',
          borderRadius: '8px',
          marginBottom: '20px',
        }}
      >
        <div style={{ fontSize: '32px', lineHeight: '1' }}>⚠️</div>
        <div>
          <p style={{ margin: '0 0 12px 0', fontWeight: '600' }}>Security Warning</p>
          <p style={{ margin: '0', fontSize: '14px', lineHeight: '1.5' }}>
            This recovery phrase gives <strong>COMPLETE ACCESS</strong> to your identity. Anyone with
            this phrase can read your messages and impersonate you.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>Best Practices:</h4>
        <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '14px', lineHeight: '1.8' }}>
          <li>Write it down on paper</li>
          <li>Store in a secure location</li>
          <li>Never share it with anyone</li>
          <li>Never store it digitally (screenshots, cloud storage, etc.)</li>
        </ul>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          onClick={onReveal}
          data-testid="reveal-mnemonic-button"
          style={{
            padding: '8px 16px',
            backgroundColor: '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '14px',
          }}
        >
          I Understand, Show Phrase
        </button>
      </div>
    </div>
  );
}

interface RevealedViewProps {
  words: string[];
  gridColumns: number;
  onCopy: () => void;
  onDone: () => void;
}

function RevealedView({ words, gridColumns, onCopy, onDone }: RevealedViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyClick = async () => {
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div data-testid="mnemonic-revealed-view">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
          gap: '12px',
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          marginBottom: '20px',
        }}
        data-testid="mnemonic-word-grid"
      >
        {words.map((word, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              gap: '8px',
              padding: '8px 12px',
              backgroundColor: 'white',
              borderRadius: '4px',
              border: '1px solid #ddd',
            }}
            data-testid={`mnemonic-word-${index}`}
          >
            <span
              style={{
                minWidth: '20px',
                fontWeight: '600',
                color: '#888',
                fontSize: '13px',
              }}
            >
              {index + 1}
            </span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '15px',
                fontWeight: '500',
                color: '#000',
              }}
              data-testid={`mnemonic-word-text-${index}`}
            >
              {word}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '12px 16px',
          backgroundColor: '#e0f2fe',
          borderRadius: '4px',
          marginBottom: '20px',
          fontSize: '14px',
          color: '#0369a1',
        }}
        data-testid="mnemonic-security-reminder"
      >
        Write this down on paper and store securely
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
        <button
          onClick={handleCopyClick}
          data-testid="copy-mnemonic-button"
          style={{
            padding: '8px 16px',
            backgroundColor: copied ? '#10b981' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '14px',
            transition: 'background-color 0.2s',
          }}
          title={copied ? 'Copied!' : 'Copy to clipboard'}
        >
          {copied ? '✓ Copied' : 'Copy to Clipboard'}
        </button>
        <button
          onClick={onDone}
          data-testid="done-button"
          style={{
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '14px',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
