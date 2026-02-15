/**
 * MediaAttachments - Renders media attachments within message bubbles.
 *
 * Handles outgoing (local blob preview, upload progress) and incoming
 * (remote fetch, cache, blurhash placeholder) media rendering.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Text, IconButton } from '@chakra-ui/react';
import { decode as decodeBlurhash } from 'blurhash';
import { CachedImage } from '../CachedImage';
import { useThemeColors } from '../../themes/ThemeContext';
import {
  parseMediaJson,
  isImageMimeType,
  formatFileSize,
  ParsedMediaAttachment,
} from '../../utils/media-parser';
import type { MessageUploadProgress } from '../../hooks/useUploadProgress';

interface MediaAttachmentsProps {
  mediaJson?: string;
  messageId: string;
  messageStatus: string;
  isOwn: boolean;
  uploadProgress?: MessageUploadProgress;
  onRetry?: () => void;
}

export function MediaAttachments({
  mediaJson,
  messageId,
  messageStatus,
  isOwn,
  uploadProgress,
  onRetry,
}: MediaAttachmentsProps): React.ReactElement | null {
  const colors = useThemeColors();
  const attachments = useMemo(() => parseMediaJson(mediaJson), [mediaJson]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [resolvedUrls, setResolvedUrls] = useState<Map<string, string>>(new Map());

  // Resolve local-blob: URLs to actual file paths via IPC
  useEffect(() => {
    const localBlobs = attachments.filter(a => a.isLocalBlob && a.sha256);
    if (localBlobs.length === 0) return;

    let cancelled = false;
    const resolve = async () => {
      const newUrls = new Map<string, string>();
      for (const blob of localBlobs) {
        try {
          const result = await window.api.blobStorage?.getBlob(blob.sha256!);
          if (result && !cancelled) {
            // Convert file path to file:// URL for img src
            newUrls.set(blob.sha256!, `file://${result.localPath}`);
          }
        } catch {
          // Blob may have been cleaned up
        }
      }
      if (!cancelled) {
        setResolvedUrls(prev => {
          const merged = new Map(prev);
          for (const [k, v] of newUrls) merged.set(k, v);
          return merged;
        });
      }
    };
    resolve();
    return () => { cancelled = true; };
  }, [attachments]);

  if (attachments.length === 0) return null;

  const textColor = isOwn ? colors.ownBubbleText : colors.text;
  const subtleColor = isOwn ? colors.ownBubbleText : colors.textMuted;
  const isUploading = messageStatus === 'queued' || messageStatus === 'sending';
  const isError = messageStatus === 'error';

  const getDisplayUrl = (attachment: ParsedMediaAttachment): string | undefined => {
    if (attachment.isLocalBlob && attachment.sha256) {
      return resolvedUrls.get(attachment.sha256);
    }
    return attachment.url;
  };

  return (
    <Box mt="2">
      <Flex direction="column" gap="2">
        {attachments.map((attachment, index) => {
          const displayUrl = getDisplayUrl(attachment);
          const isImage = isImageMimeType(attachment.mimeType);

          if (isImage) {
            return (
              <ImageAttachment
                key={`${messageId}-${index}`}
                attachment={attachment}
                displayUrl={displayUrl}
                isOwn={isOwn}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                onClickExpand={() => displayUrl && setLightboxUrl(displayUrl)}
              />
            );
          }

          return (
            <FileAttachment
              key={`${messageId}-${index}`}
              attachment={attachment}
              displayUrl={displayUrl}
              textColor={textColor}
              subtleColor={subtleColor}
            />
          );
        })}
      </Flex>

      {/* Status indicator */}
      {isOwn && (
        <Flex align="center" gap="1" mt="1">
          <StatusIndicator
            messageStatus={messageStatus}
            uploadProgress={uploadProgress}
            colors={colors}
          />
          {isError && onRetry && (
            <IconButton
              size="xs"
              variant="ghost"
              aria-label="Retry upload"
              onClick={onRetry}
              color={colors.statusError}
              _hover={{ bg: colors.surfaceBgSelected }}
            >
              <RetryIcon />
            </IconButton>
          )}
        </Flex>
      )}

      {/* Upload progress indicator */}
      {isUploading && uploadProgress && !uploadProgress.isComplete && (
        <Box mt="1">
          <Box
            h="3px"
            bg={colors.borderSubtle}
            borderRadius="full"
            overflow="hidden"
          >
            <Box
              h="100%"
              bg={colors.statusInfo}
              borderRadius="full"
              transition="width 0.3s ease"
              style={{ width: `${Math.round(uploadProgress.progress * 100)}%` }}
            />
          </Box>
        </Box>
      )}

      {/* Lightbox overlay */}
      {lightboxUrl && (
        <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </Box>
  );
}

// --- Image Attachment ---

