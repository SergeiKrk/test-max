import type { Chat } from '../model/types';
import styles from './ChatPage.module.css';

type Props = { chats: Chat[]; activeChatId: string | null; onSelect: (chatId: string) => void };

export function ChatList({ chats, activeChatId, onSelect }: Props) {
  if (chats.length === 0) return <p className={styles.emptyList}>Чаты появятся здесь</p>;
  return (
    <nav className={styles.chatList} aria-label="Список чатов">
      {chats.map((chat) => (
        <button
          key={chat.id}
          type="button"
          className={`${styles.chatItem} ${activeChatId === chat.id ? styles.activeChat : ''}`}
          aria-current={activeChatId === chat.id ? 'page' : undefined}
          onClick={() => onSelect(chat.id)}
        >
          <span className={styles.chatAvatar} aria-hidden="true">{chat.title.trim().charAt(0).toLocaleUpperCase('ru-RU') || '?'}</span>
          <span className={styles.chatIdentity}>
            <strong>{chat.phone && chat.title === chat.phone ? 'Контакт' : chat.title}</strong>
            {chat.phone && <small>{chat.phone}</small>}
          </span>
        </button>
      ))}
    </nav>
  );
}
