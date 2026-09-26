import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GreenApi } from '../api/types';
import { useSession } from './useSession';

const mocked = vi.hoisted(() => ({ createGreenApi: vi.fn() }));
vi.mock('../api/greenApi', () => ({ createGreenApi: mocked.createGreenApi }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function apiWithState(promise: Promise<string>): GreenApi {
  return {
    getStateInstance: vi.fn(() => promise),
    checkAccount: vi.fn(),
    sendMessage: vi.fn(),
    receiveNotification: vi.fn(),
    deleteNotification: vi.fn(),
  };
}

const a = { idInstance: '3100000000', apiTokenInstance: 'fake-A' };
const b = { idInstance: '3100000001', apiTokenInstance: 'fake-B' };

beforeEach(() => mocked.createGreenApi.mockReset());

describe('useSession', () => {
  it('ignores a late authorized response after disconnect', async () => {
    const state = deferred<string>();
    const api = apiWithState(state.promise);
    mocked.createGreenApi.mockReturnValue(api);
    const { result } = renderHook(() => useSession());
    let pending!: Promise<void>;
    act(() => { pending = result.current.connect(a); });
    expect(result.current.connectionState).toBe('connecting');
    const requestSignal = vi.mocked(api.getStateInstance).mock.calls[0][0];
    act(() => result.current.disconnect());
    expect(requestSignal.aborted).toBe(true);
    await act(async () => { state.resolve('authorized'); await pending; });
    expect(result.current.connectionState).toBe('disconnected');
    expect(result.current.session).toBeNull();
  });

  it('keeps B when A resolves late', async () => {
    const stateA = deferred<string>();
    const stateB = deferred<string>();
    const apiA = apiWithState(stateA.promise);
    const apiB = apiWithState(stateB.promise);
    mocked.createGreenApi.mockReturnValueOnce(apiA).mockReturnValueOnce(apiB);
    const { result } = renderHook(() => useSession());
    let pendingA!: Promise<void>;
    let pendingB!: Promise<void>;
    act(() => { pendingA = result.current.connect(a); });
    act(() => { pendingB = result.current.connect(b); });
    expect(vi.mocked(apiA.getStateInstance).mock.calls[0][0].aborted).toBe(true);
    await act(async () => { stateB.resolve('authorized'); await pendingB; });
    expect(result.current.session?.api).toBe(apiB);
    const generationB = result.current.session?.generation;
    await act(async () => { stateA.resolve('authorized'); await pendingA; });
    expect(result.current.session?.api).toBe(apiB);
    expect(result.current.session?.generation).toBe(generationB);
  });

  it('shows an unauthorized state without a session', async () => {
    mocked.createGreenApi.mockReturnValue(apiWithState(Promise.resolve('notAuthorized')));
    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.connect(a); });
    await waitFor(() => expect(result.current.connectionState).toBe('error'));
    expect(result.current.session).toBeNull();
    expect(result.current.error).toMatch(/авторизован/i);
  });
});
