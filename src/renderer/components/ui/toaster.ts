/**
 * Toast notification utility.
 * Minimal implementation — uses console as fallback until a full toast UI is wired.
 */
export const toaster = {
  create(options: { title: string; description?: string; type?: string; duration?: number }) {
    const level = options.type === 'error' ? 'error' : options.type === 'warning' ? 'warn' : 'info';
    (console as any)[level]?.(`[Toast] ${options.title}: ${options.description ?? ''}`);
  },
};
