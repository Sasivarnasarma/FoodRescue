export function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(
    value.trim(),
  );
  if (!match) throw new Error('Use YYYY-MM-DD HH:mm for dates.');
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  )
    throw new Error('Enter a valid calendar date and time.');
  return date;
}
export function localDateText(date?: Date | null): string {
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function positiveQuantity(text: string): number {
  const quantity = Number(text);
  if (!text.trim() || !Number.isSafeInteger(quantity) || quantity <= 0)
    throw new Error('Enter a positive whole quantity.');
  return quantity;
}
