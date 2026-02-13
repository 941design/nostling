/**
 * NIP-98 HTTP Authentication Service
 *
 * Generates signed Nostr events (kind 27235) for authenticating HTTP requests
 * to Blossom servers. Each token is single-use with a 60-second validity window.
 */

import { finalizeEvent } from 'nostr-tools/pure';

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface Nip98TokenResult {
  authorizationHeader: string;
  event: NostrEvent;
}

/**
 * Generate NIP-98 authentication token for HTTP request.
 *
 * Creates a kind 27235 Nostr event signed by the given secret key,
 * containing the HTTP method, URL, and SHA-256 body hash as tags.
 * The signed event is base64-encoded for the Authorization header.
 */
export function generateNip98Token(
  secretKey: Uint8Array,
  url: string,
  method: string,
  bodyHash: string
): Nip98TokenResult {
  const eventTemplate = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', method],
      ['payload', bodyHash],
    ],
    content: '',
  };

  const signedEvent = finalizeEvent(eventTemplate, secretKey) as unknown as NostrEvent;

  const eventJson = JSON.stringify(signedEvent);
  const base64 = Buffer.from(eventJson).toString('base64');

  return {
    authorizationHeader: `Nostr ${base64}`,
    event: signedEvent,
  };
}
