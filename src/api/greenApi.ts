import { parseAccount, parseDeleted, parseNotification, parseSent, parseState } from './schemas';
import type { ApiFailure, Credentials, GreenApi } from './types';

const ORIGIN = 'https://3100.api.green-api.com';

function failure(code: ApiFailure['code'], operation: string, status?: number, retryAfterMs?: number): ApiFailure {
  return {
    code,
    operation,
    ...(status === undefined ? {} : { status }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('Retry-After');
  if (value === null) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function checkedPhone(phone: string): number {
  if (!/^(?:7\d{10}|375\d{9})$/.test(phone)) {
    throw failure('schema', 'checkAccount');
  }
  const numeric = Number(phone);
  if (!Number.isSafeInteger(numeric)) throw failure('schema', 'checkAccount');
  return numeric;
}

export function createGreenApi(credentials: Credentials): GreenApi {
  const { idInstance, apiTokenInstance } = credentials;
  if (!/^\d+$/.test(idInstance) || !apiTokenInstance) {
    throw failure('schema', 'credentials');
  }

  async function request(
    operation: string,
    method: 'GET' | 'POST' | 'DELETE',
    signal: AbortSignal,
    options: { suffix?: string; query?: string; body?: Record<string, unknown>; timeoutMs?: number } = {},
  ): Promise<unknown> {
    if (signal.aborted) throw failure('aborted', operation);
    const path = `/waInstance${encodeURIComponent(idInstance)}/${operation}/${encodeURIComponent(apiTokenInstance)}${options.suffix ?? ''}`;
    const url = `${ORIGIN}${path}${options.query ?? ''}`;
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? 15_000);
    try {
      const init: RequestInit = {
        method, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
      };
      if (options.body !== undefined) {
        init.headers = { 'Content-Type': 'application/json' };
        init.body = JSON.stringify(options.body);
      }
      const response = await fetch(url, init);
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403 ? 'access' : 'http';
        throw failure(code, operation, response.status, response.status === 429 ? retryAfter(response) : undefined);
      }
      try {
        return await response.json() as unknown;
      } catch {
        throw failure('schema', operation);
      }
    } catch (error) {
      if (signal.aborted) throw failure('aborted', operation);
      if (timedOut) throw failure('timeout', operation);
      if (typeof error === 'object' && error !== null && 'code' in error) throw error;
      throw failure('network', operation);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    }
  }

  return {
    async getStateInstance(signal) {
      return parseState(await request('getStateInstance', 'GET', signal));
    },
    async checkAccount(phone, signal) {
      const phoneNumber = checkedPhone(phone);
      return parseAccount(await request('checkAccount', 'POST', signal, { body: { phoneNumber } }));
    },
    async sendMessage(chatId, text, signal) {
      if (!chatId || !text.trim()) throw failure('schema', 'sendMessage');
      return parseSent(await request('sendMessage', 'POST', signal, { body: { chatId, message: text } }));
    },
    async receiveNotification(signal) {
      return parseNotification(await request('receiveNotification', 'GET', signal, {
        query: '?receiveTimeout=25', timeoutMs: 35_000,
      }), idInstance);
    },
    async deleteNotification(receiptId, signal) {
      if (!Number.isSafeInteger(receiptId) || receiptId < 0) throw failure('schema', 'deleteNotification');
      return parseDeleted(await request('deleteNotification', 'DELETE', signal, { suffix: `/${receiptId}` }));
    },
  };
}
