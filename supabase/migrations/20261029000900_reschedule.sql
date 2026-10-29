-- =========================================================
-- เลื่อนวัน: แจ้งลูกค้า + แก้ event ในปฏิทิน
-- =========================================================
alter table notifications drop constraint notifications_template_check;
alter table notifications add constraint notifications_template_check
  check (template in ('confirm','reminder','paid','cancelled','groom_done','new_booking','slip_review','slip_rejected',
                      'vaccine_ok','vaccine_rejected','vaccine_review','delete_request','rescheduled'));
insert into settings (key, value, note) values ('msg_rescheduled', 'on', 'แจ้งเลื่อนวัน') on conflict (key) do nothing;
