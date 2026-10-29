import { NextRequest, NextResponse } from 'next/server';
import { BookingError, quote } from '@/lib/booking';
import { fail } from '@/lib/api';
import { currentCustomer } from '@/lib/session';
import type { CartItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

// POST /api/quote { items: CartItem[] } → ราคา มัดจำ ที่ server คิด (ยังไม่จองจริง)
export async function POST(req: NextRequest) {
  try {
    const customer = await currentCustomer();
    if (!customer) throw new BookingError('no_login', 'เปิดหน้านี้ผ่าน LINE ของร้าน');
    const body = (await req.json().catch(() => null)) as { items?: CartItem[] } | null;
    if (!body || !Array.isArray(body.items)) throw new BookingError('bad_cart', 'ข้อมูลไม่ถูกต้อง');
    return NextResponse.json(await quote(customer, body.items));
  } catch (e) {
    return fail(e);
  }
}
