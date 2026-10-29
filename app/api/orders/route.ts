import { NextRequest, NextResponse } from 'next/server';
import { BookingError } from '@/lib/booking';
import { fail } from '@/lib/api';
import { createOrder } from '@/lib/orders';
import { currentCustomer } from '@/lib/session';
import { sql } from '@/lib/db';
import type { CartItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

// POST { items, accept } → สร้างทริป + กันที่ · ตอบรหัสทริปเพื่อไปหน้าจ่าย
export async function POST(req: NextRequest) {
  try {
    const customer = await currentCustomer();
    if (!customer) throw new BookingError('no_login', 'เปิดหน้านี้ผ่าน LINE ของร้าน');
    const [c] = await sql`select pdpa_at from customers where code = ${customer}`;
    if (!c?.pdpa_at) throw new BookingError('no_consent', 'กรุณายอมรับการเก็บข้อมูลก่อนจอง');
    const b = (await req.json().catch(() => null)) as { items?: CartItem[]; accept?: boolean } | null;
    if (!b || !Array.isArray(b.items)) throw new BookingError('bad_cart', 'ข้อมูลไม่ถูกต้อง');
    return NextResponse.json(await createOrder(customer, b.items, b.accept === true));
  } catch (e) {
    return fail(e);
  }
}
