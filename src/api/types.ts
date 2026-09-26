export type Credentials = { idInstance: string; apiTokenInstance: string };

export type IncomingText = {
  chatId: string;
  idMessage: string;
  text: string;
  timestamp: number;
};

export type NotificationEvent =
  | { kind: 'text'; message: IncomingText }
  | { kind: 'skip'; typeWebhook: string };

export type Notification = { receiptId: number; event: NotificationEvent };

export type ApiErrorCode =
  | 'access' | 'api' | 'http' | 'network' | 'timeout' | 'schema' | 'aborted';

export type ApiFailure = {
  code: ApiErrorCode;
  operation: string;
  status?: number;
  retryAfterMs?: number;
};

export interface GreenApi {
  getStateInstance(signal: AbortSignal): Promise<string>;
  checkAccount(phone: string, signal: AbortSignal): Promise<
    { exist: false } | { exist: true; chatId: string }
  >;
  sendMessage(chatId: string, text: string, signal: AbortSignal): Promise<{ idMessage: string }>;
  receiveNotification(signal: AbortSignal): Promise<Notification | null>;
  deleteNotification(receiptId: number, signal: AbortSignal): Promise<boolean>;
}
