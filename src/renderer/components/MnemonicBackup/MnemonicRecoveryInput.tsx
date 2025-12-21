/**
 * Mnemonic Recovery Input Component
 *
 * Input component for entering BIP39 mnemonic phrases during identity recovery.
 * Provides real-time validation, word suggestions, and error feedback.
 *
 * BIP Standards Compliance:
 * - BIP-39: Mnemonic code for generating deterministic keys
 * - BIP-32: Hierarchical Deterministic (HD) wallets
 * - BIP-44: Multi-account hierarchy for deterministic wallets
 *
 * Derivation: mnemonic → seed (BIP-39) → HD key at path (BIP-32/44) → nsec
 * Default path: m/44'/1237'/0'/0/0 (NIP-06 standard for Nostr)
 *
 * UX Features:
 * - Large textarea for entering 12 or 24 words
 * - Real-time word count display
 * - Validation feedback (valid/invalid indicator)
 * - Optional derivation path customization for recovery from other apps
 * - Paste support with whitespace normalization
 * - Clear error messages for invalid mnemonics
 *
 * Used in:
 * - Identity creation modal (new tab for "Recover from mnemonic")
 * - Identity import flow
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Field,
  Textarea,
  Box,
  HStack,
  Text,
  Input,
  VStack,
} from '@chakra-ui/react';
import { validateWords } from 'nostr-tools/nip06';

// Default derivation path (NIP-06 standard)
const DEFAULT_DERIVATION_PATH = "m/44'/1237'/0'/0/0";

// Inline SVG icons matching the codebase pattern
const CheckCircleIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
  </svg>
);

/**
 * Validates a BIP-32 derivation path
 */
function validateDerivationPath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }
  // BIP-32 path format: m/number'/number'/number'/number/number
  const pathRegex = /^m(\/\d+'?)+$/;
  return pathRegex.test(path);
}

// ============================================================================
// CONTRACT: MnemonicRecoveryInputProps
// ============================================================================

/**
 * Props for MnemonicRecoveryInput component
 *
 * CONTRACT:
 *   Properties:
 *     - value: string, current mnemonic input value
 *       Constraints: controlled component, parent manages state
 *     - onChange: function, callback when mnemonic changes
 *       Signature: (mnemonic: string) => void
 *       Behavior: parent updates state with new mnemonic
 *     - onValidationChange: function (optional), callback when validation state changes
 *       Signature: (isValid: boolean) => void
 *       Behavior: parent can enable/disable submit button based on validation
 *     - derivationPath: string (optional), current derivation path value
 *       Default: "m/44'/1237'/0'/0/0" (NIP-06 standard)
 *     - onDerivationPathChange: function (optional), callback when derivation path changes
 *       Signature: (path: string) => void
 *     - autoFocus: boolean (optional), whether to auto-focus input on mount
 *       Default: false
 *     - placeholder: string (optional), placeholder text for empty input
 *       Default: "Enter your 12 or 24 word recovery phrase..."
 *
 *   Invariants:
 *     - Component is controlled: value always matches props.value
 *     - onChange called on every input change
 *     - onValidationChange called when validation state transitions
 */
