import { NextRequest, NextResponse } from 'next/server';
import { getOrder } from '@/lib/orders';
import { currentCustomer } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const customer = await currentCustomer();
  if (!customer) return NextResponse.json({ error: 'no_login', message: 'เปิดหน้านี้ผ่าน LINE ของร้าน' }, { status: 401 });
  const o = await getOrder(customer, (await params).code);
  if (!o) return NextResponse.json({ error: 'not_found', message: 'ไม่พบการจองนี้' }, { status: 404 });
  return NextResponse.json(o);
}
