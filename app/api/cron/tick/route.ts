import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { sendDue } from '@/lib/notify';

export const dynamic = 'force-dynamic';

// รอบตั้งเวลา: ปล่อยที่ที่หมดเวลา + ส่ง LINE ที่ถึงเวลา
// เรียกด้วย header  Authorization: Bearer <CRON_SECRET>  (Vercel Cron ใส่ให้เองเมื่อตั้ง CRON_SECRET)
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new NextResponse('unauthorized', { status: 401 });
  const [{ expired }] = await sql`select expire_holds() as expired`;
  const notify = await sendDue(50);
  return NextResponse.json({ expired, notify });
}
