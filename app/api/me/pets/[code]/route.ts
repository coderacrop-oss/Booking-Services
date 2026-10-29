import { NextRequest, NextResponse } from 'next/server';
import { BookingError } from '@/lib/booking';
import { fail } from '@/lib/api';
import { updatePet } from '@/lib/pets';
import { currentCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const c = await currentCustomer();
    if (!c) throw new BookingError('no_login', 'เปิดหน้านี้ผ่าน LINE ของร้าน');
    await updatePet(c, (await params).code, (await req.json().catch(() => ({}))) as never);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
