import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

// คุกกี้ล็อกอินแบบเซ็นด้วย SESSION_SECRET (ไม่มีข้อมูลลับในคุกกี้ มีแค่รหัสลูกค้า/พนักงาน)
const COOKIE = 'bs_c';
const STAFF_COOKIE = 'bs_s';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 วัน

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('ต้องตั้ง SESSION_SECRET (ยาวอย่างน้อย 32 ตัวอักษร)');
  return s;
}
function sign(v: string) {
  return createHmac('sha256', secret()).update(v).digest('base64url');
}
export function seal(code: string): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const body = `${code}.${exp}`;
  return `${body}.${sign(body)}`;
}
export function unseal(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const body = token.slice(0, i), mac = token.slice(i + 1);
  const want = sign(body);
  if (mac.length !== want.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  const [code, exp] = body.split('.');
  if (!code || Number(exp) < Date.now() / 1000) return null;
  return code;
}

const opts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: MAX_AGE };

export async function setCustomerCookie(code: string) { (await cookies()).set(COOKIE, seal(code), opts); }
export async function setStaffCookie(code: string) { (await cookies()).set(STAFF_COOKIE, seal(code), opts); }
export async function clearCookies() { const c = await cookies(); c.delete(COOKIE); c.delete(STAFF_COOKIE); }

export const demoMode = () => process.env.DEMO_MODE === '1';

// ลูกค้าที่ล็อกอินอยู่ (โหมดเดโม่: ลูกค้าสมมติจาก env)
export async function currentCustomer(): Promise<string | null> {
  const c = unseal((await cookies()).get(COOKIE)?.value);
  if (c) return c;
  if (demoMode() && process.env.DEMO_CUSTOMER) return process.env.DEMO_CUSTOMER;
  return null;
}

export async function staffCookie(): Promise<string | null> {
  return unseal((await cookies()).get(STAFF_COOKIE)?.value);
}
