import 'server-only';
import type { TransactionSql } from 'postgres';
import { sql } from './db';
import { pushMessage } from './line';
import { baht, thDate } from './thaidate';

type Tx = TransactionSql<{}>;
export type Template = 'paid' | 'slip_rejected' | 'reminder' | 'new_booking' | 'slip_review' | 'cancelled' | 'groom_done' | 'confirm';

// ใส่คิว (ในธุรกรรมเดียวกับการเปลี่ยนสถานะ) · ส่งจริงทีหลัง ส่งพลาดลองใหม่ได้
export async function enqueue(tx: Tx, n: { order?: string; booking?: string; channel: 'line_push' | 'email' | 'calendar'; template: Template; payload?: object; runAfter?: string }) {
  const [r] = await tx`
    insert into notifications (order_code, booking_code, channel, template, payload, run_after)
    values (${n.order ?? null}, ${n.booking ?? null}, ${n.channel}, ${n.template}, ${tx.json((n.payload ?? {}) as never)},
            coalesce(${n.runAfter ?? null}::timestamptz, now()))
    returning id`;
  return r.id as number;
}

// ข้อความ LINE ตามแบบ
async function lineText(template: Template, orderCode: string | null, bookingCode: string | null, payload: Record<string, unknown>) {
  const [shop] = await sql`select value from settings where key = 'shop_name'`;
  const rows = await sql`
    select k.code, b.name as biz, coalesce(u.name, sv.name, '') as item,
           to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as d, to_char(k.start_at at time zone 'Asia/Bangkok', 'HH24:MI') as t
    from bookings k join businesses b on b.code = k.business_code
    left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code
    where (${orderCode}::text is not null and k.order_code = ${orderCode}) or k.code = ${bookingCode}
    order by k.start_at`;
  const list = rows.map((r) => `• ${r.biz} ${r.item} ${thDate(r.d)} ${r.t} (${r.code})`).join('\n');
  const name = shop?.value ?? 'ร้าน';
  switch (template) {
    case 'paid': return `${name}: ร้านตรวจสลิปแล้ว การจองยืนยันเรียบร้อย ✅\n${list}`;
    case 'slip_rejected': return `${name}: สลิปยังไม่ผ่าน — ${payload.reason ?? ''}\nแนบสลิปใหม่ได้ในเมนู "การจองของฉัน"\n${list}`;
    case 'reminder': return `${name}: เตือนการจองพรุ่งนี้ ⏰\n${list}`;
    default: return `${name}\n${list}`;
  }
}

// ส่งรายการที่ถึงเวลา (เรียกจากรอบตั้งเวลา หรือหลังอนุมัติสลิปทันที)
export async function sendDue(limit = 20, onlyId?: number): Promise<{ sent: number; failed: number }> {
  const jobs = await sql`
    update notifications n set tries = tries + 1
    where n.id in (select id from notifications
                   where status = 'queued' and run_after <= now() and channel = 'line_push'
                     and (${onlyId ?? null}::bigint is null or id = ${onlyId ?? null})
                   order by run_after limit ${limit} for update skip locked)
    returning n.id, n.order_code, n.booking_code, n.template, n.payload, n.tries`;
  let sent = 0, failed = 0;
  for (const j of jobs) {
    try {
      const [c] = await sql`
        select c.line_user_id from customers c join orders o on o.customer_code = c.code
        left join bookings k on k.order_code = o.code
        where o.code = ${j.order_code} or k.code = ${j.booking_code} limit 1`;
      if (!c?.line_user_id) throw new Error('ลูกค้าไม่มี LINE userId');
      const [st] = await sql`select status from orders o where o.code = coalesce(${j.order_code}, (select order_code from bookings where code = ${j.booking_code}))`;
      // เตือนก่อนถึงวัน: ส่งเฉพาะที่ยังยืนยันอยู่
      if (j.template === 'reminder' && st?.status !== 'paid') {
        await sql`update notifications set status = 'sent', last_error = 'ข้าม: การจองไม่อยู่ในสถานะยืนยัน', sent_at = now() where id = ${j.id}`;
        continue;
      }
      await pushMessage(c.line_user_id, [{ type: 'text', text: await lineText(j.template, j.order_code, j.booking_code, j.payload) }]);
      await sql`update notifications set status = 'sent', sent_at = now(), last_error = null where id = ${j.id}`;
      sent++;
    } catch (e) {
      const msg = (e as Error).message.slice(0, 300);
      // ลองใหม่ห่างขึ้นเรื่อย ๆ · ครบ 5 ครั้งหยุด
      await sql`update notifications set last_error = ${msg},
                  status = case when tries >= 5 then 'failed' else 'queued' end,
                  run_after = now() + make_interval(mins => power(2, tries)::int)
                where id = ${j.id}`;
      failed++;
    }
  }
  return { sent, failed };
}

export { baht };
