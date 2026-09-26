import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Message } from '../model/types';
import { MessageList } from './MessageList';
import styles from './ChatPage.module.css';

const message = (localId: string, text = 'Входящее сообщение'): Message => ({
  localId,
  chatId: 'fake-chat',
  text,
  direction: 'incoming',
  sentAt: 1,
});

afterEach(cleanup);

describe('MessageList', () => {
  it('does not pull the reader down when a message arrives while scrolled up', () => {
    const first = [message('1'), message('2')];
    const { rerender } = render(<MessageList messages={first} />);
    const list = screen.getByRole('list', { name: 'Сообщения' });
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 300 },
    });
    list.scrollTop = 120;
    fireEvent.scroll(list);
    rerender(<MessageList messages={[...first, message('3')]} />);
    expect(list.scrollTop).toBe(120);
    expect(screen.getByRole('button', { name: /новые сообщения/i })).toBeInTheDocument();
  });

  it('follows an incoming message when the reader is already at the bottom', () => {
    const first = [message('1')];
    const { rerender } = render(<MessageList messages={first} />);
    const list = screen.getByRole('list', { name: 'Сообщения' });
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 900 },
      clientHeight: { configurable: true, value: 300 },
    });
    list.scrollTop = 600;
    fireEvent.scroll(list);
    rerender(<MessageList messages={[...first, message('2')]} />);
    expect(list.scrollTop).toBe(900);
    expect(screen.queryByRole('button', { name: /новые сообщения/i })).not.toBeInTheDocument();
  });

  it('renders long unbroken and multiline text without interpreting it as markup', () => {
    const longText = `${'x'.repeat(500)}\nВторая строка <b>как текст</b>`;
    const { container } = render(<MessageList messages={[message('1', longText)]} />);
    expect(container.querySelector('p')?.textContent).toBe(longText);
    expect(screen.queryByRole('bold')).not.toBeInTheDocument();
  });

  it('keeps alternating message directions and separates status from the compact bubble', () => {
    const outgoing: Message = {
      ...message('outgoing', 'Да'),
      direction: 'outgoing',
      status: 'accepted',
    };
    const longIncoming = message('long-incoming', `${'слово'.repeat(55)}\nВторая строка`);
    const { container } = render(<MessageList messages={[
      message('incoming', 'Привет'),
      outgoing,
      longIncoming,
      { ...outgoing, localId: 'outgoing-long', text: 'Ответ с несколькими словами и переносом\nна вторую строку' },
    ]} />);
    const items = screen.getAllByRole('listitem');

    expect(items).toHaveLength(4);
    expect(items[0]).toHaveClass(styles.incoming);
    expect(items[1]).toHaveClass(styles.outgoing);
    expect(items[2]).toHaveClass(styles.incoming);
    expect(items[3]).toHaveClass(styles.outgoing);
    expect(items[1].querySelector(`.${styles.messageBubble}`)).not.toContainElement(
      items[1].querySelector(`.${styles.messageStatus}`),
    );
    expect(container.querySelectorAll(`.${styles.messageBubble}`)).toHaveLength(4);
    expect(items[2].querySelector('p')?.textContent).toBe(longIncoming.text);
    expect(items[3].querySelector('p')?.textContent).toContain('\n');
    expect(items[1].querySelector(`.${styles.messageStatus}`)).toHaveTextContent('Принято API');
  });

  it('shows each message time from sentAt and keeps the outgoing status labels', () => {
    const sentAt = 1_760_000_000_000;
    const formatTime = (value: number) => new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
    const outgoing = (localId: string, status: 'pending' | 'accepted' | 'failed' | 'unknown'): Message => ({
      ...message(localId),
      direction: 'outgoing',
      sentAt,
      status,
    });

    render(<MessageList messages={[
      { ...message('incoming'), sentAt },
      outgoing('pending', 'pending'),
      outgoing('accepted', 'accepted'),
      outgoing('failed', 'failed'),
      outgoing('unknown', 'unknown'),
    ]} />);

    expect(screen.getAllByRole('time')).toHaveLength(5);
    expect(screen.getAllByRole('time')[0]).toHaveAttribute('dateTime', new Date(sentAt).toISOString());
    expect(screen.getAllByText(formatTime(sentAt))).toHaveLength(5);
    expect(screen.getByText('Отправляется')).toBeInTheDocument();
    expect(screen.getByText('Принято API')).toBeInTheDocument();
    expect(screen.getByText('Не отправлено')).toBeInTheDocument();
    expect(screen.getByText('Результат неизвестен')).toBeInTheDocument();
  });

  it('offers retry only for failed or uncertain outgoing attempts', () => {
    const outgoing = (localId: string, status: 'accepted' | 'failed' | 'unknown'): Message => ({
      ...message(localId), direction: 'outgoing', status,
    });
    render(<MessageList messages={[
      outgoing('accepted', 'accepted'), outgoing('failed', 'failed'), outgoing('unknown', 'unknown'),
    ]} onRetry={() => {}} />);
    expect(screen.getAllByRole('button', { name: 'Повторить отправку' })).toHaveLength(2);
  });
});
