import 'server-only';

// ตัวตนลูกค้า
// ขั้นที่ 3: ตรวจ LINE ID token จาก LIFF แล้วหา customers.line_user_id
// ตอนนี้ (โหมดเดโม่) ใช้ลูกค้าสมมติจาก env เท่านั้น ห้ามเปิด DEMO_MODE บนระบบจริง
export async function currentCustomer(): Promise<string | null> {
  if (process.env.DEMO_MODE === '1' && process.env.DEMO_CUSTOMER) return process.env.DEMO_CUSTOMER;
  return null;
}
