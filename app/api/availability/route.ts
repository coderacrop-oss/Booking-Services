import { NextRequest, NextResponse } from 'next/server';
import { sessionAvailability, slotAvailability, stayAvailability } from '@/lib/booking';
import { BookingError } from '@/lib/booking';
import { CODE, DATE, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

// GET /api/availability?type=stay&biz=pet_hotel&from=2026-11-21&to=2026-11-22&pets=1&guests=2&maxkg=6
// GET /api/availability?type=session&biz=pool&date=2026-11-21&kg=3.2,9
// GET /api/availability?type=slot&biz=grooming&date=2026-11-21&service=G-BATH&addons=A-NAIL&tier=S
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const need = (k: string, re: RegExp) => {
    const v = q.get(k) || '';
    if (!re.test(v)) throw new BookingError('bad_param', `พารามิเตอร์ ${k} ไม่ถูกต้อง`);
    return v;
  };
  try {
    const biz = need('biz', CODE);
    const type = q.get('type');
    if (type === 'stay') {
      const units = await stayAvailability(biz, need('from', DATE), need('to', DATE), Number(q.get('pets') || 0),
        q.get('guests') ? Number(q.get('guests')) : null, q.get('maxkg') ? Number(q.get('maxkg')) : null);
      return NextResponse.json({ units });
    }
    if (type === 'session') {
      const kg = (q.get('kg') || '').split(',').filter(Boolean).map(Number).filter((n) => n > 0 && n < 150);
      return NextResponse.json({ sessions: await sessionAvailability(biz, need('date', DATE), kg) });
    }
    if (type === 'slot') {
      const addons = (q.get('addons') || '').split(',').filter((x) => CODE.test(x));
      const tier = q.get('tier');
      return NextResponse.json(await slotAvailability(biz, need('date', DATE), need('service', CODE), addons,
        tier && CODE.test(tier) ? tier : null));
    }
    throw new BookingError('bad_param', 'type ต้องเป็น stay, session หรือ slot');
  } catch (e) {
    return fail(e);
  }
}
