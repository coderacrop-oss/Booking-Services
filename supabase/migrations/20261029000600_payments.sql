-- =========================================================
-- ขั้นที่ 3: ตรวจสลิป · ลูกค้าจาก LINE
-- =========================================================
alter table payments add column reject_reason text;
alter table orders   add column paid_at timestamptz;

-- ลูกค้าใหม่จาก LINE: รหัส C-0001, C-0002, …
create or replace function new_customer(p_line text, p_name text) returns text
language plpgsql as $$
declare c text;
begin
  select code into c from customers where line_user_id = p_line;
  if c is not null then return c; end if;
  c := next_code('C');
  insert into customers (code, line_user_id, display_name) values (c, p_line, coalesce(nullif(p_name, ''), 'ลูกค้า LINE'))
  on conflict (line_user_id) do nothing;
  select code into c from customers where line_user_id = p_line;
  return c;
end $$;
revoke execute on function new_customer(text, text) from public, anon, authenticated;

create index if not exists bookings_reminder on bookings (start_at) where status = 'confirmed';

-- แบบข้อความแจ้งสลิปไม่ผ่าน
alter table notifications drop constraint notifications_template_check;
alter table notifications add constraint notifications_template_check
  check (template in ('confirm','reminder','paid','cancelled','groom_done','new_booking','slip_review','slip_rejected'));
