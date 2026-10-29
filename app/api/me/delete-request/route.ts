import { NextResponse, after } from 'next/server';
import { sql } from '@/lib/db';
import { sendDue } from '@/lib/notify';
import { currentCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

// ลูกค้าขอลบข้อมูล → บันทึกคำขอ + อีเมลแจ้งร้าน (ร้านลบหลังเคลียร์การจองที่ค้าง)
export async function POST() {
  const c = await currentCustomer();
  if (!c) return NextResponse.json({ message: 'เปิดหน้านี้ผ่าน LINE ของร้าน' }, { status: 401 });
  after(() => sendDue(5).catch(() => undefined));
  await sql.begin(async (tx) => {
    await tx`update customers set delete_requested_at = now(), consent_news = false, consent_photo = false where code = ${c}`;
    await tx`insert into notifications (customer_code, channel, template) values (${c}, 'email', 'delete_request')`;
  });
  return NextResponse.json({ ok: true });
}
