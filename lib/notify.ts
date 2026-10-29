import 'server-only';
import type { TransactionSql } from 'postgres';
import { sql } from './db';
import { pushMessage } from './line';
import { emailReady, sendEmail } from './email';
import { calendarReady, deleteEvent, eventId, insertEvent, patchEvent } from './gcal';
import { baht, thDate } from './thaidate';
import { flexCard, liffUrl, type Card } from './flex';

type Tx = TransactionSql<{}>;
export type Template = 'paid' | 'slip_rejected' | 'reminder' | 'new_booking' | 'slip_review' | 'cancelled' | 'groom_done' | 'confirm'
  | 'vaccine_ok' | 'vaccine_rejected' | 'vaccine_review' | 'delete_request' | 'rescheduled';
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

type Job = { id: number; order_code: string | null; booking_code: string | null; pet_code: string | null; customer_code: string | null; channel: Channel; template: Template; payload: Record<string, unknown> };

// รายการจองที่เกี่ยวกับงานนี้
async function bookingsOf(j: Job) {
  return sql`
    select k.code, k.order_code, k.business_code, b.name as biz, b.color, b.booking_type, b.calendar_id, k.status, k.calendar_event_id, k.price,
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

// ร้านปิดข้อความบางแบบได้ที่ ตั้งค่า → ข้อความ LINE
const MSG_KEY: Partial<Record<Template, string>> = {
  paid: 'msg_paid', reminder: 'msg_reminder', slip_rejected: 'msg_slip_rejected', groom_done: 'msg_groom_done',
  cancelled: 'msg_cancelled', vaccine_ok: 'msg_vaccine', vaccine_rejected: 'msg_vaccine', rescheduled: 'msg_rescheduled',
};
async function lineFor(j: Job): Promise<{ to: string; text: string; card?: Card } | 'skip'> {
  const key = MSG_KEY[j.template];
  if (key) { const [o] = await sql`select value from settings where key = ${key}`; if (o?.value === 'off') return 'skip'; }
  const name = await shopName();
  if (j.pet_code) {
    const [p] = await sql`select p.code, p.name, c.line_user_id from pets p join customers c on c.code = p.customer_code where p.code = ${j.pet_code}`;
    if (!p?.line_user_id) throw new Error('ลูกค้าไม่มี LINE userId');
    const ok = j.template === 'vaccine_ok';
    const text = ok ? `${name}: วัคซีนของ${p.name}ผ่านการตรวจแล้ว ✅ จองสระและ Pet hotel ได้เลย`
                    : `${name}: วัคซีนของ${p.name}ยังไม่ผ่าน — ${j.payload.reason ?? ''}\nส่งรูปใหม่ได้ที่เมนู "น้องของฉัน"`;
    const url = liffUrl(ok ? '/' : `/me/pets/${p.code}`);
    return { to: p.line_user_id, text, card: {
      head: `${name} · สมุดวัคซีน`, headColor: ok ? '#1E7B4A' : '#B8262E',
      title: ok ? `วัคซีนของ${p.name}ผ่านแล้ว` : `วัคซีนของ${p.name}ยังไม่ผ่าน`,
      body: ok ? 'จองสระและ Pet hotel ได้เลย' : `${j.payload.reason ?? ''} · ส่งรูปใหม่ได้`,
      button: url ? { label: ok ? 'จองบริการ' : 'ส่งรูปใหม่', url } : undefined } };
  }
  // ข้อความทั่วไปไม่แสดงรายการที่ยกเลิก/หมดเวลาแล้ว (ยกเว้นแจ้งยกเลิก)
  const rows = (await bookingsOf(j)).filter((r) => j.template === 'cancelled' || !['cancelled', 'expired'].includes(r.status));
  const [c] = await sql`select c.line_user_id, o.status, o.code, o.total, o.due_now from customers c join orders o on o.customer_code = c.code
                        where o.code = coalesce(${j.order_code}, (select order_code from bookings where code = ${j.booking_code}))`;
  if (!c?.line_user_id) throw new Error('ลูกค้าไม่มี LINE userId');
  // เตือนก่อนวัน: ส่งเฉพาะที่ยังยืนยันอยู่
  if (j.template === 'reminder' && (c.status !== 'paid' || rows.every((r) => r.status !== 'confirmed'))) return 'skip';
  const list = rows.map((r) => `• ${r.biz} ${r.item}${r.pets ? ' · ' + r.pets : ''}\n  ${thDate(r.d)} ${r.t} (${r.code})`).join('\n');
  const items = rows.map((r) => ({ business: r.business_code, color: r.color, type: r.booking_type, biz: `${r.biz} · ${r.code}`, title: `${r.item}${r.pets ? ' · ' + r.pets : ''}`, when: `${thDate(r.d)} · ${r.t}` }));
  const url = liffUrl(`/me/b/${c.code}`);
  const btn = (label: string, path?: string) => { const u = path ? liffUrl(path) : url; return u ? { label, url: u } : undefined; };
  const old = typeof j.payload.old === 'string' ? `${thDate(j.payload.old.slice(0, 10))} ${j.payload.old.slice(11, 16)}` : '';
  const T: Partial<Record<Template, [string, Card]>> = {
    paid: [`${name}: ร้านตรวจสลิปแล้ว การจองยืนยันเรียบร้อย ✅\n${list}`,
      { head: `${name} · ยืนยันการจอง`, headColor: '#1E7B4A', title: 'จองเรียบร้อย ✅', items,
        rows: [['ชำระแล้ว', baht(Number(c.due_now))], ...(Number(c.total) > Number(c.due_now) ? [['จ่ายที่ร้าน', baht(Number(c.total) - Number(c.due_now))] as [string, string]] : [])], button: btn('ดูการจอง') }],
    slip_rejected: [`${name}: สลิปยังไม่ผ่าน — ${j.payload.reason ?? ''}\nแนบสลิปใหม่ได้ที่เมนู "การจองของฉัน"\n${list}`,
      { head: `${name} · ตรวจสลิป`, headColor: '#B8262E', title: 'สลิปยังไม่ผ่าน', body: String(j.payload.reason ?? ''), items, button: btn('แนบสลิปใหม่', `/pay/${c.code}`) }],
    reminder: [`${name}: เตือนการจองที่ใกล้ถึง ⏰\n${list}`,
      { head: `${name} · เตือนก่อนถึงวัน`, title: 'ใกล้ถึงวันแล้ว ⏰', items, button: btn('ดูรายละเอียด') }],
    cancelled: [`${name}: ยกเลิกการจองแล้ว${j.payload.reason ? ' — ' + j.payload.reason : ''}\n${list}\nเรื่องเงินมัดจำเป็นไปตามเงื่อนไขการยกเลิก ทักแชทร้านได้`,
      { head: `${name} · ยกเลิกการจอง`, headColor: '#B8262E', title: 'ยกเลิกการจองแล้ว', body: `${j.payload.reason ? j.payload.reason + ' · ' : ''}เงินมัดจำเป็นไปตามเงื่อนไขการยกเลิก ทักแชทร้านได้`, items }],
    groom_done: [`${name}: ${rows[0]?.pets || 'น้อง'} อาบน้ำ/แต่งขนเสร็จแล้ว 🐾 มารับได้เลย`,
      { head: `${name} · Grooming`, headColor: '#E8444C', title: `${rows[0]?.pets || 'น้อง'} พร้อมกลับบ้านแล้ว 🐾`, body: 'อาบน้ำ/แต่งขนเสร็จแล้ว มารับได้เลย', items }],
    rescheduled: [`${name}: ร้านเลื่อนวันให้แล้ว${old ? ` (เดิม ${old})` : ''}\n${list}`,
      { head: `${name} · เลื่อนวัน`, title: 'เลื่อนวันเรียบร้อย', body: old ? `วันเดิม ${old}` : undefined, items, button: btn('ดูการจอง') }],
  };
  const m = T[j.template];
  if (!m) return 'skip';
  return { to: c.line_user_id, text: m[0], card: m[1] };
}

async function emailFor(j: Job): Promise<{ subject: string; text: string } | 'skip'> {
  const name = await shopName();
  if (j.template === 'delete_request') {
    const [c] = await sql`select display_name, phone from customers where code = ${j.customer_code}`;
    return { subject: `[${name}] คำขอลบข้อมูล · ${c?.display_name ?? ''}`, text: `${c?.display_name ?? ''}${c?.phone ? ' · ' + c.phone : ''} (${j.customer_code}) ขอลบข้อมูลส่วนตัว\nเคลียร์การจองที่ค้างแล้วลบข้อมูล และแจ้งลูกค้าทางแชท` };
  }
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
    } else if (j.template === 'rescheduled' && r.calendar_event_id) {
      await patchEvent(r.calendar_id, r.calendar_event_id, { start: r.s_iso, end: r.e_iso });
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
    returning n.id, n.order_code, n.booking_code, n.pet_code, n.customer_code, n.channel, n.template, n.payload`;
  let sent = 0, failed = 0, skipped = 0;
  for (const j of jobs) {
    try {
      let done: 'sent' | 'skip' = 'sent';
      if (j.channel === 'line_push') {
        const m = await lineFor(j);
        if (m === 'skip') done = 'skip';
        else await pushMessage(m.to, [m.card ? { type: 'flex', altText: m.text.slice(0, 380), contents: flexCard(m.card) } : { type: 'text', text: m.text }]);
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
