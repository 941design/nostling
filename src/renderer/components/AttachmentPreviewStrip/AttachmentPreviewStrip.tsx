/**
 * Attachment Preview Strip Component
 *
 * Horizontal scrolling list showing attachment previews with remove buttons.
 */

import React from 'react';
import { Box, Flex, IconButton, Text } from '@chakra-ui/react';
import { AttachmentMetadata } from '../../hooks/useAttachments';
import { useThemeColors } from '../../themes/ThemeContext';

interface AttachmentPreviewStripProps {
  attachments: AttachmentMetadata[];
  onRemove: (index: number) => void;
}

/**
 * Preview strip for attachments
 */
export function AttachmentPreviewStrip({ attachments, onRemove }: AttachmentPreviewStripProps) {
  const colors = useThemeColors();

  if (attachments.length === 0) {
    return null;
  }

  return (
    <Box
      mt="2"
      overflowX="auto"
      css={{
        '&::-webkit-scrollbar': {
          height: '8px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: colors.borderSubtle,
          borderRadius: '4px',
        },
      }}
    >
      <Flex gap="2">
        {attachments.map((attachment, index) => (
          <AttachmentPreviewItem
            key={index}
            attachment={attachment}
            onRemove={() => onRemove(index)}
          />
        ))}
      </Flex>
    </Box>
  );
}

interface AttachmentPreviewItemProps {
  attachment: AttachmentMetadata;
  onRemove: () => void;
}

/**
 * Individual attachment preview item
 */
function AttachmentPreviewItem({ attachment, onRemove }: AttachmentPreviewItemProps) {
  const colors = useThemeColors();
  const isImage = attachment.type.startsWith('image/');

  return (
    <Box
      position="relative"
      borderWidth="1px"
      borderColor={colors.border}
      borderRadius="md"
      bg={colors.surfaceBg}
      p="2"
      minWidth="120px"
      maxWidth="150px"
    >
      {/* Remove button */}
      <IconButton
        aria-label="Remove attachment"
        variant="ghost"
        size="xs"
        position="absolute"
        top="0"
        right="0"
        onClick={onRemove}
        bg={colors.surfaceBg}
        _hover={{ bg: colors.surfaceBgSubtle }}
      >
        <XIcon />
      </IconButton>

      {/* Thumbnail or icon */}
      <Box mb="2" display="flex" justifyContent="center" alignItems="center" height="80px">
        {isImage && attachment.thumbnailUrl ? (
          <img
            src={attachment.thumbnailUrl}
            alt={attachment.name}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
          />
        ) : (
          <MimeIcon mimeType={attachment.type} />
        )}
      </Box>

      {/* File name */}
      <Text
        fontSize="xs"
        color={colors.textSubtle}
        lineClamp={1}
        title={attachment.name}
      >
        {attachment.name}
      </Text>

      {/* File size */}
      <Text fontSize="xs" color={colors.textMuted}>
        {formatFileSize(attachment.size)}
      </Text>
    </Box>
  );
}

/**
 * MIME type icon
 */
function MimeIcon({ mimeType }: { mimeType: string }) {
  const colors = useThemeColors();

  if (mimeType.startsWith('video/')) {
    return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </svg>
    );
  }

  if (mimeType.startsWith('audio/')) {
    return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    );
  }

  if (mimeType === 'application/pdf') {
    return (
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    );
  }

  // Generic file icon
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}

/**
 * X icon for remove button
 */
function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
