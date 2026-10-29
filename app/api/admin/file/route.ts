import { NextRequest, NextResponse } from 'next/server';
import { readLocal } from '@/lib/storage';
import { currentStaff } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// เปิดไฟล์ที่เก็บในเครื่อง (ใช้ตอน dev ที่ยังไม่ต่อ Supabase Storage) · พนักงานเท่านั้น
export async function GET(req: NextRequest) {
  if (!(await currentStaff())) return new NextResponse('forbidden', { status: 403 });
  const b = req.nextUrl.searchParams.get('b') || '', p = req.nextUrl.searchParams.get('p') || '';
  if (!['slips', 'vaccines', 'photos'].includes(b)) return new NextResponse('bad bucket', { status: 400 });
  try {
    const data = await readLocal(b, p);
    const type = p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return new NextResponse(new Uint8Array(data), { headers: { 'content-type': type, 'cache-control': 'private, no-store' } });
  } catch {
    return new NextResponse('not found', { status: 404 });
  }
}
