import { NextRequest, NextResponse } from 'next/server';
import { BookingError } from '@/lib/booking';
import { fail } from '@/lib/api';
import { reviewPayment } from '@/lib/orders';
import { currentStaff } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// POST { action: 'approve' | 'reject', amount_slip?, reason? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const s = await currentStaff();
    if (!s) return NextResponse.json({ error: 'no_login', message: 'เข้าสู่ระบบพนักงานก่อน' }, { status: 401 });
    const b = (await req.json().catch(() => null)) as { action?: string; amount_slip?: number; reason?: string } | null;
    if (b?.action !== 'approve' && b?.action !== 'reject') throw new BookingError('bad_action', 'คำสั่งไม่ถูกต้อง');
    const amt = b.amount_slip === undefined || b.amount_slip === null ? null : Number(b.amount_slip);
    if (amt !== null && !(amt >= 0)) throw new BookingError('bad_amount', 'ยอดในสลิปไม่ถูกต้อง');
    await reviewPayment(s.code, (await params).code, b.action, amt, b.reason?.slice(0, 200) || null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
