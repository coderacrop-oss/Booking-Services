import 'server-only';
import type { TransactionSql } from 'postgres';
import { sql } from './db';
import { pushMessage } from './line';
import { emailReady, sendEmail } from './email';
import { calendarReady, deleteEvent, eventId, insertEvent } from './gcal';
import { baht, thDate } from './thaidate';

type Tx = TransactionSql<{}>;
export type Template = 'paid' | 'slip_rejected' | 'reminder' | 'new_booking' | 'slip_review' | 'cancelled' | 'groom_done' | 'confirm'
  | 'vaccine_ok' | 'vaccine_rejected' | 'vaccine_review';
type Channel = 'line_push' | 'email' | 'calendar';

// ใส่คิว (ในธุรกรรมเดียวกับการเปลี่ยนสถานะ) · ส่งจริงทีหลัง ส่งพลาดลองใหม่ได้
export async function enqueue(tx: Tx, n: { order?: string; booking?: string; pet?: string; channel: Channel; template: Template; payload?: object; runAfter?: string }) {
  const [r] = await tx`
    insert into notifications (order_code, booking_code, pet_code, channel, template, payload, run_after)
    values (${n.order ?? null}, ${n.booking ?? null}, ${n.pet ?? null}, ${n.channel}, ${n.template},
            ${tx.json((n.payload ?? {}) as never)}, coalesce(${n.runAfter ?? null}::timestamptz, now()))
    returning id`;
  return r.id as number;
}

type Job = { id: number; order_code: string | null; booking_code: string | null; pet_code: string | null; channel: Channel; template: Template; payload: Record<string, unknown> };

// รายการจองที่เกี่ยวกับงานนี้
async function bookingsOf(j: Job) {
  return sql`
    select k.code, k.business_code, b.name as biz, b.calendar_id, k.status, k.calendar_event_id, k.price,
           coalesce(u.name, sv.name, '') as item, c.display_name as customer, c.phone,
           to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD') as d, to_char(k.start_at at time zone 'Asia/Bangkok', 'HH24:MI') as t,
           to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS') as s_iso,
           to_char(k.end_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS') as e_iso,
           coalesce((select string_agg(p.name, ', ') from booking_pets bp join pets p on p.code = bp.pet_code where bp.booking_code = k.code), '') as pets
    from bookings k join businesses b on b.code = k.business_code join orders o on o.code = k.order_code
    join customers c on c.code = o.customer_code
    left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code
    where (${j.order_code}::text is not null and k.order_code = ${j.order_code}) or k.code = ${j.booking_code}
    order by k.start_at`;
}

async function shopName() {
  const [r] = await sql`select value from settings where key = 'shop_name'`;
  return r?.value ?? 'ร้าน';
}

async function lineFor(j: Job): Promise<{ to: string; text: string } | 'skip'> {
  const name = await shopName();
  if (j.pet_code) {
    const [p] = await sql`select p.name, c.line_user_id from pets p join customers c on c.code = p.customer_code where p.code = ${j.pet_code}`;
    if (!p?.line_user_id) throw new Error('ลูกค้าไม่มี LINE userId');
    const text = j.template === 'vaccine_ok'
      ? `${name}: วัคซีนของ${p.name}ผ่านการตรวจแล้ว ✅ จองสระและ Pet hotel ได้เลย`
      : `${name}: วัคซีนของ${p.name}ยังไม่ผ่าน — ${j.payload.reason ?? ''}\nส่งรูปใหม่ได้ที่เมนู "น้องของฉัน"`;
    return { to: p.line_user_id, text };
  }
  // ข้อความทั่วไปไม่แสดงรายการที่ยกเลิก/หมดเวลาแล้ว (ยกเว้นแจ้งยกเลิก)
  const rows = (await bookingsOf(j)).filter((r) => j.template === 'cancelled' || !['cancelled', 'expired'].includes(r.status));
  const [c] = await sql`select c.line_user_id, o.status from customers c join orders o on o.customer_code = c.code
                        where o.code = coalesce(${j.order_code}, (select order_code from bookings where code = ${j.booking_code}))`;
  if (!c?.line_user_id) throw new Error('ลูกค้าไม่มี LINE userId');
  // เตือนก่อนวัน: ส่งเฉพาะที่ยังยืนยันอยู่
  if (j.template === 'reminder' && (c.status !== 'paid' || rows.every((r) => r.status !== 'confirmed'))) return 'skip';
  const list = rows.map((r) => `• ${r.biz} ${r.item}${r.pets ? ' · ' + r.pets : ''}\n  ${thDate(r.d)} ${r.t} (${r.code})`).join('\n');
  const T: Partial<Record<Template, string>> = {
    paid: `${name}: ร้านตรวจสลิปแล้ว การจองยืนยันเรียบร้อย ✅\n${list}`,
    slip_rejected: `${name}: สลิปยังไม่ผ่าน — ${j.payload.reason ?? ''}\nแนบสลิปใหม่ได้ที่เมนู "การจองของฉัน"\n${list}`,
    reminder: `${name}: เตือนการจองที่ใกล้ถึง ⏰\n${list}`,
    cancelled: `${name}: ยกเลิกการจองแล้ว${j.payload.reason ? ' — ' + j.payload.reason : ''}\n${list}\nเรื่องเงินมัดจำเป็นไปตามเงื่อนไขการยกเลิก ทักแชทร้านได้`,
    groom_done: `${name}: ${rows[0]?.pets || 'น้อง'} อาบน้ำ/แต่งขนเสร็จแล้ว 🐾 มารับได้เลย`,
  };
  const text = T[j.template];
  if (!text) return 'skip';
  return { to: c.line_user_id, text };
}

