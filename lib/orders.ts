import 'server-only';
import { sql } from './db';
import { BookingError, quote } from './booking';
import { enqueue, sendDue } from './notify';
import { imageType, putFile } from './storage';
import { todayTH } from './thaidate';
import { canSee, type StaffUser } from './staff';
import type { CartItem, OrderView } from './types';

// แปลง error จากฐานข้อมูลเป็นข้อความที่ลูกค้าอ่านเข้าใจ
function dbError(e: unknown): never {
  const err = e as { code?: string; message?: string };
  if (err.code === '23P01') throw new BookingError('just_taken', 'เพิ่งมีคนจองช่วงนี้ไป เลือกใหม่อีกครั้ง');
  const m = err.message || '';
  if (/session_full/.test(m)) throw new BookingError('session_full', 'รอบนี้เพิ่งเต็ม เลือกรอบอื่น');
  if (/vaccine_required/.test(m)) throw new BookingError('vaccine_required', 'น้องยังไม่มีวัคซีนที่ผ่านตรวจ');
  if (/size_mismatch/.test(m)) throw new BookingError('size_mismatch', 'ขนาดน้องไม่ตรงรอบ');
  if (/session_time_mismatch/.test(m)) throw new BookingError('session_day', 'รอบนี้ไม่เปิดวันที่เลือก');
  if (/too_many_pets|pet_too_big|too_many_guests/.test(m)) throw new BookingError('over_limit', 'เกินจำนวนที่รับได้');
  throw e;
}

async function setting(key: string, fallback: string) {
  const [r] = await sql`select value from settings where key = ${key}`;
  return r?.value ?? fallback;
}

// ---------- สร้างการจอง (กันที่ไว้ hold_minutes นาที) ----------
export async function createOrder(customer: string, items: CartItem[], acceptedPolicy: boolean) {
  if (!acceptedPolicy) throw new BookingError('policy', 'กรุณาอ่านและติ๊กยอมรับเงื่อนไขการจองและยกเลิก');
  await sql`select expire_holds()`;
  const q = await quote(customer, items);               // ตรวจทุกอย่างก่อน · ชนกันจริงฐานข้อมูลกันให้อีกชั้น
  const hold = Number(await setting('hold_minutes', '30')) || 30;
  const policy = await setting('policy_version', '');
  const free = q.due_now === 0;
  try {
    return await sql.begin(async (tx) => {
      const [{ code }] = await tx`select next_code('T', ${todayTH()}::date) as code`;
      await tx`insert into orders (code, customer_code, status, total, due_now, hold_until, policy_version, paid_at)
               values (${code}, ${customer}, ${free ? 'paid' : 'holding'}, ${q.total}, ${q.due_now},
                       ${free ? null : tx`now() + make_interval(mins => ${hold})`}, ${policy}, ${free ? tx`now()` : null})`;
      const codes: string[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i], qi = q.items[i];
        const [{ bk }] = await tx`select next_code(b.id_prefix, (${qi.start_at}::timestamptz at time zone 'Asia/Bangkok')::date) as bk
                                  from businesses b where b.code = ${it.business}`;
        const row = {
          code: bk, order_code: code, business_code: it.business, kind: it.kind,
          unit_code: it.kind === 'stay' ? it.unit : null,
          session_code: it.kind === 'session' ? it.session : null,
          service_code: it.kind === 'slot' ? it.service : null,
          addon_codes: it.kind === 'slot' ? it.addons : [],
          staff_code: it.kind === 'slot' ? it.staff : null,
          start_at: qi.start_at, end_at: qi.end_at,
          guests: it.kind === 'stay' ? it.guests ?? null : null,
          price: qi.price, status: free ? 'confirmed' : 'holding',
        };
        await tx`insert into bookings ${tx(row)}`;
        const pets = it.kind === 'slot' ? [it.pet] : it.pets;
        for (const p of pets) await tx`insert into booking_pets (booking_code, pet_code) values (${bk}, ${p})`;
        codes.push(bk);
      }
      await enqueue(tx, { order: code, channel: 'email', template: 'new_booking' });
      if (free) for (const bk of codes) await enqueue(tx, { booking: bk, channel: 'calendar', template: 'confirm' });
      return { order: code as string, bookings: codes, due_now: q.due_now, total: q.total, paid: free };
    });
  } catch (e) {
    dbError(e);
  }
}

