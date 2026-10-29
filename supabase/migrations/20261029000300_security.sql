-- =========================================================
-- สิทธิ์การเข้าถึง
-- แนวทาง: หน้าเว็บ (anon key) อ่านได้เฉพาะข้อมูลร้านที่เปิดให้ลูกค้าเห็น
-- ข้อมูลลูกค้า การจอง สลิป ทั้งหมดผ่าน API ฝั่ง server เท่านั้น
-- (server ตรวจ LINE ID token แล้วใช้ service role · service role ข้าม RLS)
-- =========================================================

do $$
declare t text;
begin
  foreach t in array array['settings','businesses','units','unit_photos','weight_tiers','services','service_prices',
                           'pool_sessions','staff','closures','cross_sells','customers','pets','pet_vaccines',
                           'orders','bookings','booking_pets','payments','notifications','code_counters']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ข้อมูลร้านที่ลูกค้าเห็นได้ (อ่านอย่างเดียว)
create policy public_read on businesses     for select to anon, authenticated using (active);
create policy public_read on units          for select to anon, authenticated using (active);
create policy public_read on unit_photos    for select to anon, authenticated using (true);
create policy public_read on weight_tiers   for select to anon, authenticated using (true);
create policy public_read on services       for select to anon, authenticated using (active);
create policy public_read on service_prices for select to anon, authenticated using (true);
create policy public_read on pool_sessions  for select to anon, authenticated using (active);
create policy public_read on closures       for select to anon, authenticated using (date_to >= current_date);
create policy public_read on cross_sells    for select to anon, authenticated using (true);
-- settings: เปิดเฉพาะค่าที่ใช้แสดงหน้าจอง
create policy public_read on settings for select to anon, authenticated
  using (key in ('shop_name','legal_name','hold_minutes','timezone','policy_version'));

-- ไม่มี policy อื่น = anon/authenticated เขียนอะไรไม่ได้ และอ่านข้อมูลลูกค้า/การจอง/พนักงานไม่ได้

-- ฟังก์ชันที่เปลี่ยนข้อมูลหรือเผยข้อมูลลูกค้า เรียกได้จาก server (service role) เท่านั้น
revoke execute on function next_code(text, date)               from public, anon, authenticated;
revoke execute on function expire_holds()                      from public, anon, authenticated;
revoke execute on function check_session_full(text, timestamptz) from public, anon, authenticated;
revoke execute on function vaccine_ok(text, date)              from public, anon, authenticated;
