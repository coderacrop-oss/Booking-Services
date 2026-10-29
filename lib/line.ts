import 'server-only';

// LINE Login: ตรวจ ID token จาก LIFF กับ LINE โดยตรง (ไม่เชื่อข้อมูลจากหน้าเว็บ)
export async function verifyIdToken(idToken: string): Promise<{ sub: string; name: string }> {
  const client = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!client) throw new Error('ยังไม่ได้ตั้ง LINE_LOGIN_CHANNEL_ID');
  const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: client }),
  });
  const j = (await r.json()) as { sub?: string; name?: string; error_description?: string };
  if (!r.ok || !j.sub) throw new Error(j.error_description || 'ยืนยันตัวตน LINE ไม่สำเร็จ');
  return { sub: j.sub, name: j.name || '' };
}

export type LineMessage = { type: 'text'; text: string } | Record<string, unknown>;

// ส่งข้อความหาลูกค้า (push ใช้โควตาข้อความของ OA · ใช้เฉพาะแจ้งผลตรวจสลิป/เตือนก่อนถึงวัน)
export async function pushMessage(to: string, messages: LineMessage[]): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN');
  // LINE_API_BASE ใช้ตอนทดสอบกับเซิร์ฟเวอร์จำลองเท่านั้น
  const r = await fetch(`${process.env.LINE_API_BASE || 'https://api.line.me'}/v2/bot/message/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ to, messages }),
  });
  if (!r.ok) throw new Error(`LINE push ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
