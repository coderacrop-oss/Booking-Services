import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { currentCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

// PATCH { display_name?, phone?, email?, consent_news?, consent_photo? }
export async function PATCH(req: NextRequest) {
  const c = await currentCustomer();
  if (!c) return NextResponse.json({ message: 'เปิดหน้านี้ผ่าน LINE ของร้าน' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof b.display_name === 'string' ? b.display_name.trim().slice(0, 40) : null;
  const phone = typeof b.phone === 'string' ? b.phone.replace(/\D/g, '') : null;
  const email = typeof b.email === 'string' ? b.email.trim().slice(0, 80) : null;
  if (phone && !/^0\d{8,9}$/.test(phone)) return NextResponse.json({ message: 'เบอร์โทรไม่ถูกต้อง' }, { status: 400 });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ message: 'อีเมลไม่ถูกต้อง' }, { status: 400 });
  await sql`update customers set
      display_name = coalesce(nullif(${name ?? ''}, ''), display_name),
      phone = case when ${typeof b.phone === 'string'} then ${phone || null} else phone end,
      email = case when ${typeof b.email === 'string'} then ${email || null} else email end,
      consent_news = coalesce(${typeof b.consent_news === 'boolean' ? b.consent_news : null}::boolean, consent_news),
      consent_photo = coalesce(${typeof b.consent_photo === 'boolean' ? b.consent_photo : null}::boolean, consent_photo)
    where code = ${c}`;
  return NextResponse.json({ ok: true });
}
