import { NextRequest, NextResponse, after } from 'next/server';
import { BookingError } from '@/lib/booking';
import { fail } from '@/lib/api';
import { sendDue } from '@/lib/notify';
import { addVaccine } from '@/lib/pets';
import { currentCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

// multipart: vaccine (ชื่อวัคซีน) · expires_on (YYYY-MM-DD) · file (รูป/PDF)
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  after(() => sendDue(10).catch(() => undefined));
  try {
    const c = await currentCustomer();
    if (!c) throw new BookingError('no_login', 'เปิดหน้านี้ผ่าน LINE ของร้าน');
    const f = await req.formData().catch(() => null);
    const file = f?.get('file');
    if (!file || typeof file === 'string') throw new BookingError('no_file', 'เลือกรูปสมุดวัคซีน');
    await addVaccine(c, (await params).code, String(f?.get('vaccine') || ''), String(f?.get('expires_on') || ''), Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
