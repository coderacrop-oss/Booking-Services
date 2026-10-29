import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// เก็บไฟล์ใน Supabase Storage (ต้องมี NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
// ถ้าไม่มี (เครื่อง dev) เก็บในโฟลเดอร์ .uploads แทน
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCAL = path.join(process.cwd(), '.uploads');
const useSupabase = () => !!(URL_ && KEY);
const safe = (p: string) => p.split('/').filter((x) => x && x !== '..').join('/');

export async function putFile(bucket: string, p: string, data: Buffer, type: string) {
  p = safe(p);
  if (useSupabase()) {
    const r = await fetch(`${URL_}/storage/v1/object/${bucket}/${p}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': type, 'x-upsert': 'false' },
      body: new Uint8Array(data),
    });
    if (!r.ok) throw new Error(`อัปโหลดไม่สำเร็จ (${r.status})`);
    return p;
  }
  const f = path.join(LOCAL, bucket, p);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, data);
  return p;
}

// ลิงก์ชั่วคราวสำหรับไฟล์ส่วนตัว (สลิป วัคซีน) · ใช้ในหลังบ้านเท่านั้น
export async function signedUrl(bucket: string, p: string, seconds = 600): Promise<string> {
  p = safe(p);
  if (useSupabase()) {
    const r = await fetch(`${URL_}/storage/v1/object/sign/${bucket}/${p}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn: seconds }),
    });
    if (!r.ok) return '';
    const j = (await r.json()) as { signedURL?: string };
    return j.signedURL ? `${URL_}/storage/v1${j.signedURL}` : '';
  }
  return `/api/admin/file?b=${encodeURIComponent(bucket)}&p=${encodeURIComponent(p)}`;
}

export async function readLocal(bucket: string, p: string) {
  return readFile(path.join(LOCAL, safe(bucket), safe(p)));
}

// ตรวจว่าเป็นรูปจริง (ดูจากหัวไฟล์ ไม่เชื่อนามสกุล)
export function imageType(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}
