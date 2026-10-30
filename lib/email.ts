import 'server-only';

// ส่งอีเมล 2 ทาง (เลือกอย่างใดอย่างหนึ่ง)
// 1) Apps Script ของ Codera (ส่งจาก Gmail ของบัญชีที่ deploy) · ตั้ง EMAIL_RELAY_URL + EMAIL_RELAY_KEY · ดู tools/email-relay.gs
// 2) Resend (ส่งจากโดเมนร้าน) · ตั้ง EMAIL_API_KEY + EMAIL_FROM ที่ยืนยันโดเมนแล้ว
const relay = () => !!(process.env.EMAIL_RELAY_URL && process.env.EMAIL_RELAY_KEY);
const resend = () => !!(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM);
export const emailReady = () => relay() || resend();

export async function sendEmail(to: string[], subject: string, text: string) {
  if (relay()) {
    // Apps Script web app ตอบ 302 ไปหน้าผล · fetch ตามให้เอง
    const r = await fetch(process.env.EMAIL_RELAY_URL!, {
      method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'follow',
      body: JSON.stringify({ key: process.env.EMAIL_RELAY_KEY, to, subject, text, name: process.env.EMAIL_FROM_NAME || '' }),
    });
    const body = await r.text();
    let j: { ok?: boolean; error?: string } = {};
    try { j = JSON.parse(body); } catch { /* หน้า HTML = deploy ผิดสิทธิ์ */ }
    if (!r.ok || !j.ok) throw new Error(`email relay ${r.status}: ${(j.error || body).slice(0, 200)}`);
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.EMAIL_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
  });
  if (!r.ok) throw new Error(`email ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
