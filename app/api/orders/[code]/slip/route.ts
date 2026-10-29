import { NextRequest, NextResponse, after } from 'next/server';
import { sendDue } from '@/lib/notify';
import { BookingError } from '@/lib/booking';
import { fail } from '@/lib/api';
import { attachSlip } from '@/lib/orders';
import { currentCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST multipart: slip = รูปสลิป
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // ส่งอีเมล/ปฏิทิน/LINE ที่ค้างหลังตอบลูกค้าแล้ว (ไม่ทำให้หน้าเว็บช้า)
  after(() => sendDue(10).catch(() => undefined));
  try {
    const customer = await currentCustomer();
    if (!customer) throw new BookingError('no_login', 'เปิดหน้านี้ผ่าน LINE ของร้าน');
    const form = await req.formData().catch(() => null);
    const f = form?.get('slip');
    if (!f || typeof f === 'string') throw new BookingError('no_file', 'เลือกรูปสลิปก่อน');
    return NextResponse.json(await attachSlip(customer, (await params).code, Buffer.from(await f.arrayBuffer())));
  } catch (e) {
    return fail(e);
  }
}
