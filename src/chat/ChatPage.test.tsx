import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GreenApi, Notification } from '../api/types';
import type { Session } from '../session/useSession';
import { ChatPage } from './ChatPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function makeSession(checkAccount: GreenApi['checkAccount'], sendMessage: GreenApi['sendMessage'] = vi.fn()): Session {
  return {
    generation: 1,
    api: {
      checkAccount,
      sendMessage,
      getStateInstance: vi.fn(),
      deleteNotification: vi.fn(),
      receiveNotification: vi.fn((signal: AbortSignal) => new Promise<Notification | null>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject({ code: 'aborted', operation: 'receiveNotification' }), { once: true });
      })),
    } as GreenApi,
    signal: new AbortController().signal,
  };
}

describe('ChatPage', () => {
  it('shows only the current chat section and the existing session exit in the service rail', () => {
    const onDisconnect = vi.fn();
    render(<ChatPage session={makeSession(vi.fn())} onDisconnect={onDisconnect} />);

    const rail = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(rail).toHaveTextContent('Чаты');
    expect(rail).not.toHaveTextContent(/Контакты|Звонки|Каналы|Настройки/);
    fireEvent.click(screen.getByRole('button', { name: 'Выйти из сессии' }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('normalizes the number, checks once, and reopens the existing chat without another request', async () => {
    const checkAccount = vi.fn().mockResolvedValue({ exist: true, chatId: 'canonical-id' });
    render(<ChatPage session={makeSession(checkAccount)} onDisconnect={() => {}} />);
    const input = screen.getByLabelText('Номер телефона');
    fireEvent.change(input, { target: { value: '+7 (999) 123-45-67' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    await screen.findByText('Контакт');
    expect(screen.getByText('79991234567', { selector: 'small' })).toBeInTheDocument();
    expect(checkAccount).toHaveBeenCalledTimes(1);
    expect(checkAccount).toHaveBeenCalledWith('79991234567', expect.any(AbortSignal));
    fireEvent.change(input, { target: { value: '7 999 123 45 67' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /79991234567/ })).toHaveLength(1));
    expect(checkAccount).toHaveBeenCalledTimes(1);
  });

  it('switches into a selected conversation and exposes a mobile back action', async () => {
    const checkAccount = vi.fn().mockResolvedValue({ exist: true, chatId: 'fake-chat' });
    render(<ChatPage session={makeSession(checkAccount)} onDisconnect={() => {}} />);
    fireEvent.change(screen.getByLabelText('Номер телефона'), { target: { value: '79991234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    const page = screen.getByRole('region', { name: 'Чат GREEN-API' });
    await screen.findByLabelText('Сообщение');
    expect(page).toHaveAttribute('data-mobile-view', 'conversation');
    fireEvent.click(screen.getByRole('button', { name: 'К списку чатов' }));
    expect(page).toHaveAttribute('data-mobile-view', 'list');
  });

  it('does not create a chat when CheckAccount says the account does not exist', async () => {
    const checkAccount = vi.fn().mockResolvedValue({ exist: false });
    render(<ChatPage session={makeSession(checkAccount)} onDisconnect={() => {}} />);
    fireEvent.change(screen.getByLabelText('Номер телефона'), { target: { value: '79991234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/не найден|не существует/i);
    expect(screen.queryByRole('button', { name: /79991234567/ })).not.toBeInTheDocument();
  });

  it('keeps one chat when distinct phone inputs resolve to the same canonical chat id', async () => {
    const checkAccount = vi.fn().mockResolvedValue({ exist: true, chatId: 'canonical-id' });
    render(<ChatPage session={makeSession(checkAccount)} onDisconnect={() => {}} />);
    const input = screen.getByLabelText('Номер телефона');
    fireEvent.change(input, { target: { value: '79991234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    await screen.findByRole('button', { name: /79991234567/ });
    fireEvent.change(input, { target: { value: '79991234568' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /79991234567/ })).toHaveLength(1));
    expect(checkAccount).toHaveBeenCalledTimes(2);
  });

  it('discards pending work and chat state when the session generation changes', async () => {
    let resolveCheck!: (value: { exist: true; chatId: string }) => void;
    const checkAccount = vi.fn(() => new Promise<{ exist: true; chatId: string }>((resolve) => { resolveCheck = resolve; }));
    const { rerender } = render(<ChatPage session={makeSession(checkAccount)} onDisconnect={() => {}} />);
    fireEvent.change(screen.getByLabelText('Номер телефона'), { target: { value: '79991234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    rerender(<ChatPage session={{ ...makeSession(vi.fn()), generation: 2 }} onDisconnect={() => {}} />);
    resolveCheck({ exist: true, chatId: 'late-chat' });
    await waitFor(() => expect(screen.getByText('Чаты появятся здесь')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /79991234567/ })).not.toBeInTheDocument();
  });

  it('ignores a CheckAccount response that resolves after the page is left', async () => {
    let resolveCheck!: (value: { exist: true; chatId: string }) => void;
    const checkAccount = vi.fn(() => new Promise<{ exist: true; chatId: string }>((resolve) => { resolveCheck = resolve; }));
    const { unmount } = render(<ChatPage session={makeSession(checkAccount)} onDisconnect={() => {}} />);
    fireEvent.change(screen.getByLabelText('Номер телефона'), { target: { value: '79991234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    unmount();
    resolveCheck({ exist: true, chatId: 'late-chat' });
    await waitFor(() => expect(checkAccount).toHaveBeenCalledTimes(1));
  });

  it('submits only once while pending and keeps the request attached to its original chat', async () => {
    let resolveSend!: (value: { idMessage: string }) => void;
    const sendMessage = vi.fn(() => new Promise<{ idMessage: string }>((resolve) => { resolveSend = resolve; }));
    const checkAccount = vi.fn().mockResolvedValue({ exist: true, chatId: 'chat-a' });
    render(<ChatPage session={makeSession(checkAccount, sendMessage)} onDisconnect={() => {}} />);
    const phone = screen.getByLabelText('Номер телефона');
    fireEvent.change(phone, { target: { value: '79991234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    const composer = await screen.findByLabelText('Сообщение');
    fireEvent.change(composer, { target: { value: 'Тест' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('chat-a', 'Тест', expect.any(AbortSignal));
    expect(screen.getAllByText('Тест')).toHaveLength(2);
    expect(screen.getByText(/отправляется/i)).toBeInTheDocument();
    resolveSend({ idMessage: 'sent-a' });
    await waitFor(() => expect(screen.getByText(/принято api/i)).toBeInTheDocument());
  });

  it('preserves a changed draft during send and marks network errors as unknown without retrying', async () => {
    let rejectSend!: (reason: unknown) => void;
    const sendMessage = vi.fn(() => new Promise<{ idMessage: string }>((_resolve, reject) => { rejectSend = reject; }));
    const checkAccount = vi.fn().mockResolvedValue({ exist: true, chatId: 'chat-a' });
    render(<ChatPage session={makeSession(checkAccount, sendMessage)} onDisconnect={() => {}} />);
    fireEvent.change(screen.getByLabelText('Номер телефона'), { target: { value: '79991234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    const composer = await screen.findByLabelText('Сообщение');
    fireEvent.change(composer, { target: { value: 'Исходный текст' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    fireEvent.change(composer, { target: { value: 'Новый черновик' } });
    rejectSend({ code: 'network', operation: 'sendMessage' });
    await waitFor(() => expect(screen.getByText(/результат неизвестен/i)).toBeInTheDocument());
    expect(screen.getByLabelText('Сообщение')).toHaveValue('Новый черновик');
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Исходный текст')).toBeInTheDocument();
  });

  it('clears only the sent snapshot after success and preserves a newer draft', async () => {
    let resolveSend!: (value: { idMessage: string }) => void;
    const sendMessage = vi.fn(() => new Promise<{ idMessage: string }>((resolve) => { resolveSend = resolve; }));
    const checkAccount = vi.fn().mockResolvedValue({ exist: true, chatId: 'chat-a' });
    render(<ChatPage session={makeSession(checkAccount, sendMessage)} onDisconnect={() => {}} />);
    fireEvent.change(screen.getByLabelText('Номер телефона'), { target: { value: '79991234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    const composer = await screen.findByLabelText('Сообщение');
    fireEvent.change(composer, { target: { value: 'Отправляемый текст' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    fireEvent.change(composer, { target: { value: 'Новый черновик' } });
    resolveSend({ idMessage: 'sent-a' });
    await waitFor(() => expect(screen.getByText(/принято api/i)).toBeInTheDocument());
    expect(screen.getByLabelText('Сообщение')).toHaveValue('Новый черновик');
  });

  it('marks an explicit API rejection as failed', async () => {
    const sendMessage = vi.fn().mockRejectedValue({ code: 'api', operation: 'sendMessage' });
    const checkAccount = vi.fn().mockResolvedValue({ exist: true, chatId: 'chat-a' });
    render(<ChatPage session={makeSession(checkAccount, sendMessage)} onDisconnect={() => {}} />);
    fireEvent.change(screen.getByLabelText('Номер телефона'), { target: { value: '79991234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    const composer = await screen.findByLabelText('Сообщение');
    fireEvent.change(composer, { target: { value: 'Тестовый текст' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(await screen.findByText('Не отправлено')).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('retries an unknown result only after explicit confirmation', async () => {
    const sendMessage = vi.fn()
      .mockRejectedValueOnce({ code: 'network', operation: 'sendMessage' })
      .mockResolvedValueOnce({ idMessage: 'retry-id' });
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal('confirm', confirm);
    const checkAccount = vi.fn().mockResolvedValue({ exist: true, chatId: 'chat-a' });
    render(<ChatPage session={makeSession(checkAccount, sendMessage)} onDisconnect={() => {}} />);
    fireEvent.change(screen.getByLabelText('Номер телефона'), { target: { value: '79991234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    const composer = await screen.findByLabelText('Сообщение');
    fireEvent.change(composer, { target: { value: 'Тестовый текст' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    const retry = await screen.findByRole('button', { name: 'Повторить отправку' });
    expect(await screen.findByText('Результат неизвестен')).toBeInTheDocument();
    fireEvent.click(retry);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/дубль/i));
    confirm.mockReturnValue(true);
    fireEvent.click(retry);
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Принято API')).toBeInTheDocument());
  });

  it('updates only the originating chat if selection changes before send resolves', async () => {
    let resolveSend!: (value: { idMessage: string }) => void;
    const sendMessage = vi.fn(() => new Promise<{ idMessage: string }>((resolve) => { resolveSend = resolve; }));
    const checkAccount = vi.fn()
      .mockResolvedValueOnce({ exist: true, chatId: 'chat-a' })
      .mockResolvedValueOnce({ exist: true, chatId: 'chat-b' });
    render(<ChatPage session={makeSession(checkAccount, sendMessage)} onDisconnect={() => {}} />);
    const phone = screen.getByLabelText('Номер телефона');
    fireEvent.change(phone, { target: { value: '79991234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    const composer = await screen.findByLabelText('Сообщение');
    fireEvent.change(composer, { target: { value: 'Для A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    fireEvent.change(phone, { target: { value: '79991234568' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать чат' }));
    await screen.findByRole('button', { name: /79991234568/ });
    resolveSend({ idMessage: 'sent-a' });
    fireEvent.click(screen.getByRole('button', { name: /79991234567/ }));
    await waitFor(() => expect(screen.getByText(/принято api/i)).toBeInTheDocument());
    expect(screen.getByText('Для A')).toBeInTheDocument();
  });
});
