import 'server-only';
import { sql } from './db';
import { demoMode, staffCookie } from './session';

export interface StaffUser { code: string; display_name: string; role: 'owner' | 'manager' | 'staff'; businesses: string[] }

// พนักงานที่ล็อกอินอยู่
// รอบถัดไป: LINE Login + ลิงก์เชิญ → ผูก staff.line_user_id แล้วตั้งคุกกี้
// โหมดเดโม่: ใช้ DEMO_STAFF (ห้ามเปิดบนระบบจริง)
export async function currentStaff(): Promise<StaffUser | null> {
  const code = (await staffCookie()) ?? (demoMode() ? process.env.DEMO_STAFF || 'ST01' : null);
  if (!code) return null;
  const [s] = await sql<StaffUser[]>`
    select code, display_name, role, businesses from staff where code = ${code} and invite_status <> 'removed'`;
  return s ?? null;
}

export function canSee(s: StaffUser, business: string) {
  return s.role === 'owner' || s.businesses.includes('all') || s.businesses.includes(business);
}
