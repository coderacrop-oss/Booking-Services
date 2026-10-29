import { NextRequest, NextResponse } from 'next/server';
import { BookingError } from '@/lib/booking';
import { fail } from '@/lib/api';
import { reviewVaccine } from '@/lib/pets';
import { currentStaff } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// POST { action: approve | reject, expires_on?, reason? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await currentStaff();
    if (!s) return NextResponse.json({ message: 'เข้าสู่ระบบพนักงานก่อน' }, { status: 401 });
    const b = (await req.json().catch(() => ({}))) as { action?: string; expires_on?: string; reason?: string };
    if (b.action !== 'approve' && b.action !== 'reject') throw new BookingError('bad_action', 'คำสั่งไม่ถูกต้อง');
    const id = Number((await params).id);
    if (!Number.isInteger(id)) throw new BookingError('bad_id', 'รายการไม่ถูกต้อง');
    await reviewVaccine(s, id, b.action, b.expires_on || null, b.reason?.slice(0, 200) || null);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