function ImageAttachment({
  attachment,
  displayUrl,
  isOwn,
  isUploading,
  uploadProgress,
  onClickExpand,
}: {
  attachment: ParsedMediaAttachment;
  displayUrl?: string;
  isOwn: boolean;
  isUploading: boolean;
  uploadProgress?: MessageUploadProgress;
  onClickExpand: () => void;
}) {
  const colors = useThemeColors();
  const showBlurhash = !displayUrl && attachment.blurhash;

  return (
    <Box
      position="relative"
      borderRadius="md"
      overflow="hidden"
      cursor={displayUrl ? 'pointer' : 'default'}
      onClick={displayUrl ? onClickExpand : undefined}
      maxW="300px"
    >
      {showBlurhash ? (
        <BlurhashPlaceholder
          blurhash={attachment.blurhash!}
          width={attachment.dimensions?.width || 300}
          height={attachment.dimensions?.height || 200}
        />
      ) : displayUrl ? (
        <CachedImage
          url={displayUrl}
          alt={attachment.fileName || 'Image'}
          maxH="300px"
          maxW="100%"
          objectFit="contain"
          borderRadius="md"
        />
      ) : (
        <Box
          bg={colors.surfaceBg}
          h="100px"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize="sm" color={colors.textMuted}>Loading...</Text>
        </Box>
      )}

      {/* Upload progress overlay for images */}
      {isUploading && uploadProgress && !uploadProgress.isComplete && (
        <Box
          position="absolute"
          bottom="0"
          left="0"
          right="0"
          bg="blackAlpha.600"
          p="1"
        >
          <Box
            h="3px"
            bg="whiteAlpha.400"
            borderRadius="full"
            overflow="hidden"
          >
            <Box
              h="100%"
              bg="white"
              borderRadius="full"
              transition="width 0.3s ease"
              style={{ width: `${Math.round(uploadProgress.progress * 100)}%` }}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}

// --- File Attachment ---

function FileAttachment({
  attachment,
  displayUrl,
  textColor,
  subtleColor,
}: {
  attachment: ParsedMediaAttachment;
  displayUrl?: string;
  textColor: string;
  subtleColor: string;
}) {
  const colors = useThemeColors();

  const handleDownload = useCallback(() => {
    if (displayUrl) {
      window.api.system.openExternal(displayUrl).catch(() => {});
    }
  }, [displayUrl]);

  return (
    <Flex
      align="center"
      gap="2"
      p="2"
      borderWidth="1px"
      borderColor={colors.borderSubtle}
      borderRadius="md"
      cursor={displayUrl ? 'pointer' : 'default'}
      onClick={displayUrl ? handleDownload : undefined}
      _hover={displayUrl ? { bg: colors.surfaceBgSelected } : undefined}
    >
      <FileIcon color={subtleColor} />
      <Box flex="1" overflow="hidden">
        <Text
          fontSize="sm"
          color={textColor}
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {attachment.fileName || 'File'}
        </Text>
        <Text fontSize="xs" color={subtleColor}>
          {[attachment.mimeType, formatFileSize(attachment.sizeBytes)].filter(Boolean).join(' · ')}
        </Text>
      </Box>
      {displayUrl && (
        <DownloadIcon color={subtleColor} />
      )}
    </Flex>
  );
}

// --- Blurhash Placeholder ---

function BlurhashPlaceholder({
  blurhash,
  width,
  height,
}: {
  blurhash: string;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Limit canvas size for performance
  const displayW = Math.min(width, 300);
  const displayH = Math.round(displayW * (height / width));
  const decodeW = Math.min(displayW, 32);
  const decodeH = Math.round(decodeW * (height / width));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const pixels = decodeBlurhash(blurhash, decodeW, decodeH);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const imageData = ctx.createImageData(decodeW, decodeH);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // Invalid blurhash, leave canvas blank
    }
  }, [blurhash, decodeW, decodeH]);

  return (
    <canvas
      ref={canvasRef}
      width={decodeW}
      height={decodeH}
      style={{
        width: `${displayW}px`,
        height: `${displayH}px`,
        borderRadius: '6px',
        imageRendering: 'auto',
      }}
    />
  );
}

// --- Lightbox ---

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <Box
      position="fixed"
      top="0"
      left="0"
      right="0"
      bottom="0"
      bg="blackAlpha.800"
      zIndex="overlay"
      display="flex"
      alignItems="center"
      justifyContent="center"
      onClick={onClose}
      cursor="pointer"
      data-testid="media-lightbox"
    >
      <img
        src={url}
        alt="Expanded view"
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          borderRadius: '8px',
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </Box>
  );
}

// --- Status Indicator ---

/** Returns the status icon and label for outgoing message states. */
export function getStatusDisplay(messageStatus: string, isUploadComplete?: boolean): { icon: 'clock' | 'progress' | 'spinner' | 'check' | 'warning'; label: string } {
  switch (messageStatus) {
    case 'queued':
      return { icon: 'clock', label: 'Queued' };
    case 'sending':
      return isUploadComplete
        ? { icon: 'spinner', label: 'Sending' }
        : { icon: 'progress', label: 'Uploading' };
    case 'sent':
      return { icon: 'check', label: 'Sent' };
    case 'error':
      return { icon: 'warning', label: 'Upload failed' };
    default:
      return { icon: 'check', label: '' };
  }
}

function StatusIndicator({
  messageStatus,
  uploadProgress,
  colors,
}: {
  messageStatus: string;
  uploadProgress?: MessageUploadProgress;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const { icon, label } = getStatusDisplay(messageStatus, uploadProgress?.isComplete);
  const iconColor = messageStatus === 'error' ? colors.statusError : colors.textMuted;

  return (
    <Flex align="center" gap="1">
      {icon === 'clock' && <ClockIcon color={iconColor} />}
      {icon === 'progress' && <ProgressIcon color={iconColor} />}
      {icon === 'spinner' && <SpinnerIcon color={iconColor} />}
      {icon === 'check' && <CheckmarkIcon color={iconColor} />}
      {icon === 'warning' && <WarningIcon color={iconColor} />}
      {label && <Text fontSize="xs" color={iconColor}>{label}</Text>}
    </Flex>
  );
}

// --- Icons ---

function ClockIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ProgressIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

function SpinnerIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CheckmarkIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function WarningIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function FileIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function DownloadIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