async function emailFor(j: Job): Promise<{ subject: string; text: string } | 'skip'> {
  const name = await shopName();
  if (j.template === 'vaccine_review') {
    const [p] = await sql`select p.name, c.display_name from pets p join customers c on c.code = p.customer_code where p.code = ${j.pet_code}`;
    return { subject: `[${name}] วัคซีนรอตรวจ · ${p?.name ?? ''}`, text: `${p?.display_name ?? ''} ส่งรูปวัคซีนของ${p?.name ?? 'น้อง'}\nเปิดหลังบ้าน → วัคซีน เพื่อตรวจ` };
  }
  const rows = await bookingsOf(j);
  if (!rows.length) return 'skip';
  const list = rows.map((r) => `- ${r.biz} · ${r.item}${r.pets ? ' · ' + r.pets : ''} · ${thDate(r.d)} ${r.t} · ${baht(Number(r.price))} (${r.code})`).join('\n');
  const who = `${rows[0].customer}${rows[0].phone ? ' · ' + rows[0].phone : ''}`;
  if (j.template === 'new_booking') return { subject: `[${name}] จองใหม่ · ${who}`, text: `${who} จองแล้ว รอแนบสลิป\n${list}` };
  if (j.template === 'slip_review') return { subject: `[${name}] สลิปรอตรวจ · ${who}`, text: `${who} แนบสลิปแล้ว\n${list}\nเปิดหลังบ้าน → สลิป เพื่อตรวจ` };
  return 'skip';
}

async function runCalendar(j: Job) {
  for (const r of await bookingsOf(j)) {
    if (j.booking_code && r.code !== j.booking_code) continue;
    if (!r.calendar_id) continue;               // ธุรกิจนี้ยังไม่ตั้งปฏิทิน
    if (j.template === 'cancelled') {
      if (r.calendar_event_id) await deleteEvent(r.calendar_id, r.calendar_event_id);
      await sql`update bookings set calendar_event_id = null where code = ${r.code}`;
    } else if (r.status !== 'cancelled' && r.status !== 'expired') {
      const id = await insertEvent(r.calendar_id, {
        id: eventId(r.code),
        summary: `${r.item}${r.pets ? ' · ' + r.pets : ''} (${r.code})`,
        description: `${r.customer}${r.phone ? ' · ' + r.phone : ''}\n${r.biz} · ${baht(Number(r.price))}`,
        start: r.s_iso, end: r.e_iso,
      });
      await sql`update bookings set calendar_event_id = ${id} where code = ${r.code}`;
    }
  }
}

// ช่องทางที่ตั้งค่าแล้วเท่านั้นที่ส่ง (ยังไม่ตั้ง = ค้างในคิวไว้ก่อน)
function readyChannels(): Channel[] {
  const out: Channel[] = [];
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) out.push('line_push');
  if (emailReady()) out.push('email');
  if (calendarReady()) out.push('calendar');
  return out;
}

// ส่งรายการที่ถึงเวลา (รอบตั้งเวลา หรือหลังพนักงานกดทันที)
export async function sendDue(limit = 20, onlyId?: number): Promise<{ sent: number; failed: number; skipped: number }> {
  const ch = readyChannels();
  if (!ch.length) return { sent: 0, failed: 0, skipped: 0 };
  const jobs = await sql<Job[]>`
    update notifications n set tries = tries + 1
    where n.id in (select id from notifications
                   where status = 'queued' and run_after <= now() and channel in ${sql(ch)}
                     and (${onlyId ?? null}::bigint is null or id = ${onlyId ?? null})
                   order by run_after limit ${limit} for update skip locked)
    returning n.id, n.order_code, n.booking_code, n.pet_code, n.channel, n.template, n.payload`;
  let sent = 0, failed = 0, skipped = 0;
  for (const j of jobs) {
    try {
      let done: 'sent' | 'skip' = 'sent';
      if (j.channel === 'line_push') {
        const m = await lineFor(j);
        if (m === 'skip') done = 'skip'; else await pushMessage(m.to, [{ type: 'text', text: m.text }]);
      } else if (j.channel === 'email') {
        const [to] = await sql`select value from settings where key = 'notify_email'`;
        const m = await emailFor(j);
        if (m === 'skip' || !to?.value) done = 'skip';
        else await sendEmail(String(to.value).split(',').map((x) => x.trim()).filter(Boolean), m.subject, m.text);
      } else {
        await runCalendar(j);
      }
      await sql`update notifications set status = 'sent', sent_at = now(),
                  last_error = ${done === 'skip' ? 'ข้าม: ไม่ต้องส่ง' : null} where id = ${j.id}`;
      if (done === 'skip') skipped++; else sent++;
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
  return { sent, failed, skipped };
}
