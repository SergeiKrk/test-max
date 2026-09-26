import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GreenApi, Notification } from '../api/types';
import { startReceiving } from './receiveLoop';

const note = (receiptId: number): Notification => ({
  receiptId, event: { kind: 'text', message: { chatId: 'chat-b', idMessage: 'message-1', text: 'Ответ', timestamp: 10 } },
});

const failure = (code: string, status?: number, retryAfterMs?: number) => ({ code, operation: 'receiveNotification', status, retryAfterMs });
const tick = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('receive loop', () => {
  it('applies before delete and receives next only after acknowledgement', async () => {
    const controller = new AbortController();
    const order: string[] = [];
    let resolveDelete!: (value: boolean) => void;
    const api = {
      receiveNotification: vi.fn().mockImplementationOnce(async () => { order.push('receive'); return note(1); })
        .mockImplementationOnce(async () => { order.push('next'); controller.abort(); return null; }),
      deleteNotification: vi.fn(() => { order.push('delete'); return new Promise<boolean>((resolve) => { resolveDelete = resolve; }); }),
    } as unknown as GreenApi;
    const running = startReceiving({ api, signal: controller.signal, onEvent: () => order.push('apply'), onState: vi.fn() });
    await tick();
    expect(order).toEqual(['receive', 'apply', 'delete']);
    resolveDelete(true);
    await running;
    expect(order).toEqual(['receive', 'apply', 'delete', 'next']);
  });

  it('acknowledges repeated receipts without replaying the event, and skips known events', async () => {
    const controller = new AbortController();
    const api = {
      receiveNotification: vi.fn().mockResolvedValueOnce(note(1)).mockResolvedValueOnce(note(1))
        .mockResolvedValueOnce({ receiptId: 2, event: { kind: 'skip', typeWebhook: 'outgoingMessageReceived' } })
        .mockImplementationOnce(async () => { controller.abort(); return null; }),
      deleteNotification: vi.fn().mockResolvedValue(true),
    } as unknown as GreenApi;
    const onEvent = vi.fn();
    await startReceiving({ api, signal: controller.signal, onEvent, onState: vi.fn() });
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(api.deleteNotification).toHaveBeenCalledTimes(3);
  });

  it('continues immediately after an empty poll', async () => {
    const controller = new AbortController();
    const api = {
      receiveNotification: vi.fn().mockResolvedValueOnce(null).mockImplementationOnce(async () => { controller.abort(); return null; }),
      deleteNotification: vi.fn(),
    } as unknown as GreenApi;
    await startReceiving({ api, signal: controller.signal, onEvent: vi.fn(), onState: vi.fn() });
    expect(api.receiveNotification).toHaveBeenCalledTimes(2);
  });

  it('holds the same receipt through two DELETE failures and applies once', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const controller = new AbortController();
    const api = {
      receiveNotification: vi.fn().mockResolvedValueOnce(note(7)).mockImplementationOnce(async () => { controller.abort(); return null; }),
      deleteNotification: vi.fn().mockRejectedValueOnce(failure('network')).mockRejectedValueOnce(failure('http', 503)).mockResolvedValueOnce(true),
    } as unknown as GreenApi;
    const onEvent = vi.fn();
    const running = startReceiving({ api, signal: controller.signal, onEvent, onState: vi.fn() });
    await tick();
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await running;
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(api.deleteNotification).toHaveBeenCalledTimes(3);
    expect(api.deleteNotification).toHaveBeenNthCalledWith(3, 7, expect.any(AbortSignal));
  });

  it('pauses after five failed attempts and honors Retry-After with bounded jitter', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const api = {
      receiveNotification: vi.fn().mockRejectedValue(failure('http', 429, 3000)),
      deleteNotification: vi.fn(),
    } as unknown as GreenApi;
    const states = vi.fn();
    const running = startReceiving({ api, signal: new AbortController().signal, onEvent: vi.fn(), onState: states });
    await tick();
    await vi.advanceTimersByTimeAsync(2999);
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.receiveNotification).toHaveBeenCalledTimes(2);
    await vi.runAllTimersAsync();
    await running;
    expect(api.receiveNotification).toHaveBeenCalledTimes(5);
    expect(states).toHaveBeenLastCalledWith('paused');
  });

  it('pauses on DELETE false without another receive', async () => {
    const api = {
      receiveNotification: vi.fn().mockResolvedValue(note(4)),
      deleteNotification: vi.fn().mockResolvedValue(false),
    } as unknown as GreenApi;
    const states = vi.fn();
    await startReceiving({ api, signal: new AbortController().signal, onEvent: vi.fn(), onState: states });
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    expect(states).toHaveBeenLastCalledWith('paused');
  });

  it.each(['access', 'schema'])('does not retry or delete on %s', async (code) => {
    const api = {
      receiveNotification: vi.fn().mockRejectedValue(failure(code)),
      deleteNotification: vi.fn(),
    } as unknown as GreenApi;
    const states = vi.fn();
    await startReceiving({ api, signal: new AbortController().signal, onEvent: vi.fn(), onState: states });
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    expect(api.deleteNotification).not.toHaveBeenCalled();
    expect(states).toHaveBeenLastCalledWith('paused');
  });

  it('does not apply or acknowledge a late response after abort', async () => {
    const controller = new AbortController();
    let resolveReceive!: (value: Notification) => void;
    const api = {
      receiveNotification: vi.fn(() => new Promise<Notification>((resolve) => { resolveReceive = resolve; })),
      deleteNotification: vi.fn().mockResolvedValue(true),
    } as unknown as GreenApi;
    const onEvent = vi.fn();
    const running = startReceiving({ api, signal: controller.signal, onEvent, onState: vi.fn() });
    controller.abort();
    resolveReceive(note(1));
    await running;
    expect(onEvent).not.toHaveBeenCalled();
    expect(api.deleteNotification).not.toHaveBeenCalled();
  });

  it('cancels backoff immediately on abort', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const api = { receiveNotification: vi.fn().mockRejectedValue(failure('network')) } as unknown as GreenApi;
    const running = startReceiving({ api, signal: controller.signal, onEvent: vi.fn(), onState: vi.fn() });
    await tick();
    controller.abort();
    await running;
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([[0, 1000], [0.999, 1250]])('keeps first jitter in range for random=%s', async (random, expectedDelay) => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(random);
    const controller = new AbortController();
    const api = {
      receiveNotification: vi.fn().mockRejectedValueOnce(failure('network'))
        .mockImplementationOnce(async () => { controller.abort(); return null; }),
    } as unknown as GreenApi;
    const running = startReceiving({ api, signal: controller.signal, onEvent: vi.fn(), onState: vi.fn() });
    await tick();
    await vi.advanceTimersByTimeAsync(expectedDelay - 1);
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await running;
    expect(api.receiveNotification).toHaveBeenCalledTimes(2);
  });

  it('pauses without DELETE if synchronous event handling fails', async () => {
    const api = {
      receiveNotification: vi.fn().mockResolvedValue(note(9)),
      deleteNotification: vi.fn(),
    } as unknown as GreenApi;
    const states = vi.fn();
    await startReceiving({ api, signal: new AbortController().signal, onEvent: () => { throw Error('failed'); }, onState: states });
    expect(api.deleteNotification).not.toHaveBeenCalled();
    expect(states).toHaveBeenLastCalledWith('paused');
  });
});
