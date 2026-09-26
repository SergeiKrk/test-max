export type SendStatus = 'pending' | 'accepted' | 'failed' | 'unknown';

export type Chat = { id: string; title: string; phone?: string };

export type Message = {
  localId: string;
  idMessage?: string;
  chatId: string;
  text: string;
  direction: 'incoming' | 'outgoing';
  sentAt: number;
  status?: SendStatus;
};

export type ChatState = {
  chats: Record<string, Chat>;
  messages: Record<string, Message[]>;
  drafts: Record<string, string>;
  activeChatId: string | null;
};