export interface MnemonicRecoveryInputProps {
  value: string;
  onChange: (mnemonic: string) => void;
  onValidationChange?: (isValid: boolean) => void;
  derivationPath?: string;
  onDerivationPathChange?: (path: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

// ============================================================================
// CONTRACT: MnemonicRecoveryInput
// ============================================================================

/**
 * Input component for entering and validating BIP39 mnemonic phrases
 *
 * CONTRACT:
 *   Inputs:
 *     - props: MnemonicRecoveryInputProps (see above)
 *
 *   Outputs:
 *     - React component rendering textarea with validation UI
 *
 *   State:
 *     - validationState: 'idle' | 'valid' | 'invalid'
 *       Initial: 'idle' (no validation yet)
 *       Transitions:
 *         - idle → valid: when input becomes valid mnemonic
 *         - idle → invalid: when input is non-empty but invalid
 *         - valid ↔ invalid: as user edits
 *         - any → idle: when input is cleared to empty
 *
 *   Behavior:
 *     - As user types, validate mnemonic in real-time
 *     - Normalize whitespace: trim, collapse multiple spaces
 *     - Count words and display word count indicator
 *     - Show validation icon: checkmark (valid), X (invalid), none (idle)
 *     - Call onValidationChange when validation state changes
 *     - Show BIP standards info and optional derivation path input
 */
export const MnemonicRecoveryInput: React.FC<MnemonicRecoveryInputProps> = (props) => {
  const [validationState, setValidationState] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pathValidationState, setPathValidationState] = useState<'valid' | 'invalid'>('valid');
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const previousStateRef = useRef<'idle' | 'valid' | 'invalid'>('idle');

  // Validate mnemonic based on word count and BIP39 validation
  const validateMnemonic = useCallback((mnemonic: string): 'idle' | 'valid' | 'invalid' => {
    // Empty input is idle state
    if (!mnemonic || mnemonic.trim().length === 0) {
      return 'idle';
    }

    // Split into words and count
    const words = mnemonic.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    // Word count must be 12 or 24
    if (wordCount !== 12 && wordCount !== 24) {
      return 'invalid';
    }

    // Validate using BIP39 validation from nostr-tools
    try {
      const isValid = validateWords(mnemonic);
      return isValid ? 'valid' : 'invalid';
    } catch {
      return 'invalid';
    }
  }, []);

  // Handle input change with debounced validation
  const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const rawValue = event.target.value;
    // Normalize: trim, collapse multiple spaces, lowercase
    const normalized = rawValue.trim().replace(/\s+/g, ' ').toLowerCase();
    props.onChange(normalized);

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce validation (300ms)
    debounceTimerRef.current = setTimeout(() => {
      const newValidationState = validateMnemonic(normalized);
      setValidationState(newValidationState);

      // Call onValidationChange if state changed
      if (newValidationState !== previousStateRef.current) {
        previousStateRef.current = newValidationState;
        props.onValidationChange?.(newValidationState === 'valid');
      }
    }, 300);
  }, [props, validateMnemonic]);

  // Handle derivation path change
  const handlePathChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const path = event.target.value;
    props.onDerivationPathChange?.(path);
    setPathValidationState(validateDerivationPath(path) ? 'valid' : 'invalid');
  }, [props]);

  // Validate when value prop changes from outside
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const newValidationState = validateMnemonic(props.value);
      setValidationState(newValidationState);

      // Call onValidationChange if state changed
      if (newValidationState !== previousStateRef.current) {
        previousStateRef.current = newValidationState;
        props.onValidationChange?.(newValidationState === 'valid');
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [props.value, validateMnemonic, props]);

  // Calculate word count
  const wordCount = props.value.trim().split(/\s+/).filter(w => w.length > 0).length;
  const wordCountColor = wordCount === 12 || wordCount === 24 ? 'green.500' : 'orange.500';
  const borderColor =
    validationState === 'valid' ? 'green.500' : validationState === 'invalid' ? 'red.500' : undefined;

  const placeholder = props.placeholder || 'Enter your 12 or 24 word recovery phrase...';
  const currentPath = props.derivationPath || DEFAULT_DERIVATION_PATH;

  return (
    <VStack gap={4} align="stretch">
      <Field.Root>
        <Field.Label>Recovery Phrase</Field.Label>

        <Textarea
          value={props.value}
          onChange={handleChange}
          autoFocus={props.autoFocus}
          placeholder={placeholder}
          rows={4}
          fontFamily="Monaco, Consolas, monospace"
          borderColor={borderColor}
          _focus={borderColor ? { borderColor } : undefined}
          data-testid="mnemonic-recovery-textarea"
        />

        <Field.HelperText>Enter 12 or 24 words separated by spaces</Field.HelperText>

        <HStack justify="space-between" mt={2}>
          <Text fontSize="sm" color={wordCountColor} data-testid="mnemonic-word-count">
            {wordCount} word{wordCount !== 1 ? 's' : ''}
          </Text>

          {validationState === 'valid' && (
            <HStack gap={1}>
              <Box as="span" color="green.500" data-testid="mnemonic-valid-icon">
                <CheckCircleIcon />
              </Box>
              <Text fontSize="sm" color="green.500" data-testid="mnemonic-valid-message">
                Valid recovery phrase
              </Text>
            </HStack>
          )}

          {validationState === 'invalid' && wordCount > 0 && (
            <HStack gap={1}>
              <Box as="span" color="red.500" data-testid="mnemonic-invalid-icon">
                <CloseIcon />
              </Box>
              <Text fontSize="sm" color="red.500" data-testid="mnemonic-invalid-message">
                Invalid recovery phrase - check for typos
              </Text>
            </HStack>
          )}
        </HStack>
      </Field.Root>

      {/* BIP Standards Info */}
      <Box
        bg="gray.50"
        _dark={{ bg: 'gray.800' }}
        p={3}
        borderRadius="md"
        fontSize="sm"
      >
        <HStack gap={2} mb={2}>
          <Box color="blue.500">
            <InfoIcon />
          </Box>
          <Text fontWeight="medium">BIP-32/39/44 Compliant</Text>
        </HStack>
        <Text color="gray.600" _dark={{ color: 'gray.400' }} fontSize="xs">
          This uses standard hierarchical deterministic (HD) wallet derivation.
          Default path: {DEFAULT_DERIVATION_PATH}
        </Text>
        <Text
          color="blue.500"
          fontSize="xs"
          cursor="pointer"
          mt={2}
          onClick={() => setShowAdvanced(!showAdvanced)}
          data-testid="toggle-advanced-options"
        >
          {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
        </Text>
      </Box>

      {/* Advanced: Derivation Path */}
      {showAdvanced && (
        <Field.Root invalid={pathValidationState === 'invalid'}>
          <Field.Label>Derivation Path</Field.Label>
          <Input
            value={currentPath}
            onChange={handlePathChange}
            placeholder={DEFAULT_DERIVATION_PATH}
            fontFamily="Monaco, Consolas, monospace"
            fontSize="sm"
            data-testid="derivation-path-input"
          />
          <Field.HelperText>
            If recovering from another app, you may need a different path.
            Consult that app's documentation for the correct path.
          </Field.HelperText>
          {pathValidationState === 'invalid' && (
            <Field.ErrorText data-testid="derivation-path-error">
              Invalid path format. Expected format: m/44'/1237'/0'/0/0
            </Field.ErrorText>
          )}
        </Field.Root>
      )}
    </VStack>
  );
};
