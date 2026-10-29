import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { currentCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST { phone?, accept: true } → บันทึกความยินยอม PDPA + ฉบับนโยบาย
export async function POST(req: NextRequest) {
  const customer = await currentCustomer();
  if (!customer) return NextResponse.json({ error: 'no_login', message: 'เปิดหน้านี้ผ่าน LINE ของร้าน' }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { phone?: string; accept?: boolean } | null;
  if (!b?.accept) return NextResponse.json({ error: 'need_accept', message: 'กรุณากดยอมรับก่อน' }, { status: 400 });
  const phone = (b.phone || '').replace(/\D/g, '');
  if (phone && !/^0\d{8,9}$/.test(phone)) return NextResponse.json({ error: 'bad_phone', message: 'เบอร์โทรไม่ถูกต้อง' }, { status: 400 });
  await sql`update customers set pdpa_at = now(),
              policy_version = (select value from settings where key = 'policy_version'),
              phone = coalesce(${phone || null}, phone)
            where code = ${customer}`;
  return NextResponse.json({ ok: true });
}