// ---------- ทริปของลูกค้า ----------
export async function getOrder(customer: string, code: string): Promise<OrderView | null> {
  const [o] = await sql`
    select code, status, total, due_now, to_char(hold_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as hold_until,
           (status = 'holding' and hold_until < now()) as late,
           (select json_build_object('status', p.status, 'reason', p.reject_reason) from payments p
             where p.order_code = o.code order by p.created_at desc limit 1) as last_payment
    from orders o where o.code = ${code} and o.customer_code = ${customer}`;
  if (!o) return null;
  const items = await sql`
    select k.code, k.business_code, b.name as biz, k.status, k.price,
           to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as s,
           to_char(k.end_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as e,
           coalesce(u.name, sv.name, '') as item,
           coalesce((select string_agg(p.name, ', ') from booking_pets bp join pets p on p.code = bp.pet_code where bp.booking_code = k.code), '') as pets
    from bookings k join businesses b on b.code = k.business_code
    left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code
    where k.order_code = ${code} order by k.start_at`;
  return { ...o, items: [...items] } as unknown as OrderView;
}

export async function myOrders(customer: string) {
  await sql`select expire_holds()`;
  const rows = await sql`select code from orders where customer_code = ${customer} order by created_at desc limit 30`;
  return (await Promise.all(rows.map((r) => getOrder(customer, r.code)))).filter((x): x is OrderView => !!x);
}

// ---------- แนบสลิป ----------
export async function attachSlip(customer: string, code: string, file: Buffer) {
  if (file.length > 5 * 1024 * 1024) throw new BookingError('too_big', 'รูปใหญ่เกิน 5 MB');
  const type = imageType(file);
  if (!type) throw new BookingError('not_image', 'แนบได้เฉพาะรูป JPG PNG หรือ WEBP');
  await sql`select expire_holds()`;
  const [o] = await sql`select code, status, due_now from orders where code = ${code} and customer_code = ${customer}`;
  if (!o) throw new BookingError('not_found', 'ไม่พบการจองนี้');
  if (o.status === 'expired') throw new BookingError('expired', 'หมดเวลากันที่แล้ว จองใหม่อีกครั้ง');
  if (o.status !== 'holding') throw new BookingError('bad_status', 'การจองนี้แนบสลิปแล้ว');
  const ext = type.split('/')[1];
  const path = `${code}/${Date.now()}.${ext}`;
  await putFile('slips', path, file, type);
  return sql.begin(async (tx) => {
    // ล็อกทริปไว้ กันกดแนบซ้ำพร้อมกัน
    const [cur] = await tx`select status from orders where code = ${code} for update`;
    if (cur.status !== 'holding') throw new BookingError('bad_status', 'การจองนี้แนบสลิปแล้ว');
    const [{ pc }] = await tx`select next_code('PAY') as pc`;
    await tx`insert into payments (code, order_code, amount_due, slip_file) values (${pc}, ${code}, ${o.due_now}, ${path})`;
    await tx`update orders set status = 'pending_review' where code = ${code}`;
    await enqueue(tx, { order: code, channel: 'email', template: 'slip_review' });
    return { payment: pc as string };
  });
}

