import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { BookingError } from '@/lib/booking';
import { fail } from '@/lib/api';
import { canSee, currentStaff } from '@/lib/staff';
import { imageType, putFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// อัปโหลดรูปห้อง/บ้าน/บริการ (multipart: owner = รหัส, file = รูป ≤ 5 MB)
export async function POST(req: NextRequest) {
  try {
    const s = await currentStaff();
    if (!s) return NextResponse.json({ message: 'เข้าสู่ระบบพนักงานก่อน' }, { status: 401 });
    const f = await req.formData().catch(() => null);
    const owner = String(f?.get('owner') || '');
    const file = f?.get('file');
    if (!file || typeof file === 'string') throw new BookingError('no_file', 'เลือกรูป');
    const [o] = await sql`select 'unit' as t, business_code from units where code = ${owner}
                          union all select 'service', business_code from services where code = ${owner}`;
    if (!o) throw new BookingError('not_found', 'ไม่พบรายการ');
    if (s.role === 'staff' || !canSee(s, o.business_code)) throw new BookingError('forbidden', 'ไม่มีสิทธิ์');
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) throw new BookingError('too_big', 'รูปใหญ่เกิน 5 MB');
    const type = imageType(buf);
    if (!type) throw new BookingError('not_image', 'แนบได้เฉพาะ JPG PNG WEBP');
    const path = await putFile('photos', `${owner}/${Date.now()}.${type.split('/')[1]}`, buf, type);
    const [{ n }] = await sql`select count(*)::int as n from unit_photos where coalesce(unit_code, service_code) = ${owner}`;
    await sql`insert into unit_photos (unit_code, service_code, file, is_cover, sort)
              values (${o.t === 'unit' ? owner : null}, ${o.t === 'service' ? owner : null}, ${path}, ${n === 0}, ${n + 1})`;
    return NextResponse.json({ ok: true, file: path });
  } catch (e) { return fail(e); }
}
