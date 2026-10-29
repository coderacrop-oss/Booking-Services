import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verifyIdToken } from '@/lib/line';
import { setCustomerCookie } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST { idToken } จาก liff.getIDToken() → ตรวจกับ LINE → ผูกลูกค้า → ตั้งคุกกี้
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { idToken?: string } | null;
  if (!body?.idToken) return NextResponse.json({ error: 'bad_request', message: 'ไม่มี ID token' }, { status: 400 });
  try {
    const u = await verifyIdToken(body.idToken);
    const [{ code }] = await sql`select new_customer(${u.sub}, ${u.name}) as code`;
    await setCustomerCookie(code);
    const [c] = await sql`select pdpa_at is not null as consented from customers where code = ${code}`;
    return NextResponse.json({ ok: true, consented: c.consented });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'auth_failed', message: 'ยืนยันตัวตน LINE ไม่สำเร็จ ลองเปิดใหม่จาก LINE' }, { status: 401 });
  }
}
