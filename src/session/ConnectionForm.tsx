import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LoaderCircle, Link2 } from 'lucide-react';
import type { Credentials } from '../api/types';
import type { ConnectionState } from './useSession';
import styles from './ConnectionForm.module.css';

type Props = {
  connectionState: ConnectionState;
  error: string | null;
  onConnect: (credentials: Credentials) => Promise<void>;
};

export function ConnectionForm({ connectionState, error, onConnect }: Props) {
  const [idInstance, setIdInstance] = useState('');
  const [apiTokenInstance, setApiTokenInstance] = useState('');
  const [showToken, setShowToken] = useState(false);
  const connecting = connectionState === 'connecting';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (connecting) return;
    void onConnect({ idInstance: idInstance.trim(), apiTokenInstance: apiTokenInstance.trim() });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.heading}>
        <span className={styles.headingIcon} aria-hidden="true"><Link2 size={20} /></span>
        <div>
          <h2>Подключение к MAX</h2>
          <p>Укажите данные инстанса GREEN-API</p>
        </div>
      </div>

      <label className={styles.field}>
        <span>idInstance</span>
        <input
          name="idInstance"
          type="text"
          inputMode="numeric"
          pattern="[0-9]+"
          autoComplete="off"
          placeholder="Номер инстанса"
          value={idInstance}
          onChange={(event) => setIdInstance(event.target.value)}
          disabled={connecting}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'connection-error' : undefined}
        />
      </label>

      <label className={styles.field}>
        <span>apiTokenInstance</span>
        <span className={styles.tokenField}>
          <input
            name="apiTokenInstance"
            type={showToken ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder="Токен инстанса"
            value={apiTokenInstance}
            onChange={(event) => setApiTokenInstance(event.target.value)}
            disabled={connecting}
            required
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'connection-error' : undefined}
          />
          <button
            className={styles.reveal}
            type="button"
            title={showToken ? 'Скрыть токен' : 'Показать токен'}
            aria-label={showToken ? 'Скрыть токен' : 'Показать токен'}
            aria-pressed={showToken}
            onClick={() => setShowToken((current) => !current)}
          >
            {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
      </label>

      {error && <p className={styles.error} id="connection-error" role="alert">{error}</p>}
      <button className={styles.submit} type="submit" disabled={connecting}>
        {connecting && <LoaderCircle size={18} className={styles.spin} aria-hidden="true" />}
        {connecting ? 'Подключение...' : 'Подключиться'}
      </button>
    </form>
  );
}
