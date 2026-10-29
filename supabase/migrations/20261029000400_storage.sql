-- =========================================================
-- ที่เก็บไฟล์ (Supabase Storage)
--   photos   = รูปห้อง บ้าน บริการ · เปิดสาธารณะ
--   slips    = สลิปโอนเงิน · ส่วนตัว (เปิดผ่าน signed URL จาก server)
--   vaccines = รูปสมุดวัคซีน · ส่วนตัว
-- อัปโหลดทุกชนิดผ่าน server (service role) · ไม่มี policy ให้ anon เขียน
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('photos',   'photos',   true,  5242880, array['image/jpeg','image/png','image/webp']),
  ('slips',    'slips',    false, 5242880, array['image/jpeg','image/png','image/webp']),
  ('vaccines', 'vaccines', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
