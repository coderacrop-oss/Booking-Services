import 'server-only';
import { sql } from './db';
import { BookingError } from './booking';
import { enqueue, sendDue } from './notify';
import { imageType, putFile } from './storage';
import { canSee, type StaffUser } from './staff';

const VAX_TYPES = /^(image\/(jpeg|png|webp)|application\/pdf)$/;

export async function addPet(customer: string, p: { name?: string; species?: string; breed?: string; weight_kg?: number; note?: string }) {
  const name = (p.name || '').trim().slice(0, 40);
  const kg = Number(p.weight_kg);
  if (!name) throw new BookingError('bad_pet', 'กรอกชื่อน้อง');
  if (!(kg > 0 && kg < 150)) throw new BookingError('bad_pet', 'กรอกน้ำหนักน้อง (กก.)');
  const species = p.species === 'cat' ? 'cat' : 'dog';
  const [{ n }] = await sql`select count(*)::int as n from pets where customer_code = ${customer}`;
  if (n >= 20) throw new BookingError('too_many', 'เพิ่มน้องได้สูงสุด 20 ตัว');
  const [{ c }] = await sql`select next_code('P') as c`;
  await sql`insert into pets (code, customer_code, name, species, breed, weight_kg, note)
            values (${c}, ${customer}, ${name}, ${species}, ${(p.breed || '').trim().slice(0, 40) || null}, ${kg}, ${(p.note || '').trim().slice(0, 120) || null})`;
  return c as string;
}

export async function updateWeight(customer: string, pet: string, kg: number) {
  if (!(kg > 0 && kg < 150)) throw new BookingError('bad_pet', 'น้ำหนักไม่ถูกต้อง');
  const r = await sql`update pets set weight_kg = ${kg} where code = ${pet} and customer_code = ${customer}`;
  if (!r.count) throw new BookingError('not_found', 'ไม่พบน้องตัวนี้');
}

// ลูกค้าส่งรูปสมุดวัคซีน → รอร้านตรวจ
export async function addVaccine(customer: string, pet: string, vaccine: string, expires: string, file: Buffer) {
  if (file.length > 5 * 1024 * 1024) throw new BookingError('too_big', 'ไฟล์ใหญ่เกิน 5 MB');
  const isPdf = file.subarray(0, 5).toString() === '%PDF-';
  const type = isPdf ? 'application/pdf' : imageType(file);
  if (!type || !VAX_TYPES.test(type)) throw new BookingError('not_image', 'แนบได้เฉพาะรูปหรือ PDF');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) throw new BookingError('bad_date', 'เลือกวันหมดอายุวัคซีน');
  const [p] = await sql`select code from pets where code = ${pet} and customer_code = ${customer}`;
  if (!p) throw new BookingError('not_found', 'ไม่พบน้องตัวนี้');
  const path = `${pet}/${Date.now()}.${isPdf ? 'pdf' : type.split('/')[1]}`;
  await putFile('vaccines', path, file, type);
  await sql.begin(async (tx) => {
    await tx`insert into pet_vaccines (pet_code, vaccine, expires_on, photo) values (${pet}, ${vaccine.trim().slice(0, 60) || 'วัคซีน'}, ${expires}, ${path})`;
    await enqueue(tx, { pet, channel: 'email', template: 'vaccine_review' });
  });
}

// ใครตรวจวัคซีนได้: เจ้าของ หรือคนที่ดูแลธุรกิจที่ต้องใช้วัคซีน
export async function canReviewVaccine(s: StaffUser) {
  const biz = await sql`select code from businesses where need_vaccine and active`;
  return biz.some((b) => canSee(s, b.code));
}

export async function reviewVaccine(s: StaffUser, id: number, action: 'approve' | 'reject', expires: string | null, reason: string | null) {
  if (!(await canReviewVaccine(s))) throw new BookingError('forbidden', 'ไม่มีสิทธิ์ตรวจวัคซีน');
  const pushIds: number[] = [];
  await sql.begin(async (tx) => {
    const [v] = await tx`select * from pet_vaccines where id = ${id} for update`;
    if (!v) throw new BookingError('not_found', 'ไม่พบรายการนี้');
    if (v.status !== 'pending') throw new BookingError('done', 'ตรวจไปแล้ว');
    if (action === 'approve') {
      if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) throw new BookingError('bad_date', 'วันหมดอายุไม่ถูกต้อง');
      await tx`update pet_vaccines set status = 'approved', expires_on = coalesce(${expires}::date, expires_on),
                 reviewed_by = ${s.code}, reviewed_at = now() where id = ${id}`;
      pushIds.push(await enqueue(tx, { pet: v.pet_code, channel: 'line_push', template: 'vaccine_ok' }));
    } else {
      if (!reason) throw new BookingError('reason', 'เลือกเหตุผล');
      await tx`update pet_vaccines set status = 'rejected', reject_reason = ${reason}, reviewed_by = ${s.code}, reviewed_at = now() where id = ${id}`;
      pushIds.push(await enqueue(tx, { pet: v.pet_code, channel: 'line_push', template: 'vaccine_rejected', payload: { reason } }));
    }
  });
  for (const pid of pushIds) await sendDue(1, pid).catch(() => undefined);
}
