import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['+7 (999) 123-45-67', '79991234567'],
    ['375 29 123-45-67', '375291234567'],
    ['+375 (29) 123 45 67', '375291234567'],
  ])('normalizes %s to its canonical digits', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['8 (999) 123-45-67', '7999123456', 'letters79991234567', '7+9991234567', '+799912345678'])(
    'rejects invalid or ambiguous phone input: %s', (input) => {
    expect(() => normalizePhone(input)).toThrow();
    },
  );
});