// ---------- พนักงานตรวจสลิป ----------
export async function reviewPayment(staffUser: StaffUser, payment: string, action: 'approve' | 'reject', amountSlip: number | null, reason: string | null) {
  const staff = staffUser.code;
  const remindH = Number(await setting('remind_hours_before', '24')) || 24;
  const hold = Number(await setting('hold_minutes', '30')) || 30;
  const pushIds: number[] = [];
  await sql.begin(async (tx) => {
    const [p] = await tx`select p.*, o.status as order_status from payments p join orders o on o.code = p.order_code
                         where p.code = ${payment} for update of p, o`;
    if (!p) throw new BookingError('not_found', 'ไม่พบสลิปนี้');
    if (p.status !== 'pending') throw new BookingError('done', 'สลิปนี้ตรวจไปแล้ว');
    const biz = await tx`select distinct business_code from bookings where order_code = ${p.order_code}`;
    if (!biz.some((b) => canSee(staffUser, b.business_code))) throw new BookingError('forbidden', 'ไม่มีสิทธิ์ตรวจสลิปของธุรกิจนี้');
    if (action === 'approve') {
      await tx`update payments set status = 'approved', amount_slip = ${amountSlip ?? p.amount_due}, reviewed_by = ${staff}, reviewed_at = now()
               where code = ${payment}`;
      await tx`update orders set status = 'paid', paid_at = now(), hold_until = null where code = ${p.order_code}`;
      const bk = await tx`update bookings set status = 'confirmed' where order_code = ${p.order_code} and status = 'holding'
                          returning code, start_at`;
      pushIds.push(await enqueue(tx, { order: p.order_code, channel: 'line_push', template: 'paid' }));
      for (const b of bk) {
        await enqueue(tx, { booking: b.code, channel: 'calendar', template: 'confirm' });
        const when = new Date(new Date(b.start_at).getTime() - remindH * 3600000);
        if (when.getTime() > Date.now()) await enqueue(tx, { booking: b.code, channel: 'line_push', template: 'reminder', runAfter: when.toISOString() });
      }
    } else {
      if (!reason) throw new BookingError('reason', 'เลือกเหตุผลที่สลิปไม่ผ่าน');
      await tx`update payments set status = 'rejected', amount_slip = ${amountSlip}, reject_reason = ${reason},
                 reviewed_by = ${staff}, reviewed_at = now() where code = ${payment}`;
      // คืนสถานะให้ลูกค้าแนบใหม่ได้ กันที่ต่ออีก hold_minutes
      await tx`update orders set status = 'holding', hold_until = now() + make_interval(mins => ${hold}) where code = ${p.order_code}`;
      pushIds.push(await enqueue(tx, { order: p.order_code, channel: 'line_push', template: 'slip_rejected', payload: { reason } }));
    }
  });
  // ส่ง LINE ทันที ถ้าพลาด รอบตั้งเวลาจะลองใหม่
  for (const id of pushIds) await sendDue(1, id).catch(() => undefined);
}

