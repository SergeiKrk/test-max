export function normalizePhone(input: string): string {
  const value = input.trim();
  if (!value || !/^\+?[\d\s()-]+$/.test(value)) {
    throw new Error('Введите номер телефона без букв и лишних символов.');
  }

  const digits = value.replace(/[\s()-]/g, '').replace(/^\+/, '');
  if (!/^(7\d{10}|375\d{9})$/.test(digits)) {
    throw new Error('Поддерживаются номера РФ (+7) и Беларуси (+375) в международном формате.');
  }
  return digits;
}
