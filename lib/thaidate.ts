// วันที่แบบไทย ใช้ได้ทั้ง server และหน้าจอ · วันที่เป็นสตริง YYYY-MM-DD เวลาไทยเสมอ

const DOW = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const parse = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
};
export const ymd = (dt: Date) => dt.toISOString().slice(0, 10);

export function addDays(d: string, n: number): string {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return ymd(x);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}
// 1 = จันทร์ … 7 = อาทิตย์ (ตรงกับ pool_sessions.weekdays)
export function isoDow(d: string): number {
  const w = parse(d).getUTCDay();
  return w === 0 ? 7 : w;
}
export function dowShort(d: string): string {
  return DOW[parse(d).getUTCDay()];
}
// ส. 21 พ.ย.
export function thDate(d: string, withMonth = true): string {
  const x = parse(d);
  return `${DOW[x.getUTCDay()]} ${x.getUTCDate()}${withMonth ? ' ' + MON[x.getUTCMonth()] : ''}`;
}
// 15 มี.ค. 2570 (พ.ศ.)
export function thDay(d: string): string {
  const x = parse(d);
  return `${x.getUTCDate()} ${MON[x.getUTCMonth()]} ${x.getUTCFullYear() + 543}`;
}
// 21–23 พ.ย. หรือ 30 พ.ย. – 2 ธ.ค.
export function thRange(a: string, b: string): string {
  const x = parse(a), y = parse(b);
  if (x.getUTCMonth() === y.getUTCMonth()) return `${x.getUTCDate()}–${y.getUTCDate()} ${MON[x.getUTCMonth()]}`;
  return `${x.getUTCDate()} ${MON[x.getUTCMonth()]} – ${y.getUTCDate()} ${MON[y.getUTCMonth()]}`;
}
// วันนี้ตามเวลาไทย
export function todayTH(now = new Date()): string {
  return ymd(new Date(now.getTime() + 7 * 3600000));
}
export const baht = (n: number) => '฿' + Math.round(n).toLocaleString('en-US');

// '14:00-18:00' → '14:00'
export function firstTime(s: string | null | undefined, fallback: string): string {
  const m = /(\d{1,2}):(\d{2})/.exec(s || '');
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : fallback;
}
export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
