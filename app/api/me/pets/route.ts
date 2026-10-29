import { NextRequest, NextResponse } from 'next/server';
import { BookingError } from '@/lib/booking';
import { fail } from '@/lib/api';
import { addPet } from '@/lib/pets';
import { currentCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const c = await currentCustomer();
    if (!c) throw new BookingError('no_login', 'เปิดหน้านี้ผ่าน LINE ของร้าน');
    return NextResponse.json({ code: await addPet(c, (await req.json().catch(() => ({}))) as never) });
  } catch (e) { return fail(e); }
}
