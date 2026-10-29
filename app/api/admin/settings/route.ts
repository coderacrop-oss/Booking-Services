import { NextRequest, NextResponse } from 'next/server';
import { fail } from '@/lib/api';
import { applySetting } from '@/lib/settingsAdmin';
import { currentStaff } from '@/lib/staff';

export const dynamic = 'force-dynamic';

// POST { kind: 'unit.save' | 'session.save' | ... , ...ข้อมูล }
export async function POST(req: NextRequest) {
  try {
    const s = await currentStaff();
    if (!s) return NextResponse.json({ message: 'เข้าสู่ระบบพนักงานก่อน' }, { status: 401 });
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ ok: true, ...(await applySetting(s, String(b.kind || ''), b)) });
  } catch (e) { return fail(e); }
}
