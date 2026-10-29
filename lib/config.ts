import 'server-only';
import { sql } from './db';

// LIFF ID: env NEXT_PUBLIC_LIFF_ID ก่อน · ไม่มีใช้ค่าที่เจ้าของใส่ในหลังบ้าน (ตั้งค่า → รับเงินและข้อมูลร้าน)
export async function liffId(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_LIFF_ID) return process.env.NEXT_PUBLIC_LIFF_ID;
  try {
    const [r] = await sql`select value from settings where key = 'liff_id'`;
    return r?.value || null;
  } catch { return null; }
}

// ที่อยู่เว็บ: APP_URL → โดเมน production ของ Vercel (Vercel ใส่ให้เอง) → โดเมนของ deployment นี้
export function appUrl(): string | null {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    || (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`);
  return u ? u.replace(/\/$/, '') : null;
}

// LINE Login channel ID: env ก่อน · ไม่มีใช้ส่วนหน้าของ LIFF ID (รูปแบบ <channelId>-<รหัส>)
export async function loginChannelId(): Promise<string | null> {
  if (process.env.LINE_LOGIN_CHANNEL_ID) return process.env.LINE_LOGIN_CHANNEL_ID;
  const id = await liffId();
  const m = /^(\d{6,})-/.exec(id || '');
  return m ? m[1] : null;
}

// ลิงก์ไปหน้าในแอป: ผ่าน LIFF ถ้ามี (เปิดใน LINE + ล็อกอินอัตโนมัติ) ไม่งั้นเป็นเว็บปกติ
export async function appLink(path: string): Promise<string | null> {
  const id = await liffId();
  if (id) return `https://liff.line.me/${id}${path}`;
  const base = appUrl();
  return base ? base + path : null;
}
