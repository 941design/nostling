/**
 * Attachment Button Component
 *
 * Paperclip button that triggers file selection dialog for message attachments.
 */

import React from 'react';
import { IconButton } from '@chakra-ui/react';

interface AttachmentButtonProps {
  disabled?: boolean;
  onClick: () => void;
}

/**
 * Paperclip button for file attachments
 */
export function AttachmentButton({ disabled, onClick }: AttachmentButtonProps) {
  return (
    <IconButton
      aria-label="Attach file"
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onClick}
    >
      <PaperclipIcon />
    </IconButton>
  );
}

/**
 * Paperclip icon SVG
 */
function PaperclipIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
