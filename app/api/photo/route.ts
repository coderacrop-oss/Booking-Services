import { NextRequest, NextResponse } from 'next/server';
import { readLocal } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// รูปสาธารณะตอน dev (ยังไม่ต่อ Supabase Storage) · บนระบบจริงรูปเสิร์ฟจาก bucket photos ตรง
export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return new NextResponse('not found', { status: 404 });
  const p = req.nextUrl.searchParams.get('p') || '';
  try {
    const data = await readLocal('photos', p);
    const type = p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return new NextResponse(new Uint8Array(data), { headers: { 'content-type': type, 'cache-control': 'public, max-age=3600' } });
  } catch {
    return new NextResponse('not found', { status: 404 });
  }
}
