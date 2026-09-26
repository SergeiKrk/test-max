import { describe, expect, it } from 'vitest';
import { chatReducer, initialChatState } from './chatReducer';
import type { Message } from './types';

const incoming = (chatId: string, idMessage: string): Message => ({
  localId: `${chatId}-${idMessage}`,
  idMessage,
  chatId,
  text: 'Ответ',
  direction: 'incoming',
  sentAt: 1_760_000_000_000,
});

describe('chatReducer', () => {
  it('keeps drafts independent when switching between chats', () => {
    const a = chatReducer(initialChatState, { type: 'chat/open', chat: { id: 'a', title: 'A' } });
    const b = chatReducer(a, { type: 'draft/set', chatId: 'a', text: 'draft A' });
    const c = chatReducer(b, { type: 'chat/open', chat: { id: 'b', title: 'B' } });
    const d = chatReducer(c, { type: 'draft/set', chatId: 'b', text: 'draft B' });
    const e = chatReducer(d, { type: 'chat/select', chatId: 'a' });
    expect(e.drafts).toEqual({ a: 'draft A', b: 'draft B' });
    expect(e.activeChatId).toBe('a');
  });

  it('deduplicates an incoming event per chat and message id only', () => {
    const first = chatReducer(initialChatState, { type: 'message/incoming', message: incoming('a', 'same') });
    const duplicate = chatReducer(first, { type: 'message/incoming', message: incoming('a', 'same') });
    const otherChat = chatReducer(duplicate, { type: 'message/incoming', message: incoming('b', 'same') });
    expect(otherChat.messages.a).toHaveLength(1);
    expect(otherChat.messages.b).toHaveLength(1);
    expect(otherChat.activeChatId).toBeNull();
  });

  it('opens existing ids without duplicate chats and resets all session data', () => {
    const a = chatReducer(initialChatState, { type: 'chat/open', chat: { id: 'canonical', title: 'First' } });
    const b = chatReducer(a, { type: 'chat/open', chat: { id: 'canonical', title: 'Updated' } });
    expect(Object.keys(b.chats)).toEqual(['canonical']);
    expect(b.activeChatId).toBe('canonical');
    expect(chatReducer(b, { type: 'session/reset' })).toEqual(initialChatState);
  });

  it('enriches an incoming placeholder with a checked phone without losing messages', () => {
    const received = chatReducer(initialChatState, { type: 'message/incoming', message: incoming('canonical', 'one') });
    const opened = chatReducer(received, {
      type: 'chat/open', chat: { id: 'canonical', title: '79991234567', phone: '79991234567' },
    });
    expect(opened.chats.canonical).toEqual({ id: 'canonical', title: '79991234567', phone: '79991234567' });
    expect(opened.messages.canonical).toEqual([incoming('canonical', 'one')]);
  });
});
