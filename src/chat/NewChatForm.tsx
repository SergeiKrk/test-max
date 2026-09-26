import { useState, type FormEvent } from 'react';
import { LoaderCircle, Plus } from 'lucide-react';
import styles from './ChatPage.module.css';

type Props = { busy: boolean; error: string | null; onCreate: (phone: string) => Promise<void> };

export function NewChatForm({ busy, error, onCreate }: Props) {
  const [phone, setPhone] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) void onCreate(phone);
  }

  return (
    <form className={styles.newChat} onSubmit={submit}>
      <label htmlFor="new-chat-phone">Номер телефона</label>
      <div className={styles.newChatRow}>
        <input
          id="new-chat-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7 999 123-45-67"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={busy}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'new-chat-error' : undefined}
        />
        <button type="submit" aria-label="Создать чат" title="Создать чат" disabled={busy}>
          {busy ? <LoaderCircle className={styles.spin} size={18} /> : <Plus size={18} />}
        </button>
      </div>
      {error && <p className={styles.error} id="new-chat-error" role="alert">{error}</p>}
    </form>
  );
}
