import { useCallback, useEffect, useRef, useState } from 'react';
import { createGreenApi } from '../api/greenApi';
import type { ApiFailure, Credentials, GreenApi } from '../api/types';

export type Session = {
  generation: number;
  api: GreenApi;
  signal: AbortSignal;
};

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

function connectionError(failure: unknown): string {
  if (typeof failure !== 'object' || failure === null || !('code' in failure)) {
    return 'Не удалось подключиться. Попробуйте ещё раз.';
  }
  switch ((failure as ApiFailure).code) {
    case 'access': return 'Доступ отклонён. Проверьте idInstance и apiTokenInstance.';
    case 'timeout': return 'Сервер не ответил вовремя. Попробуйте ещё раз.';
    case 'network': return 'Ошибка сети. Проверьте соединение и доступ к API из браузера.';
    case 'schema': return 'Неожиданный ответ сервера или неверный формат данных.';
    case 'api': return 'Сервис отклонил запрос.';
    default: return 'Не удалось подключиться. Попробуйте ещё раз.';
  }
}

export function useSession() {
  const generation = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const disconnect = useCallback(() => {
    generation.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setSession(null);
    setError(null);
    setConnectionState('disconnected');
  }, []);

  const connect = useCallback(async (credentials: Credentials) => {
    generation.current += 1;
    const current = generation.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setSession(null);
    setError(null);
    setConnectionState('connecting');

    try {
      const api = createGreenApi(credentials);
      const state = await api.getStateInstance(controller.signal);
      if (generation.current !== current || controller.signal.aborted) return;
      if (state !== 'authorized') {
        activeController.current = null;
        controller.abort();
        const stateLabel = state === 'notAuthorized' ? 'notAuthorized' :
          state === 'starting' ? 'starting' :
          state === 'blocked' ? 'blocked' : 'другое состояние';
        setError(`Инстанс не авторизован: ${stateLabel}.`);
        setConnectionState('error');
        return;
      }
      setSession({ generation: current, api, signal: controller.signal });
      setConnectionState('connected');
    } catch (failure) {
      if (generation.current !== current || controller.signal.aborted) return;
      activeController.current = null;
      controller.abort();
      setError(connectionError(failure));
      setConnectionState('error');
    }
  }, []);

  useEffect(() => () => {
    generation.current += 1;
    activeController.current?.abort();
  }, []);

  return { session, connectionState, error, connect, disconnect };
}
