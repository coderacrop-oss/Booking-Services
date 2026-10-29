-- =========================================================
-- ขั้นที่ 3b: เชิญพนักงานด้วย LINE · ผลตรวจวัคซีน · ปฏิทิน
-- =========================================================

-- ลิงก์เชิญพนักงาน: เก็บเฉพาะ hash ของรหัสเชิญ · ใช้ได้ครั้งเดียว · หมดอายุใน 72 ชม.
alter table staff add column invite_token_hash text;
alter table staff add column invite_expires timestamptz;

-- สร้างรหัสเชิญใหม่ (เรียกจาก server หรือ psql ตอนตั้งเจ้าของคนแรก) → คืนรหัสเชิญแบบเต็มครั้งเดียว
create or replace function staff_invite(p_staff text) returns text
language plpgsql as $$
declare t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  update staff set invite_token_hash = encode(sha256(convert_to(t, 'UTF8')), 'hex'),
                   invite_expires = now() + interval '72 hours',
                   invite_status = case when invite_status = 'removed' then 'pending' else invite_status end
  where code = p_staff;
  if not found then raise exception 'staff_not_found: %', p_staff; end if;
  return t;
end $$;

-- ใช้รหัสเชิญ: ผูก LINE userId กับพนักงาน
create or replace function staff_accept(p_token text, p_line text) returns text
language plpgsql as $$
declare c text;
begin
  update staff set line_user_id = p_line, invite_status = 'active', invite_token_hash = null, invite_expires = null
  where invite_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and invite_expires > now()
  returning code into c;
  if c is null then raise exception 'invite_invalid' using errcode = 'P0001'; end if;
  return c;
end $$;

revoke execute on function staff_invite(text) from public, anon, authenticated;
revoke execute on function staff_accept(text, text) from public, anon, authenticated;

-- ปฏิทิน Google: เก็บรหัส event ไว้ลบ/แก้ตอนยกเลิก
alter table bookings add column calendar_event_id text;

-- แบบข้อความใหม่: ผลตรวจวัคซีน · ร้านแจ้งอีเมลวัคซีนรอตรวจ
alter table notifications drop constraint notifications_template_check;
alter table notifications add constraint notifications_template_check
  check (template in ('confirm','reminder','paid','cancelled','groom_done','new_booking','slip_review','slip_rejected',
                      'vaccine_ok','vaccine_rejected','vaccine_review'));
alter table notifications add column pet_code text references pets(code) on update cascade on delete cascade;
alter table pet_vaccines add column reject_reason text;
