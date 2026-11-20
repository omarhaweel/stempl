const pad = (n: number) => String(n).padStart(2, '0');

/** Digits only, formatted as dd-mm-åååå while typing. */
export function formatDateInput(input: string) {
  const d = input.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`;
}

/** Digits only, formatted as tt:mm while typing. */
export function formatTimeInput(input: string) {
  const d = input.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

/** dd-mm-åååå -> åååå-mm-dd, or null if not a real date (optionally past only). */
export function toIsoDate(value: string, opts: { pastOnly?: boolean } = {}) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const valid =
    date.getFullYear() === Number(yyyy) &&
    date.getMonth() === Number(mm) - 1 &&
    date.getDate() === Number(dd) &&
    Number(yyyy) >= 1900 &&
    (!opts.pastOnly || date < new Date());
  return valid ? `${yyyy}-${mm}-${dd}` : null;
}

/** åååå-mm-dd -> dd-mm-åååå */
export function isoToDateInput(iso: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

export const dateToInput = (d: Date) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
export const timeToInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dateToIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "dd-mm-åååå" + "tt:mm" (device time zone) -> Date, or null. */
export function parseDateTime(dateInput: string, timeInput: string) {
  const iso = toIsoDate(dateInput);
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeInput);
  if (!iso || !t) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d, Number(t[1]), Number(t[2]));
}

/** "37:30" -> 2250 minutes, or null. */
export function parseHoursMinutes(value: string) {
  const m = /^(\d{1,4}):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export const minutesToHoursInput = (min: number) => `${Math.floor(Math.max(0, min) / 60)}:${pad(Math.max(0, min) % 60)}`;
