import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, RotateCw } from 'lucide-react';
import type { Message } from '../model/types';
import styles from './ChatPage.module.css';

type Props = { messages: Message[]; onRetry?: (message: Message) => void };

const statusText = {
  pending: 'Отправляется',
  accepted: 'Принято API',
  failed: 'Не отправлено',
  unknown: 'Результат неизвестен',
} as const;
const messageTimeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

export function MessageList({ messages, onRetry }: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const followsTail = useRef(true);
  const previousCount = useRef(messages.length);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const hasNewItems = messages.length > previousCount.current;
    previousCount.current = messages.length;
    if (followsTail.current) {
      list.scrollTop = list.scrollHeight;
      setHasNewMessages(false);
    } else if (hasNewItems) {
      setHasNewMessages(true);
    }
  }, [messages]);

  if (messages.length === 0) {
    return <div className={styles.messageRegion}><div className={styles.messageEmpty}>Сообщений пока нет</div></div>;
  }

  return (
    <div className={styles.messageRegion}>
      <ol
        ref={listRef}
        className={styles.messageList}
        aria-label="Сообщения"
        onScroll={(event) => {
          const element = event.currentTarget;
          followsTail.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
          if (followsTail.current) setHasNewMessages(false);
        }}
      >
        {messages.map((message) => (
          <li key={message.localId} className={message.direction === 'outgoing' ? styles.outgoing : styles.incoming}>
            <div className={styles.messageBubble}>
              <p>{message.text}</p>
              <div className={styles.messageMeta}>
                <time dateTime={new Date(message.sentAt).toISOString()}>
                  {messageTimeFormatter.format(message.sentAt)}
                </time>
              </div>
            </div>
            {message.status && (
              <div className={styles.messageStatus}>
                <span>{statusText[message.status]}</span>
                {(message.status === 'failed' || message.status === 'unknown') && message.direction === 'outgoing' && onRetry && (
                  <button type="button" title="Повторить отправку" aria-label="Повторить отправку" onClick={() => onRetry(message)}>
                    <RotateCw size={14} />
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      {hasNewMessages && (
        <button
          type="button"
          className={styles.jumpToLatest}
          onClick={() => {
            const list = listRef.current;
            if (list) list.scrollTop = list.scrollHeight;
            followsTail.current = true;
            setHasNewMessages(false);
          }}
        >
          <ArrowDown size={15} /> Новые сообщения
        </button>
      )}
    </div>
  );
}
