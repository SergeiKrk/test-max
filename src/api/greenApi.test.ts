import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGreenApi } from './greenApi';

const credentials = {
  idInstance: '3100000000',
  apiTokenInstance: 'FAKE_SECRET_MARKER',
};
const signal = new AbortController().signal;

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function mockFetch(response: Response | Promise<Response>) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('GreenApi', () => {
  it('uses the fixed origin and safe request options for state', async () => {
    const fetchMock = mockFetch(json({ stateInstance: 'authorized', extra: 1 }));
    await expect(createGreenApi(credentials).getStateInstance(signal)).resolves.toBe('authorized');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://3100.api.green-api.com/waInstance3100000000/getStateInstance/FAKE_SECRET_MARKER',
      expect.objectContaining({ method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store' }),
    );
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  });

  it('returns a non-authorized state without treating it as a schema failure', async () => {
    mockFetch(json({ stateInstance: 'notAuthorized' }));
    await expect(createGreenApi(credentials).getStateInstance(signal)).resolves.toBe('notAuthorized');
  });

  it('sends a validated numeric phone and accepts an existing account', async () => {
    const fetchMock = mockFetch(json({ exist: true, chatId: '10000000', extra: true }));
    await expect(createGreenApi(credentials).checkAccount('79991234567', signal)).resolves.toEqual({
      exist: true,
      chatId: '10000000',
    });
    expect(fetchMock.mock.calls[0][0]).toContain('/checkAccount/');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ phoneNumber: 79991234567 }),
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('returns exist false, but rejects provider status false', async () => {
    mockFetch(json({ exist: false }));
    await expect(createGreenApi(credentials).checkAccount('79991234567', signal)).resolves.toEqual({ exist: false });
    mockFetch(json({ status: false, message: 'not registered' }));
    await expect(createGreenApi(credentials).checkAccount('79991234567', signal)).rejects.toMatchObject({ code: 'api' });
  });

  it('sends text and requires a nonempty idMessage', async () => {
    const fetchMock = mockFetch(json({ idMessage: 'message-1' }));
    await expect(createGreenApi(credentials).sendMessage('10000000', ' Привет\n', signal)).resolves.toEqual({ idMessage: 'message-1' });
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ chatId: '10000000', message: ' Привет\n' }));
    mockFetch(json({ idMessage: '' }));
    await expect(createGreenApi(credentials).sendMessage('10000000', 'Привет', signal)).rejects.toMatchObject({ code: 'schema' });
  });

  it('accepts an empty queue response', async () => {
    mockFetch(json(null));
    await expect(createGreenApi(credentials).receiveNotification(signal)).resolves.toBeNull();
  });

  it('normalizes incoming text and preserves string identifiers', async () => {
    const fetchMock = mockFetch(json({
      receiptId: 42,
      body: {
        typeWebhook: 'incomingMessageReceived',
        instanceData: { idInstance: 3100000000 },
        idMessage: '00123',
        timestamp: 1760000000,
        senderData: { chatId: '00010000000', chatType: 'user' },
        messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет' } },
      },
    }));
    await expect(createGreenApi(credentials).receiveNotification(signal)).resolves.toEqual({
      receiptId: 42,
      event: { kind: 'text', message: { chatId: '00010000000', idMessage: '00123', text: 'Привет', timestamp: 1760000000 } },
    });
    expect(fetchMock.mock.calls[0][0]).toContain('/receiveNotification/FAKE_SECRET_MARKER?receiveTimeout=25');
  });

  it('reads extended text and skips known non-text events', async () => {
    const body = {
      typeWebhook: 'incomingMessageReceived',
      instanceData: { idInstance: '3100000000' },
      idMessage: 'm1', timestamp: 1760000000,
      senderData: { chatId: '10000000', chatType: 'user' },
      messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: 'https://example.test' } },
    };
    mockFetch(json({ receiptId: 1, body }));
    await expect(createGreenApi(credentials).receiveNotification(signal)).resolves.toMatchObject({
      event: { kind: 'text', message: { text: 'https://example.test' } },
    });
    mockFetch(json({ receiptId: 2, body: { ...body, messageData: { typeMessage: 'imageMessage' } } }));
    await expect(createGreenApi(credentials).receiveNotification(signal)).resolves.toEqual({
      receiptId: 2, event: { kind: 'skip', typeWebhook: 'incomingMessageReceived' },
    });
  });

  it('reads the main text of a quoted message', async () => {
    mockFetch(json({
      receiptId: 3,
      body: {
        typeWebhook: 'incomingMessageReceived',
        instanceData: { idInstance: 3100000000 },
        idMessage: 'm3', timestamp: 1760000000,
        senderData: { chatId: '10000000', chatType: 'user' },
        messageData: { typeMessage: 'quotedMessage', extendedTextMessageData: { text: 'Ответ', stanzaId: 'm1' } },
      },
    }));
    await expect(createGreenApi(credentials).receiveNotification(signal)).resolves.toMatchObject({
      event: { kind: 'text', message: { text: 'Ответ' } },
    });
  });

  it('rejects a journal array, mismatched instance and unknown webhook', async () => {
    const api = createGreenApi(credentials);
    mockFetch(json([{ type: 'incoming', chatId: '10000001' }]));
    await expect(api.receiveNotification(signal)).rejects.toMatchObject({ code: 'schema' });
    mockFetch(json({ receiptId: 1, body: { typeWebhook: 'stateInstanceChanged', instanceData: { idInstance: 42 } } }));
    await expect(api.receiveNotification(signal)).rejects.toMatchObject({ code: 'schema' });
    mockFetch(json({ receiptId: 1, body: { typeWebhook: 'futureEvent', instanceData: { idInstance: 3100000000 } } }));
    await expect(api.receiveNotification(signal)).rejects.toMatchObject({ code: 'schema' });
  });

  it('confirms only result true on DELETE', async () => {
    const fetchMock = mockFetch(json({ result: true }));
    await expect(createGreenApi(credentials).deleteNotification(42, signal)).resolves.toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain('/deleteNotification/FAKE_SECRET_MARKER/42');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
    mockFetch(json({ result: false }));
    await expect(createGreenApi(credentials).deleteNotification(42, signal)).resolves.toBe(false);
  });

  it.each([401, 403])('classifies HTTP %i as access without leaking secrets', async (status) => {
    mockFetch(json({ detail: credentials.apiTokenInstance }, status));
    const error = await createGreenApi(credentials).getStateInstance(signal).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: 'access', operation: 'getStateInstance', status });
    expect(JSON.stringify(error)).not.toContain(credentials.apiTokenInstance);
  });

  it('preserves Retry-After for HTTP 429', async () => {
    mockFetch(json({}, 429, { 'Retry-After': '3' }));
    await expect(createGreenApi(credentials).getStateInstance(signal)).rejects.toMatchObject({
      code: 'http', status: 429, retryAfterMs: 3000,
    });
  });

  it('classifies network and malformed JSON safely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(credentials.apiTokenInstance)));
    const api = createGreenApi(credentials);
    const networkError = await api.getStateInstance(signal).catch((failure: unknown) => failure);
    expect(networkError).toMatchObject({ code: 'network' });
    expect(JSON.stringify(networkError)).not.toContain(credentials.apiTokenInstance);
    mockFetch(new Response('{broken', { status: 200 }));
    await expect(api.getStateInstance(signal)).rejects.toMatchObject({ code: 'schema' });
  });

  it('times out an unresolved request', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));
    const pending = createGreenApi(credentials).getStateInstance(signal);
    const result = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(15_001);
    await result;
  });
});
