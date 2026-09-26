import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowLeft, LogOut, MessageSquareText, RotateCw } from 'lucide-react';
import type { ApiFailure, NotificationEvent } from '../api/types';
import { chatReducer, initialChatState } from '../model/chatReducer';
import { normalizePhone } from '../model/phone';
import type { Message } from '../model/types';
import type { Session } from '../session/useSession';
import { useReceiving } from '../receiving/useReceiving';
import { ChatList } from './ChatList';
import { MessageComposer } from './MessageComposer';
import { MessageList } from './MessageList';
import { NewChatForm } from './NewChatForm';
import styles from './ChatPage.module.css';

type Props = { session: Session; onDisconnect: () => void };

function accountError(failure: unknown): string {
  if (typeof failure === 'object' && failure !== null && 'code' in failure) {
    const code = (failure as ApiFailure).code;
    if (code === 'access') return 'Доступ отклонён. Проверьте данные инстанса.';
    if (code === 'network') return 'Не удалось связаться с GREEN-API. Проверьте сеть и CORS.';
    if (code === 'timeout') return 'GREEN-API не ответил вовремя. Попробуйте ещё раз.';
  }
  return 'Не удалось проверить номер. Попробуйте ещё раз.';
}

export function ChatPage({ session, onDisconnect }: Props) {
  return <ChatPageSession key={session.generation} session={session} onDisconnect={onDisconnect} />;
}

