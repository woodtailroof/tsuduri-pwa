export function parseDateTimeLocalValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  if (
    date.getFullYear() !== year || date.getMonth() !== month - 1 ||
    date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute
  ) return null;
  return date;
}

export function tripTimeRangeError(start: Date | null, endValue: string, now = new Date()): string {
  if (!endValue) return "";
  const end = parseDateTimeLocalValue(endValue);
  if (!end) return "終了日時を正しく入力してね。";
  if (!start || !Number.isFinite(start.getTime())) return "終了日時を記録する場合は、開始日時も入力してね。";
  if (end.getTime() < start.getTime()) return "終了日時は開始日時以降にしてね。日をまたぐ場合は終了日も変更できます。";
  if (end.getTime() > now.getTime()) return "終了日時は現在までの日時を入力してね。";
  return "";
}