// ---------- งานหน้าร้าน: เช็กอิน · เริ่มทำ · เสร็จ · ไม่มา · ยกเลิก ----------
const FLOW: Record<string, Record<string, [string[], string]>> = {
  stay:    { check_in: [['confirmed'], 'checked_in'], check_out: [['checked_in'], 'done'] },
  session: { attend: [['confirmed'], 'done'] },
  slot:    { start: [['confirmed'], 'in_progress'], finish: [['in_progress'], 'done'] },
};
export async function bookingAction(staffUser: StaffUser, code: string, action: string, reason: string | null) {
  const pushIds: number[] = [];
  await sql.begin(async (tx) => {
    const [b] = await tx`select k.*, o.status as order_status from bookings k join orders o on o.code = k.order_code
                         where k.code = ${code} for update of k`;
    if (!b) throw new BookingError('not_found', 'ไม่พบการจองนี้');
    if (!canSee(staffUser, b.business_code)) throw new BookingError('forbidden', 'ไม่มีสิทธิ์ในธุรกิจนี้');
    if (action === 'cancel') {
      if (!['holding', 'confirmed', 'checked_in', 'in_progress'].includes(b.status)) throw new BookingError('bad_status', 'ยกเลิกไม่ได้ในสถานะนี้');
      await tx`update bookings set status = 'cancelled' where code = ${code}`;
      // ทุกรายการในทริปยกเลิกแล้ว → ทริปยกเลิก
      await tx`update orders set status = 'cancelled' where code = ${b.order_code}
               and not exists (select 1 from bookings where order_code = ${b.order_code} and status not in ('cancelled', 'expired'))`;
      pushIds.push(await enqueue(tx, { booking: code, channel: 'line_push', template: 'cancelled', payload: { reason } }));
      if (b.calendar_event_id) await enqueue(tx, { booking: code, channel: 'calendar', template: 'cancelled' });
      return;
    }
    if (action === 'no_show') {
      if (b.status !== 'confirmed') throw new BookingError('bad_status', 'เปลี่ยนเป็นไม่มาได้เฉพาะการจองที่ยืนยันแล้ว');
      await tx`update bookings set status = 'no_show' where code = ${code}`;
      return;
    }
    const step = FLOW[b.kind]?.[action];
    if (!step) throw new BookingError('bad_action', 'คำสั่งไม่ถูกต้อง');
    if (!step[0].includes(b.status)) throw new BookingError('bad_status', 'สถานะการจองไม่ตรงขั้นตอน');
    await tx`update bookings set status = ${step[1]} where code = ${code}`;
    if (b.kind === 'slot' && action === 'finish') {
      pushIds.push(await enqueue(tx, { booking: code, channel: 'line_push', template: 'groom_done' }));
    }
  });
  for (const id of pushIds) await sendDue(1, id).catch(() => undefined);
}

