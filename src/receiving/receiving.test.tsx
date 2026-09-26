import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GreenApi, Notification } from '../api/types';
import { ChatPage } from '../chat/ChatPage';
import type { Session } from '../session/useSession';

const note = (receiptId: number, chatId: string, idMessage = 'one'): Notification => ({
  receiptId, event: { kind: 'text', message: { chatId, idMessage, text: 'Входящий ответ', timestamp: 123 } },
});

function controlledApi() {
  const pending: Array<{ resolve: (value: Notification | null) => void; signal: AbortSignal }> = [];
  const api = {
    checkAccount: vi.fn().mockResolvedValueOnce({ exist: true, chatId: 'chat-a' })
      .mockResolvedValueOnce({ exist: true, chatId: 'chat-b' }),
    sendMessage: vi.fn().mockResolvedValue({ idMessage: 'sent' }),
    receiveNotification: vi.fn((signal: AbortSignal) => new Promise<Notification | null>((resolve) => {
      pending.push({ resolve, signal });
    })),
    deleteNotification: vi.fn().mockResolvedValue(true),
  } as unknown as GreenApi;
  return { api, pending };
}

function session(api: GreenApi, generation = 1): Session {
  return { api, generation, signal: new AbortController().signal };
}

async function openChat(phone: string) {
  fireEvent.change(screen.getByLabelText('Номер телефона'), { target: { value: phone } });
  fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
  await screen.findByRole('button', { name: new RegExp(phone) });
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('receiving in ChatPage', () => {
  it('routes an incoming event to an inactive canonical chat and deduplicates another receipt', async () => {
    const { api, pending } = controlledApi();
    render(<ChatPage session={session(api)} onDisconnect={() => {}} />);
    await openChat('79991234567');
    await openChat('79991234568');
    expect(screen.getByRole('main')).toHaveTextContent('79991234568');
    await act(async () => { pending[0].resolve(note(1, 'chat-a')); });
    await waitFor(() => expect(api.deleteNotification).toHaveBeenCalledWith(1, expect.any(AbortSignal)));
    expect(screen.queryByText('Входящий ответ')).not.toBeInTheDocument();
    await act(async () => { pending[1].resolve(note(2, 'chat-a')); });
    await waitFor(() => expect(api.deleteNotification).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: /79991234567/ }));
    expect(screen.getAllByText('Входящий ответ')).toHaveLength(1);
    expect(api.receiveNotification).toHaveBeenCalledTimes(3);
  });

  it('keeps only one live receive under StrictMode and on chat selection', async () => {
    const { api, pending } = controlledApi();
    const { unmount } = render(<StrictMode><ChatPage session={session(api)} onDisconnect={() => {}} /></StrictMode>);
    await waitFor(() => expect(api.receiveNotification).toHaveBeenCalledTimes(2));
    expect(pending[0].signal.aborted).toBe(true);
    expect(pending[1].signal.aborted).toBe(false);
    await openChat('79991234567');
    expect(api.receiveNotification).toHaveBeenCalledTimes(2);
    unmount();
    expect(pending[1].signal.aborted).toBe(true);
    await act(async () => { pending[1].resolve(note(3, 'chat-a')); });
    expect(api.deleteNotification).not.toHaveBeenCalled();
  });

  it('aborts old generation and ignores a late event after switching sessions', async () => {
    const old = controlledApi();
    const next = controlledApi();
    const { rerender } = render(<ChatPage session={session(old.api)} onDisconnect={() => {}} />);
    rerender(<ChatPage session={session(next.api, 2)} onDisconnect={() => {}} />);
    expect(old.pending[0].signal.aborted).toBe(true);
    await act(async () => { old.pending[0].resolve(note(8, 'old-chat')); });
    expect(old.api.deleteNotification).not.toHaveBeenCalled();
    expect(screen.getByText('Чаты появятся здесь')).toBeInTheDocument();
    expect(next.pending[0].signal.aborted).toBe(false);
  });

  it('pauses on DELETE false and starts one new receive after manual resume', async () => {
    const { api, pending } = controlledApi();
    vi.mocked(api.deleteNotification).mockResolvedValueOnce(false);
    render(<ChatPage session={session(api)} onDisconnect={() => {}} />);
    await act(async () => { pending[0].resolve(note(4, 'unknown-chat')); });
    expect(await screen.findByText('Получение остановлено')).toBeInTheDocument();
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Возобновить получение' }));
    await waitFor(() => expect(api.receiveNotification).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: /Чат unknown-chat/ }));
    expect(screen.getAllByText('Входящий ответ')).toHaveLength(1);
  });
});
