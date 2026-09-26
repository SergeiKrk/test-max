import { useEffect, useRef, useState } from 'react';
import type { NotificationEvent } from '../api/types';
import type { Session } from '../session/useSession';
import { startReceiving, type ReceivingState } from './receiveLoop';

export function useReceiving(session: Session, onEvent: (event: NotificationEvent) => void) {
  const [state, setState] = useState<ReceivingState>('working');
  const [run, setRun] = useState(0);
  const receipts = useRef<{ session: Session; ids: Set<number> } | null>(null);

  useEffect(() => {
    if (receipts.current?.session !== session) receipts.current = { session, ids: new Set() };
    const ids = receipts.current.ids;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    session.signal.addEventListener('abort', cancel, { once: true });
    if (session.signal.aborted) cancel();
    void startReceiving({
      api: session.api,
      signal: controller.signal,
      processedReceiptIds: ids,
      onEvent,
      onState: (next) => { if (!controller.signal.aborted) setState(next); },
    });
    return () => {
      controller.abort();
      session.signal.removeEventListener('abort', cancel);
    };
  }, [session, run, onEvent]);

  return { state, resume: () => { if (state === 'paused' && !session.signal.aborted) setRun((value) => value + 1); } };
}
