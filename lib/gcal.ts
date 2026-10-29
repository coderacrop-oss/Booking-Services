import 'server-only';
import { createSign } from 'node:crypto';

// Google Calendar ด้วย service account
// ตั้ง GOOGLE_SERVICE_ACCOUNT_JSON (ทั้งไฟล์ JSON) แล้วแชร์ปฏิทินของแต่ละธุรกิจให้อีเมล service account สิทธิ์ "แก้ไขกิจกรรม"
type SA = { client_email: string; private_key: string };
let cache: { token: string; exp: number } | null = null;

export const calendarReady = () => !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const b64 = (x: string | Buffer) => Buffer.from(x).toString('base64url');

export function signJwt(sa: SA, now = Math.floor(Date.now() / 1000)) {
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key);
  return `${head}.${body}.${b64(sig)}`;
}

async function token(): Promise<string> {
  if (cache && cache.exp > Date.now() + 60000) return cache.token;
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}') as SA;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(sa) }),
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`google token: ${j.error_description || r.status}`);
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cache.token;
}

const api = (cal: string, path = '') => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events${path}`;

export async function insertEvent(cal: string, ev: { summary: string; description: string; start: string; end: string; id: string }) {
  const r = await fetch(api(cal), {
    method: 'POST',
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      // id คงที่จากรหัสจอง: ส่งซ้ำไม่เกิด event ซ้ำ (Google ตอบ 409)
      id: ev.id, summary: ev.summary, description: ev.description,
      start: { dateTime: ev.start, timeZone: 'Asia/Bangkok' }, end: { dateTime: ev.end, timeZone: 'Asia/Bangkok' },
    }),
  });
  if (r.status === 409) return ev.id;
  if (!r.ok) throw new Error(`calendar ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()) as { id: string }).id;
}

export async function deleteEvent(cal: string, id: string) {
  const r = await fetch(api(cal, `/${encodeURIComponent(id)}`), { method: 'DELETE', headers: { authorization: `Bearer ${await token()}` } });
  if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`calendar delete ${r.status}`);
}

// รหัส event ของ Google ใช้ได้เฉพาะ a-v และ 0-9
export const eventId = (bookingCode: string) => 'bk' + Buffer.from(bookingCode).toString('hex').replace(/[^a-v0-9]/g, '');
