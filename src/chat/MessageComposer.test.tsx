import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { MessageComposer } from './MessageComposer';

afterEach(cleanup);

describe('MessageComposer', () => {
  it('keeps newlines and prevents blank or over-limit messages', () => {
    const onSend = vi.fn();
    function Harness() {
      const [value, setValue] = useState('');
      return <MessageComposer value={value} onChange={setValue} onSend={onSend} />;
    }
    render(<Harness />);
    const input = screen.getByLabelText('Сообщение');
    const sendButton = screen.getByRole('button', { name: 'Отправить' });
    expect(input).toHaveStyle({ height: '42px' });
    expect(sendButton).toBeDisabled();
    expect(sendButton.querySelector('[data-icon="arrow-up"]')).toHaveAttribute('width', '24');
    expect(sendButton.querySelector('[data-icon="arrow-up"]')).toHaveAttribute('height', '24');
    fireEvent.change(input, { target: { value: '  \n  ' } });
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Первая строка\nВторая строка' } });
    expect(input).toHaveValue('Первая строка\nВторая строка');
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeEnabled();
    fireEvent.change(input, { target: { value: 'x'.repeat(4000) } });
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeEnabled();
    fireEvent.change(input, { target: { value: 'x'.repeat(4001) } });
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
  });

  it('sends on Enter, leaves Shift+Enter as a newline, and ignores Enter during IME composition', () => {
    const onSend = vi.fn();
    render(<MessageComposer value="Текст" onChange={() => {}} onSend={onSend} />);
    const input = screen.getByLabelText('Сообщение');
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: false, shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: false });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('distinguishes an in-progress send from an empty disabled composer', () => {
    const onSend = vi.fn();
    const { rerender } = render(<MessageComposer value="" onChange={() => {}} onSend={onSend} />);
    const sendButton = screen.getByRole('button', { name: 'Отправить' });
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute('data-sending', 'false');

    rerender(<MessageComposer value="Текст" disabled onChange={() => {}} onSend={() => {}} />);
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute('data-sending', 'true');
    expect(screen.getByLabelText('Сообщение')).toHaveValue('Текст');
    fireEvent.keyDown(screen.getByLabelText('Сообщение'), { key: 'Enter', code: 'Enter', isComposing: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows the over-limit error and exposes the counter to assistive technology', () => {
    render(<MessageComposer value={'x'.repeat(4001)} onChange={() => {}} onSend={() => {}} />);
    const input = screen.getByLabelText('Сообщение');

    expect(screen.getByRole('alert')).toHaveTextContent('Максимум 4000 символов');
    expect(screen.getByText('4001/4000')).toBeInTheDocument();
    expect(input.getAttribute('aria-describedby')).toContain('message-error');
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled();
  });
});
