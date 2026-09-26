import type { Chat, ChatState, Message } from './types';

export const initialChatState: ChatState = {
  chats: {},
  messages: {},
  drafts: {},
  activeChatId: null,
};

export type ChatAction =
  | { type: 'chat/open'; chat: Chat }
  | { type: 'chat/select'; chatId: string }
  | { type: 'draft/set'; chatId: string; text: string }
  | { type: 'message/outgoing'; message: Message }
  | { type: 'message/accepted'; chatId: string; localId: string; idMessage: string }
  | { type: 'message/failed' | 'message/unknown'; chatId: string; localId: string }
  | { type: 'message/incoming'; message: Message }
  | { type: 'session/reset' };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'chat/open': {
      const existing = state.chats[action.chat.id];
      return {
        ...state,
        chats: {
          ...state.chats,
          [action.chat.id]: existing?.phone ? existing : { ...existing, ...action.chat },
        },
        messages: existing ? state.messages : { ...state.messages, [action.chat.id]: [] },
        drafts: existing ? state.drafts : { ...state.drafts, [action.chat.id]: '' },
        activeChatId: action.chat.id,
      };
    }
    case 'chat/select':
      return state.chats[action.chatId] ? { ...state, activeChatId: action.chatId } : state;
    case 'draft/set':
      return { ...state, drafts: { ...state.drafts, [action.chatId]: action.text } };
    case 'message/outgoing':
      return appendMessage(state, action.message);
    case 'message/incoming': {
      const message = action.message;
      const next = state.chats[message.chatId]
        ? state
        : {
            ...state,
            chats: { ...state.chats, [message.chatId]: { id: message.chatId, title: `Чат ${message.chatId}` } },
            messages: { ...state.messages, [message.chatId]: [] },
            drafts: { ...state.drafts, [message.chatId]: '' },
          };
      const list = next.messages[message.chatId] ?? [];
      if (message.idMessage && list.some((item) => item.idMessage === message.idMessage)) return next;
      return appendMessage(next, message);
    }
    case 'message/accepted':
    case 'message/failed':
    case 'message/unknown': {
      const list = state.messages[action.chatId] ?? [];
      const status = action.type === 'message/accepted' ? 'accepted' :
        action.type === 'message/failed' ? 'failed' : 'unknown';
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.chatId]: list.map((message) => message.localId === action.localId
            ? { ...message, status, ...(action.type === 'message/accepted' ? { idMessage: action.idMessage } : {}) }
            : message),
        },
      };
    }
    case 'session/reset':
      return initialChatState;
  }
}

function appendMessage(state: ChatState, message: Message): ChatState {
  const list = state.messages[message.chatId] ?? [];
  if (list.some((item) => item.localId === message.localId)) return state;
  return { ...state, messages: { ...state.messages, [message.chatId]: [...list, message] } };
}