// ---------- เลื่อนวัน (พนักงาน) ----------
// ราคาเดิม · ฐานข้อมูลตรวจซ้อน/รอบเต็ม/ช่างว่างให้อีกชั้น · แจ้งลูกค้า + แก้ปฏิทิน
export async function reschedule(staffUser: StaffUser, code: string, p: { date?: string; nights?: number; session?: string; time?: string; staff?: string }) {
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!p.date || !DATE.test(p.date)) throw new BookingError('bad_date', 'เลือกวันใหม่');
  const date: string = p.date;
  if (date < todayTH()) throw new BookingError('bad_date', 'เลือกวันที่ยังไม่ผ่าน');
  const pushIds: number[] = [];
  try {
    await sql.begin(async (tx) => {
      const [b] = await tx`select k.*, bz.checkin_time, bz.checkout_time,
                                  to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as old_s,
                                  extract(epoch from k.end_at - k.start_at)::int / 60 as mins
                           from bookings k join businesses bz on bz.code = k.business_code where k.code = ${code} for update of k`;
      if (!b) throw new BookingError('not_found', 'ไม่พบการจองนี้');
      if (!canSee(staffUser, b.business_code)) throw new BookingError('forbidden', 'ไม่มีสิทธิ์ในธุรกิจนี้');
      if (!['holding', 'confirmed'].includes(b.status)) throw new BookingError('bad_status', 'เลื่อนได้เฉพาะการจองที่ยังไม่เริ่มใช้บริการ');
      const hm = (s: string | null, f: string) => (/(\d{1,2}):(\d{2})/.exec(s || '')?.slice(1, 3).map((x, i) => (i ? x : x.padStart(2, '0'))).join(':')) || f;
      let start: string, end: string, session: string | null = b.session_code, staff: string | null = b.staff_code;
      if (b.kind === 'stay') {
        const n = Math.round(Number(p.nights || 0)) || Math.max(1, Math.round(Number(b.mins) / 1440));
        if (n < 1 || n > 60) throw new BookingError('bad', 'จำนวนคืนไม่ถูกต้อง');
        const [{ closed }] = await tx`select exists (select 1 from generate_series(${date}::date, ${date}::date + ${n - 1}::int, '1 day') d
                                        where is_closed(${b.business_code}, ${b.unit_code}, null, d::date)) as closed`;
        if (closed) throw new BookingError('closed', 'มีวันที่ร้านปิดหรือห้องปิดอยู่ในช่วงใหม่');
        const [{ to }] = await tx`select (${date}::date + ${n}::int)::text as to`;
        start = `${date} ${hm(b.checkin_time, '14:00')}+07`; end = `${to} ${hm(b.checkout_time, '12:00')}+07`;
      } else if (b.kind === 'session') {
        session = p.session || b.session_code;
        const [s] = await tx`select to_char(start_time, 'HH24:MI') as a, to_char(end_time, 'HH24:MI') as z from pool_sessions where code = ${session} and active`;
        if (!s) throw new BookingError('bad', 'ไม่พบรอบนี้');
        const [{ closed }] = await tx`select is_closed(${b.business_code}, ${b.unit_code}, ${session}, ${date}::date) as closed`;
        if (closed) throw new BookingError('closed', 'วันที่เลือกสระปิด');
        start = `${date} ${s.a}+07`; end = `${date} ${s.z}+07`;
        // ขนาดน้องต้องตรงรอบใหม่
        const [{ bad }] = await tx`select exists (select 1 from booking_pets bp join pets pt on pt.code = bp.pet_code join pool_sessions ps on ps.code = ${session}
                                     where bp.booking_code = ${code} and not pet_fits_size(pt.weight_kg, ps.size_rule)) as bad`;
        if (bad) throw new BookingError('size_mismatch', 'ขนาดน้องไม่ตรงรอบใหม่');
      } else {
        if (!p.time || !/^\d{2}:\d{2}$/.test(p.time)) throw new BookingError('bad', 'เลือกเวลาใหม่');
        staff = p.staff || b.staff_code;
        const [{ closed }] = await tx`select is_closed(${b.business_code}, null, null, ${date}::date) as closed`;
        if (closed) throw new BookingError('closed', 'วันที่เลือกร้านปิด');
        const [w] = await tx`select ${p.time}::time >= work_start and (${p.time}::time + make_interval(mins => ${b.mins})) <= work_end
                                    and extract(isodow from ${date}::date)::int = any (work_days) as ok
                             from staff where code = ${staff} and is_groomer`;
        if (!w?.ok) throw new BookingError('staff_off', 'ช่างไม่ได้ทำงานเวลานั้น');
        start = `${date} ${p.time}+07`;
        const [{ e }] = await tx`select to_char((${start}::timestamptz + make_interval(mins => ${b.mins})) at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') || '+07' as e`;
        end = e;
      }
      await tx`update bookings set start_at = ${start}::timestamptz, end_at = ${end}::timestamptz, session_code = ${session}, staff_code = ${staff} where code = ${code}`;
      // การเตือนเดิมยกเลิก ตั้งใหม่ตามวันใหม่
      await tx`update notifications set status = 'sent', last_error = 'ข้าม: เลื่อนวันแล้ว', sent_at = now()
               where booking_code = ${code} and template = 'reminder' and status = 'queued'`;
      const [rv] = await tx`select value from settings where key = 'remind_hours_before'`;
      const v = rv?.value ?? '24';
      const when = new Date(new Date(start.replace(' ', 'T').replace('+07', '+07:00')).getTime() - (Number(v) || 24) * 3600000);
      if (when.getTime() > Date.now() && b.status === 'confirmed') await enqueue(tx, { booking: code, channel: 'line_push', template: 'reminder', runAfter: when.toISOString() });
      pushIds.push(await enqueue(tx, { booking: code, channel: 'line_push', template: 'rescheduled', payload: { old: b.old_s } }));
      if (b.calendar_event_id) await enqueue(tx, { booking: code, channel: 'calendar', template: 'rescheduled' });
    });
  } catch (e) {
    dbError(e);
  }
  for (const id of pushIds) await sendDue(1, id).catch(() => undefined);
}
