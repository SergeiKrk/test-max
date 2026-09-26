import { useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import styles from './ChatPage.module.css';

const MAX_LENGTH = 4000;

type Props = {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
};

export function MessageComposer({ value, disabled = false, onChange, onSend }: Props) {
  const invalid = value.length > MAX_LENGTH || !value.trim();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight) || 180;
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 42), maxHeight)}px`;
  }, [value]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disabled && !invalid) onSend();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!disabled && !invalid) onSend();
  }

  return (
    <form className={styles.composer} onSubmit={submit}>
      <label className={styles.visuallyHidden} htmlFor="chat-draft">Сообщение</label>
      <div className={styles.composerRow}>
        <textarea
          ref={textareaRef}
          id="chat-draft"
          rows={1}
          value={value}
          maxLength={4001}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Введите текст сообщения"
          aria-describedby={value.length > MAX_LENGTH ? 'message-counter message-error' : 'message-counter'}
        />
        <button
          type="submit"
          title="Отправить"
          aria-label="Отправить"
          data-sending={disabled ? 'true' : 'false'}
          disabled={disabled || invalid}
        >
          <ArrowUp size={24} data-icon="arrow-up" />
        </button>
      </div>
      <div className={styles.composerMeta} data-visible={value.length > MAX_LENGTH ? 'true' : undefined}>
        {value.length > MAX_LENGTH && <span id="message-error" role="alert">Максимум 4000 символов</span>}
        <small id="message-counter" className={value.length > MAX_LENGTH ? styles.counterVisible : styles.visuallyHidden}>
          {value.length}/4000
        </small>
      </div>
    </form>
  );
}
