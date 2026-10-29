import { NextRequest, NextResponse, after } from 'next/server';
import { sendDue } from '@/lib/notify';
import { fail } from '@/lib/api';
import { bookingAction } from '@/lib/orders';
import { currentStaff } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// POST { action: check_in | check_out | attend | start | finish | no_show | cancel, reason? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // ส่งอีเมล/ปฏิทิน/LINE ที่ค้างหลังตอบลูกค้าแล้ว (ไม่ทำให้หน้าเว็บช้า)
  after(() => sendDue(10).catch(() => undefined));
  try {
    const s = await currentStaff();
    if (!s) return NextResponse.json({ message: 'เข้าสู่ระบบพนักงานก่อน' }, { status: 401 });
    const b = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
    await bookingAction(s, (await params).code, String(b.action || ''), b.reason?.slice(0, 200) || null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
