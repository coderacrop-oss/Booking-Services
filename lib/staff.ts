import 'server-only';

// ตัวตนพนักงาน
// ขั้นที่ 3: LINE Login + ลิงก์เชิญ → staff.line_user_id
// ตอนนี้ (โหมดเดโม่) เข้าได้เฉพาะเมื่อ DEMO_MODE=1 · ห้ามเปิดบนระบบจริง
export async function currentStaff(): Promise<string | null> {
  if (process.env.DEMO_MODE === '1') return process.env.DEMO_STAFF || 'ST01';
  return null;
}
