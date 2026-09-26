import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionForm } from './ConnectionForm';

describe('ConnectionForm', () => {
  it('keeps the token hidden and sends only the entered credentials', () => {
    const onConnect = vi.fn().mockResolvedValue(undefined);
    render(<ConnectionForm connectionState="disconnected" error={null} onConnect={onConnect} />);
    const token = screen.getByLabelText('apiTokenInstance');
    expect(token).toHaveAttribute('type', 'password');
    fireEvent.change(screen.getByLabelText('idInstance'), { target: { value: '3100000000' } });
    fireEvent.change(token, { target: { value: 'fake-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Подключиться' }));
    expect(onConnect).toHaveBeenCalledWith({ idInstance: '3100000000', apiTokenInstance: 'fake-token' });
    fireEvent.click(screen.getByRole('button', { name: 'Показать токен' }));
    expect(token).toHaveAttribute('type', 'text');
  });

  it('blocks duplicate submission while connecting and shows an error', () => {
    const onConnect = vi.fn();
    render(<ConnectionForm connectionState="connecting" error="Ошибка сети" onConnect={onConnect} />);
    expect(screen.getByRole('button', { name: 'Подключение...' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Ошибка сети');
    expect(onConnect).not.toHaveBeenCalled();
  });
});
