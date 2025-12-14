export interface ConversationPollerOptions {
  identityId: string | null;
  contactId: string | null;
  refreshMessages: (identityId: string, contactId: string) => void | Promise<void>;
  intervalMs?: number;
}

/**
 * Starts a poller for the currently active conversation. Immediately triggers
 * a refresh and continues to poll on the provided interval.
 */
export function startConversationPoller({
  identityId,
  contactId,
  refreshMessages,
  intervalMs = 3000,
}: ConversationPollerOptions): () => void {
  if (!identityId || !contactId) {
    return () => {};
  }

  refreshMessages(identityId, contactId);

  const interval = setInterval(() => {
    refreshMessages(identityId, contactId);
  }, intervalMs);

  return () => clearInterval(interval);
}
