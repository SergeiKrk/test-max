import type { ApiFailure, GreenApi, NotificationEvent } from '../api/types';

export type ReceivingState = 'working' | 'retrying' | 'paused';

type Options = {
  api: GreenApi;
  signal: AbortSignal;
  onEvent: (event: NotificationEvent) => void;
  onState: (state: ReceivingState) => void;
  processedReceiptIds?: Set<number>;
};

function retryDelay(attempt: number, error: ApiFailure): number {
  const backoff = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 251);
  return Math.max(backoff, error.retryAfterMs ?? 0);
}

function isRetryable(error: unknown): error is ApiFailure {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const failure = error as ApiFailure;
  return failure.code === 'network' || failure.code === 'timeout' ||
    (failure.code === 'http' && (failure.status === 429 || (failure.status ?? 0) >= 500));
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

export async function startReceiving({ api, signal, onEvent, onState, processedReceiptIds = new Set<number>() }: Options): Promise<void> {
  if (signal.aborted) return;
  onState('working');

  async function operation<T>(call: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    for (let attempt = 1; attempt <= 5 && !signal.aborted; attempt += 1) {
      try {
        const value = await call();
        if (signal.aborted) return { ok: false };
        onState('working');
        return { ok: true, value };
      } catch (error) {
        if (signal.aborted) return { ok: false };
        if (!isRetryable(error) || attempt === 5) {
          onState('paused');
          return { ok: false };
        }
        onState('retrying');
        await delay(retryDelay(attempt, error), signal);
      }
    }
    return { ok: false };
  }

  while (!signal.aborted) {
    const received = await operation(() => api.receiveNotification(signal));
    if (!received.ok || signal.aborted) return;
    const notification = received.value;
    if (notification === null) continue;

    if (!processedReceiptIds.has(notification.receiptId)) {
      try {
        if (!signal.aborted) onEvent(notification.event);
      } catch {
        if (!signal.aborted) onState('paused');
        return;
      }
      if (signal.aborted) return;
      processedReceiptIds.add(notification.receiptId);
    }

    const deleted = await operation(() => api.deleteNotification(notification.receiptId, signal));
    if (!deleted.ok || signal.aborted) return;
    if (!deleted.value) {
      onState('paused');
      return;
    }
  }
}
