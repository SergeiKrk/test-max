import type { ApiFailure, Notification, NotificationEvent } from './types';

type RecordValue = Record<string, unknown>;

function record(value: unknown, operation: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw { code: 'schema', operation } satisfies ApiFailure;
  }
  return value as RecordValue;
}

function nonempty(value: unknown, operation: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw { code: 'schema', operation } satisfies ApiFailure;
  }
  return value;
}

function safeId(value: unknown, operation: string): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  return nonempty(value, operation);
}

export function parseState(value: unknown): string {
  return nonempty(record(value, 'getStateInstance').stateInstance, 'getStateInstance');
}

export function parseAccount(value: unknown): { exist: false } | { exist: true; chatId: string } {
  const data = record(value, 'checkAccount');
  if (data.status === false) {
    throw { code: 'api', operation: 'checkAccount' } satisfies ApiFailure;
  }
  if (data.exist === false) return { exist: false };
  if (data.exist === true) {
    return { exist: true, chatId: nonempty(data.chatId, 'checkAccount') };
  }
  throw { code: 'schema', operation: 'checkAccount' } satisfies ApiFailure;
}

export function parseSent(value: unknown): { idMessage: string } {
  const data = record(value, 'sendMessage');
  if (data.status === false) {
    throw { code: 'api', operation: 'sendMessage' } satisfies ApiFailure;
  }
  return { idMessage: nonempty(data.idMessage, 'sendMessage') };
}

const skipWebhooks = new Set([
  'outgoingMessageReceived',
  'outgoingAPIMessageReceived',
  'outgoingMessageStatus',
  'stateInstanceChanged',
  'quotaExceeded',
]);

const skipMessages = new Set([
  'imageMessage', 'videoMessage', 'documentMessage', 'audioMessage',
  'locationMessage', 'contactMessage', 'pollMessage', 'reactionMessage',
  'editedMessage', 'deletedMessage', 'stickerMessage',
]);

function parseEvent(body: RecordValue, operation: string): NotificationEvent {
  const typeWebhook = nonempty(body.typeWebhook, operation);
  if (skipWebhooks.has(typeWebhook)) return { kind: 'skip', typeWebhook };
  if (typeWebhook !== 'incomingMessageReceived') {
    throw { code: 'schema', operation } satisfies ApiFailure;
  }

  const sender = record(body.senderData, operation);
  const chatType = nonempty(sender.chatType, operation);
  if (chatType === 'group' || chatType === 'channel') return { kind: 'skip', typeWebhook };
  if (chatType !== 'user') throw { code: 'schema', operation } satisfies ApiFailure;

  const data = record(body.messageData, operation);
  const typeMessage = nonempty(data.typeMessage, operation);
  if (skipMessages.has(typeMessage)) return { kind: 'skip', typeWebhook };
  if (typeMessage !== 'textMessage' && typeMessage !== 'extendedTextMessage' && typeMessage !== 'quotedMessage') {
    throw { code: 'schema', operation } satisfies ApiFailure;
  }

  const text = typeMessage === 'textMessage'
    ? record(data.textMessageData, operation).textMessage
    : record(data.extendedTextMessageData, operation).text;
  if (typeof text !== 'string') throw { code: 'schema', operation } satisfies ApiFailure;
  const timestamp = body.timestamp;
  if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw { code: 'schema', operation } satisfies ApiFailure;
  }
  return {
    kind: 'text',
    message: {
      chatId: nonempty(sender.chatId, operation),
      idMessage: nonempty(body.idMessage, operation),
      text,
      timestamp,
    },
  };
}

export function parseNotification(value: unknown, idInstance: string): Notification | null {
  const operation = 'receiveNotification';
  if (value === null) return null;
  const data = record(value, operation);
  const receiptId = data.receiptId;
  if (typeof receiptId !== 'number' || !Number.isSafeInteger(receiptId) || receiptId < 0) {
    throw { code: 'schema', operation } satisfies ApiFailure;
  }
  const body = record(data.body, operation);
  const instance = record(body.instanceData, operation);
  if (safeId(instance.idInstance, operation) !== idInstance) {
    throw { code: 'schema', operation } satisfies ApiFailure;
  }
  return { receiptId, event: parseEvent(body, operation) };
}

export function parseDeleted(value: unknown): boolean {
  const result = record(value, 'deleteNotification').result;
  if (typeof result !== 'boolean') {
    throw { code: 'schema', operation: 'deleteNotification' } satisfies ApiFailure;
  }
  return result;
}
