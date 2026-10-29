import 'server-only';

// ส่งอีเมลแจ้งร้านผ่าน Resend (ตั้ง EMAIL_API_KEY + EMAIL_FROM ที่ยืนยันโดเมนแล้ว)
export const emailReady = () => !!(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail(to: string[], subject: string, text: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.EMAIL_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
  });
  if (!r.ok) throw new Error(`email ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
