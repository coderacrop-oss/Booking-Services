-- =========================================================
-- หน้าจอตามโปรโตไทป์: ความยินยอมรายข้อ · ตั้งค่าร้านจากหลังบ้าน
-- =========================================================

-- ความยินยอมแยกข้อ (เปลี่ยนได้ตลอด) + คำขอลบข้อมูล
alter table customers add column consent_news  boolean not null default false;
alter table customers add column consent_photo boolean not null default false;
alter table customers add column delete_requested_at timestamptz;

-- ข้อควรระวังของน้องเป็นแท็ก (ร้านเห็นทุกครั้งที่จอง)
alter table pets add column tags text[] not null default '{}';

-- เวลาเปิดและวันปิดประจำสัปดาห์ของแต่ละธุรกิจ
alter table businesses add column open_hours text;                      -- เช่น 09:00-18:00 (แสดงผล · Grooming ใช้เวลาช่างจริง)
alter table businesses add column closed_weekdays smallint[] not null default '{}' check (closed_weekdays <@ '{1,2,3,4,5,6,7}');

-- ขั้นยกเลิก: [{"days":7,"refund":100},{"days":3,"refund":50}] · น้อยกว่าขั้นสุดท้าย = ไม่คืน
alter table businesses add column cancel_rules jsonb not null default '[]';

-- เปิด/ปิดการแนะนำข้ามบริการ
alter table cross_sells add column active boolean not null default true;

-- วันปิดตามวันในสัปดาห์ นับรวมใน is_closed
create or replace function is_closed(p_business text, p_unit text, p_session text, p_day date) returns boolean
language sql stable as $$
  select exists (select 1 from businesses b where b.code = p_business and extract(isodow from p_day)::int = any (b.closed_weekdays))
      or exists (select 1 from closures c
                 where c.business_code = p_business and p_day between c.date_from and c.date_to
                   and (num_nonnulls(c.unit_code, c.session_code) = 0
                        or c.unit_code = p_unit or c.session_code = p_session))
$$;

-- ข้อความ LINE เปิด/ปิดได้ (ค่าเริ่มต้นเปิด)
insert into settings (key, value, note) values
  ('msg_paid', 'on', 'แจ้งยืนยันหลังสลิปผ่าน'),
  ('msg_reminder', 'on', 'เตือนก่อนถึงวัน'),
  ('msg_slip_rejected', 'on', 'แจ้งสลิปไม่ผ่าน'),
  ('msg_groom_done', 'on', 'แจ้งน้องพร้อมกลับ'),
  ('msg_cancelled', 'on', 'แจ้งยกเลิก'),
  ('msg_vaccine', 'on', 'แจ้งผลตรวจวัคซีน')
on conflict (key) do nothing;

drop policy public_read on cross_sells;
create policy public_read on cross_sells for select to anon, authenticated using (active);

-- คำขอลบข้อมูลจากลูกค้า → อีเมลแจ้งร้าน
alter table notifications drop constraint notifications_template_check;
alter table notifications add constraint notifications_template_check
  check (template in ('confirm','reminder','paid','cancelled','groom_done','new_booking','slip_review','slip_rejected',
                      'vaccine_ok','vaccine_rejected','vaccine_review','delete_request'));
alter table notifications add column customer_code text references customers(code) on update cascade on delete cascade;