function ChatPageSession({ session, onDisconnect }: Props) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const onNotification = useCallback((event: NotificationEvent) => {
    if (event.kind !== 'text') return;
    const message = event.message;
    dispatch({
      type: 'message/incoming',
      message: {
        localId: `incoming-${message.chatId}-${message.idMessage}`,
        idMessage: message.idMessage,
        chatId: message.chatId,
        text: message.text,
        direction: 'incoming',
        sentAt: message.timestamp * 1000,
      },
    });
  }, []);
  const receiving = useReceiving(session, onNotification);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingChats, setSendingChats] = useState<Set<string>>(() => new Set());
  const [mobileView, setMobileView] = useState<'list' | 'conversation'>('list');
  const mounted = useRef(false);
  const requestId = useRef(0);
  const sendLocks = useRef(new Set<string>());
  const messageSequence = useRef(0);
  const stateRef = useRef(state);
  useLayoutEffect(() => { stateRef.current = state; }, [state]);
  const chats = useMemo(() => Object.values(state.chats), [state.chats]);
  const activeChat = state.activeChatId ? state.chats[state.activeChatId] : null;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestId.current += 1; };
  }, []);

  async function createChat(input: string) {
    setError(null);
    let phone: string;
    try {
      phone = normalizePhone(input);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Проверьте номер телефона.');
      return;
    }

    const existing = chats.find((chat) => chat.phone === phone);
    if (existing) {
      dispatch({ type: 'chat/select', chatId: existing.id });
      setMobileView('conversation');
      return;
    }
    if (busy || session.signal.aborted) return;

    const currentRequest = ++requestId.current;
    setBusy(true);
    try {
      const result = await session.api.checkAccount(phone, session.signal);
      if (!mounted.current || requestId.current !== currentRequest || session.signal.aborted) return;
      if (!result.exist) {
        setError('Аккаунт для этого номера не найден. Проверьте номер и попробуйте снова.');
        return;
      }
      dispatch({ type: 'chat/open', chat: { id: result.chatId, title: phone, phone } });
      setMobileView('conversation');
    } catch (failure) {
      if (mounted.current && requestId.current === currentRequest && !session.signal.aborted) {
        setError(accountError(failure));
      }
    } finally {
      if (mounted.current && requestId.current === currentRequest) setBusy(false);
    }
  }

  async function sendText(chatId: string, text: string, clearDraft: boolean, retryMessage?: Message) {
    if (sendLocks.current.has(chatId) || session.signal.aborted || !text.trim() || text.length > 4000) return;
    sendLocks.current.add(chatId);
    setSendingChats((current) => new Set(current).add(chatId));
    const localId = `${session.generation}-${Date.now()}-${++messageSequence.current}`;
    const message: Message = retryMessage
      ? { ...retryMessage, localId, sentAt: Date.now(), status: 'pending' }
      : { localId, chatId, text, direction: 'outgoing', sentAt: Date.now(), status: 'pending' };
    dispatch({ type: 'message/outgoing', message });
    try {
      const result = await session.api.sendMessage(chatId, text, session.signal);
      if (!mounted.current || session.signal.aborted) return;
      dispatch({ type: 'message/accepted', chatId, localId, idMessage: result.idMessage });
      if (clearDraft && stateRef.current.drafts[chatId] === text) {
        dispatch({ type: 'draft/set', chatId, text: '' });
      }
    } catch (failure) {
      if (!mounted.current || session.signal.aborted) return;
      const code = typeof failure === 'object' && failure !== null && 'code' in failure
        ? (failure as ApiFailure).code : undefined;
      const status = typeof failure === 'object' && failure !== null && 'status' in failure
        ? (failure as ApiFailure).status : undefined;
      if (code === 'aborted') return;
      const uncertain = code === 'network' || code === 'timeout' || code === 'schema'
        || (code === 'http' && (status ?? 0) >= 500) || !code;
      dispatch({ type: uncertain ? 'message/unknown' : 'message/failed', chatId, localId });
    } finally {
      sendLocks.current.delete(chatId);
      if (mounted.current) {
        setSendingChats((current) => {
          const next = new Set(current);
          next.delete(chatId);
          return next;
        });
      }
    }
  }

  function retryMessage(message: Message) {
    if (message.status === 'unknown' && !window.confirm('GREEN-API мог принять сообщение. Повторная отправка может создать дубль. Отправить еще раз?')) return;
    void sendText(message.chatId, message.text, true, message);
  }

  return (
    <section className={styles.chatPage} data-mobile-view={mobileView} aria-label="Чат GREEN-API">
      <nav className={styles.serviceRail} aria-label="Основная навигация">
        <div className={styles.currentSection} aria-current="page">
          <MessageSquareText size={20} aria-hidden="true" />
          <span>Чаты</span>
        </div>
        <button type="button" className={styles.railLogout} onClick={onDisconnect} title="Выйти из сессии" aria-label="Выйти из сессии">
          <LogOut size={19} aria-hidden="true" />
          <span>Выйти</span>
        </button>
      </nav>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeading}><h1>Чаты</h1></div>
        <div className={styles.receivingStatus} role="status">
          <span>{receiving.state === 'working' ? 'Получение активно' : receiving.state === 'retrying' ? 'Повтор подключения' : 'Получение остановлено'}</span>
          {receiving.state === 'paused' && (
            <button type="button" onClick={receiving.resume} title="Возобновить получение" aria-label="Возобновить получение">
              <RotateCw size={16} />
            </button>
          )}
        </div>
        <NewChatForm busy={busy} error={error} onCreate={createChat} />
        <ChatList chats={chats} activeChatId={state.activeChatId} onSelect={(chatId) => {
          dispatch({ type: 'chat/select', chatId });
          setMobileView('conversation');
        }} />
      </aside>
      <main className={styles.conversation}>
        {activeChat ? (
          <>
            <header className={styles.conversationHeader}>
              <button type="button" className={styles.mobileBack} onClick={() => setMobileView('list')} title="К списку чатов" aria-label="К списку чатов">
                <ArrowLeft size={20} />
              </button>
              <span className={styles.conversationAvatar} aria-hidden="true"><MessageSquareText size={18} /></span>
              <strong>{activeChat.title}</strong><span>MAX</span>
            </header>
            <MessageList key={activeChat.id} messages={state.messages[activeChat.id] ?? []} onRetry={retryMessage} />
            <MessageComposer
              value={state.drafts[activeChat.id] ?? ''}
              disabled={sendingChats.has(activeChat.id)}
              onChange={(text) => dispatch({ type: 'draft/set', chatId: activeChat.id, text })}
              onSend={() => void sendText(activeChat.id, stateRef.current.drafts[activeChat.id] ?? '', true)}
            />
          </>
        ) : (
          <div className={styles.noChat}><MessageSquareText size={34} /><p>Выберите чат или создайте новый</p></div>
        )}
      </main>
    </section>
  );
}
