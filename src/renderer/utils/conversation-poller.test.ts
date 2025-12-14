import { startConversationPoller } from './conversation-poller';

jest.useFakeTimers();

describe('startConversationPoller', () => {
  it('polls the active conversation immediately and on an interval', () => {
    const refreshMessages = jest.fn();

    const stop = startConversationPoller({
      identityId: 'id-1',
      contactId: 'contact-1',
      refreshMessages,
      intervalMs: 1000,
    });

    expect(refreshMessages).toHaveBeenCalledTimes(1);
    expect(refreshMessages).toHaveBeenCalledWith('id-1', 'contact-1');

    jest.advanceTimersByTime(1000);
    expect(refreshMessages).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(3000);
    expect(refreshMessages).toHaveBeenCalledTimes(5);

    stop();
  });

  it('does nothing when conversation context is missing', () => {
    const refreshMessages = jest.fn();

    const stop = startConversationPoller({
      identityId: null,
      contactId: 'contact-1',
      refreshMessages,
      intervalMs: 500,
    });

    jest.advanceTimersByTime(2000);
    expect(refreshMessages).not.toHaveBeenCalled();

    stop();
  });
});
