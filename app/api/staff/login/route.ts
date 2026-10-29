import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { verifyIdToken } from '@/lib/line';
import { setStaffCookie } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST { idToken } → พนักงานที่ผูก LINE แล้ว เข้าหลังบ้าน
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as { idToken?: string } | null;
  if (!b?.idToken) return NextResponse.json({ message: 'ไม่มี ID token' }, { status: 400 });
  try {
    const u = await verifyIdToken(b.idToken);
    const [s] = await sql`select code from staff where line_user_id = ${u.sub} and invite_status = 'active'`;
    if (!s) return NextResponse.json({ message: 'บัญชี LINE นี้ยังไม่ได้รับเชิญเป็นพนักงาน' }, { status: 403 });
    await setStaffCookie(s.code);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: 'ยืนยันตัวตน LINE ไม่สำเร็จ' }, { status: 401 });
  }
}
