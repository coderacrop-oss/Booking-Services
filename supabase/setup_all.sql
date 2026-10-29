-- ตั้งฐานข้อมูลครั้งเดียว: วางทั้งไฟล์ใน Supabase → SQL Editor แล้วกด Run
-- (migrations 0100–0900 + ข้อมูลร้านและข้อมูลทดลองจาก Excel) · ใช้กับโปรเจกต์ใหม่ที่ยังว่างเท่านั้น

-- ===== 20261029000100_core.sql =====
-- =========================================================
-- ระบบจอง 4 ธุรกิจ · ตารางหลัก
-- ชื่อตาราง/คอลัมน์ตรงกับไฟล์ data/BaanMax-booking-schema.xlsx (แถว 2)
-- ส่วนที่ต่างจาก Excel (ตั้งใจ):
--   • รายการหลายค่า (วัน, ธุรกิจ, สิ่งอำนวยความสะดวก) เก็บเป็น array
--   • bookings.pet_codes  → ตาราง booking_pets
--   • bookings.unit_code ที่เป็นรหัสรอบสระ → session_code
--   • bookings.service_code ที่มีบริการเสริม → service_code + addon_codes
--   • unit_photos.owner_code → unit_code หรือ service_code
--   • closures.unit_code ที่เป็นรหัสรอบสระ → session_code
-- สคริปต์ scripts/excel_to_seed.py แปลงให้เอง
-- =========================================================

create extension if not exists btree_gist;

-- อัปเดตเวลาแก้ไขอัตโนมัติ
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------- ตั้งค่าร้าน ----------
create table settings (
  key        text primary key check (key ~ '^[a-z0-9_]+$'),
  value      text not null,
  note       text,
  updated_at timestamptz not null default now()
);
comment on table settings is 'ค่าทั่วไปของร้าน · ห้ามเก็บ token หรือรหัสลับ (ใช้ env)';

create table businesses (
  code          text primary key check (code ~ '^[a-z0-9_]+$'),
  name          text not null,
  tagline       text not null,
  booking_type  text not null check (booking_type in ('stay','session','slot')),
  color         text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  id_prefix     text not null unique check (id_prefix ~ '^[A-Z]{1,3}$'),
  deposit_type  text not null check (deposit_type in ('full','percent','fixed')),
  deposit_value numeric(10,2) check (deposit_value >= 0),
  checkin_time  text,
  checkout_time text,
  cancel_policy text not null,
  need_vaccine  boolean not null default false,
  calendar_id   text,
  sort          int not null default 0,
  active        boolean not null default true,
  updated_at    timestamptz not null default now(),
  check (deposit_type = 'full' or deposit_value is not null),
  check (deposit_type <> 'percent' or deposit_value between 1 and 100)
);

create table units (
  code          text primary key,
  business_code text not null references businesses(code) on update cascade,
  name          text not null,
  summary       text,
  price         numeric(10,2) not null check (price >= 0),
  weekend_price numeric(10,2) check (weekend_price >= 0),
  max_people    int check (max_people > 0),
  bedrooms      int check (bedrooms >= 0),
  max_pets      int check (max_pets >= 0),
  max_pet_kg    numeric(5,2) check (max_pet_kg > 0),
  pet_fee       numeric(10,2) check (pet_fee >= 0),
  amenities     text[] not null default '{}',
  rules         text,
  sort          int not null default 0,
  active        boolean not null default true,
  updated_at    timestamptz not null default now()
);
create index on units (business_code);

create table weight_tiers (
  code   text primary key,
  label  text not null,
  min_kg numeric(5,2) not null check (min_kg >= 0),   -- มากกว่าค่านี้ (แถวแรก 0 = ตั้งแต่ 0)
  max_kg numeric(5,2),                                -- ไม่เกินค่านี้ · ว่าง = ไม่จำกัด
  check (max_kg is null or max_kg > min_kg)
);

create table services (
  code          text primary key,
  business_code text not null references businesses(code) on update cascade,
  name          text not null,
  kind          text not null check (kind in ('main','addon')),
  description   text,
  price_mode    text not null check (price_mode in ('flat','by_weight')),
  price         numeric(10,2) check (price >= 0),
  duration_min  int check (duration_min > 0),
  sort          int not null default 0,
  active        boolean not null default true,
  updated_at    timestamptz not null default now(),
  check (price_mode <> 'flat' or (price is not null and duration_min is not null))
);

create table service_prices (
  service_code text not null references services(code) on update cascade on delete cascade,
  tier_code    text not null references weight_tiers(code) on update cascade,
  price        numeric(10,2) not null check (price >= 0),
  duration_min int not null check (duration_min > 0),
  primary key (service_code, tier_code)
);

create table unit_photos (
  id           bigint generated always as identity primary key,
  unit_code    text references units(code) on update cascade on delete cascade,
  service_code text references services(code) on update cascade on delete cascade,
  file         text not null,           -- path ใน bucket photos หรือ URL
  caption      text,
  is_cover     boolean not null default false,
  sort         int not null default 0,
  check (num_nonnulls(unit_code, service_code) = 1)
);
-- รูปปกได้ 1 รูปต่อรายการ
create unique index unit_photos_one_cover on unit_photos (coalesce(unit_code, service_code)) where is_cover;

create table pool_sessions (
  code       text primary key,
  unit_code  text not null references units(code) on update cascade,
  weekdays   smallint[] not null check (cardinality(weekdays) > 0 and weekdays <@ '{1,2,3,4,5,6,7}'),  -- 1 = จันทร์ … 7 = อาทิตย์
  start_time time not null,
  end_time   time not null check (end_time > start_time),
  size_rule  text not null check (size_rule in ('small','large','all')),
  capacity   int not null check (capacity > 0),
  price      numeric(10,2) not null check (price >= 0),
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);

create table staff (
  code          text primary key,
  display_name  text not null,
  role          text not null check (role in ('owner','manager','staff')),
  businesses    text[] not null check (cardinality(businesses) > 0),   -- รหัสธุรกิจ หรือ {all}
  is_groomer    boolean not null default false,
  work_days     smallint[] check (work_days <@ '{1,2,3,4,5,6,7}'),
  work_start    time,
  work_end      time,
  line_user_id  text unique,
  invite_status text not null default 'pending' check (invite_status in ('pending','active','removed')),
  updated_at    timestamptz not null default now(),
  check (work_end is null or work_start is null or work_end > work_start),
  check (not is_groomer or (work_days is not null and work_start is not null and work_end is not null))
);

create table closures (
  id            bigint generated always as identity primary key,
  business_code text not null references businesses(code) on update cascade,
  unit_code     text references units(code) on update cascade on delete cascade,
  session_code  text references pool_sessions(code) on update cascade on delete cascade,
  date_from     date not null,
  date_to       date not null check (date_to >= date_from),
  reason        text,
  check (num_nonnulls(unit_code, session_code) <= 1)
);
create index on closures (business_code, date_from, date_to);

create table cross_sells (
  id             bigint generated always as identity primary key,
  from_business  text not null references businesses(code) on update cascade,
  offer_business text not null references businesses(code) on update cascade,
  offer_item     text,
  title          text not null,
  when_rule      text not null check (when_rule in ('checkout_day','during_stay','same_day')),
  condition      text,
  sort           int not null default 0,
  check (from_business <> offer_business)
);

-- ---------- ข้อมูลลูกค้า ----------
create table customers (
  code           text primary key,
  line_user_id   text unique,
  display_name   text not null,
  phone          text check (phone ~ '^0[0-9]{8,9}$'),
  email          text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  pdpa_at        timestamptz,
  policy_version text,
  created_at     timestamptz not null default now()
);
comment on table customers is 'เก็บเท่าที่ใช้จอง · ไม่เก็บบัตรประชาชนหรือข้อมูลสุขภาพของคน';

create table pets (
  code          text primary key,
  customer_code text not null references customers(code) on update cascade on delete cascade,
  name          text not null,
  species       text not null check (species in ('dog','cat')),
  breed         text,
  weight_kg     numeric(5,2) not null check (weight_kg > 0 and weight_kg < 150),
  note          text,
  created_at    timestamptz not null default now()
);
create index on pets (customer_code);

create table pet_vaccines (
  id          bigint generated always as identity primary key,
  pet_code    text not null references pets(code) on update cascade on delete cascade,
  vaccine     text not null,
  expires_on  date not null,
  photo       text,                      -- path ใน bucket vaccines (private)
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by text references staff(code) on update cascade,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on pet_vaccines (pet_code, status, expires_on);

-- ---------- การจองและเงิน ----------
create table orders (
  code           text primary key,
  customer_code  text not null references customers(code) on update cascade,
  status         text not null default 'holding'
                 check (status in ('holding','pending_review','paid','cancelled','expired')),
  total          numeric(10,2) not null check (total >= 0),
  due_now        numeric(10,2) not null check (due_now >= 0),
  hold_until     timestamptz,
  policy_version text,                   -- นโยบายฉบับที่ลูกค้าติ๊กยอมรับ
  created_at     timestamptz not null default now(),
  check (due_now <= total),
  check (status <> 'holding' or hold_until is not null)
);
create index on orders (customer_code, created_at desc);
create index orders_holding on orders (hold_until) where status = 'holding';

create table bookings (
  code          text primary key,
  order_code    text not null references orders(code) on update cascade on delete cascade,
  business_code text not null references businesses(code) on update cascade,
  kind          text not null check (kind in ('stay','session','slot')),   -- ระบบเติมจากธุรกิจ
  unit_code     text references units(code) on update cascade,
  session_code  text references pool_sessions(code) on update cascade,
  service_code  text references services(code) on update cascade,
  addon_codes   text[] not null default '{}',
  staff_code    text references staff(code) on update cascade,
  start_at      timestamptz not null,
  end_at        timestamptz not null check (end_at > start_at),
  guests        int check (guests > 0),
  price         numeric(10,2) not null check (price >= 0),
  status        text not null default 'holding'
                check (status in ('holding','confirmed','checked_in','in_progress','done','cancelled','no_show','expired')),
  created_at    timestamptz not null default now(),
  check (kind <> 'stay'    or unit_code is not null),
  check (kind <> 'session' or session_code is not null),
  check (kind <> 'slot'    or (service_code is not null and staff_code is not null))
);
create index on bookings (order_code);
create index on bookings (business_code, start_at);

-- สถานะที่ยังกินที่อยู่
create or replace function booking_active(s text) returns boolean
language sql immutable as $$ select s in ('holding','confirmed','checked_in','in_progress') $$;

-- กันจองซ้อน: ห้อง/บ้าน ช่วงเวลาทับกันไม่ได้ · ช่างคนเดียวคิวทับกันไม่ได้
alter table bookings add constraint no_double_stay
  exclude using gist (unit_code with =, tstzrange(start_at, end_at, '[)') with &&)
  where (kind = 'stay' and booking_active(status));
alter table bookings add constraint no_double_slot
  exclude using gist (staff_code with =, tstzrange(start_at, end_at, '[)') with &&)
  where (kind = 'slot' and booking_active(status));

create table booking_pets (
  booking_code text not null references bookings(code) on update cascade on delete cascade,
  pet_code     text not null references pets(code) on update cascade,
  primary key (booking_code, pet_code)
);
create index on booking_pets (pet_code);

create table payments (
  code        text primary key,
  order_code  text not null references orders(code) on update cascade on delete cascade,
  amount_due  numeric(10,2) not null check (amount_due >= 0),
  amount_slip numeric(10,2) check (amount_slip >= 0),
  slip_file   text not null,             -- path ใน bucket slips (private)
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by text references staff(code) on update cascade,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on payments (order_code);
create index payments_pending on payments (created_at) where status = 'pending';

-- ---------- ระบบ ----------
create table notifications (
  id           bigint generated always as identity primary key,
  booking_code text references bookings(code) on update cascade on delete cascade,
  order_code   text references orders(code) on update cascade on delete cascade,
  channel      text not null check (channel in ('line_reply','line_push','email','calendar')),
  template     text not null check (template in ('confirm','reminder','paid','cancelled','groom_done','new_booking','slip_review')),
  payload      jsonb not null default '{}',
  status       text not null default 'queued' check (status in ('queued','sent','failed')),
  tries        int not null default 0,
  last_error   text,
  run_after    timestamptz not null default now(),   -- ใช้ตั้งเวลาเตือนล่วงหน้า
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_due on notifications (run_after) where status = 'queued';

-- ตัวนับรหัส (H-261121-01, T-261121-01, PAY-0001)
create table code_counters (
  prefix text not null,
  day    text not null default '',
  n      int  not null default 0,
  primary key (prefix, day)
);

-- updated_at
create trigger t_upd before update on settings      for each row execute function set_updated_at();
create trigger t_upd before update on businesses    for each row execute function set_updated_at();
create trigger t_upd before update on units         for each row execute function set_updated_at();
create trigger t_upd before update on services      for each row execute function set_updated_at();
create trigger t_upd before update on pool_sessions for each row execute function set_updated_at();
create trigger t_upd before update on staff         for each row execute function set_updated_at();

-- ===== 20261029000200_rules.sql =====
-- =========================================================
-- กติกาที่ฐานข้อมูลบังคับเอง (ไม่ว่าเรียกจากหน้าจอง หลังบ้าน หรือ import)
-- =========================================================

-- ---------- ตัวช่วย ----------

-- รหัสถัดไป: next_code('H', '2026-11-21') → H-261121-01 · next_code('PAY') → PAY-0001
create or replace function next_code(p_prefix text, p_day date default null) returns text
language plpgsql as $$
declare d text := coalesce(to_char(p_day, 'YYMMDD'), ''); v int;
begin
  insert into code_counters (prefix, day, n) values (p_prefix, d, 1)
  on conflict (prefix, day) do update set n = code_counters.n + 1
  returning n into v;
  if d = '' then return p_prefix || '-' || lpad(v::text, 4, '0'); end if;
  return p_prefix || '-' || d || '-' || lpad(v::text, 2, '0');
end $$;

-- ขนาดน้องจากน้ำหนัก: มากกว่า min_kg และไม่เกิน max_kg (แถว min 0 รวม 0)
create or replace function tier_for(p_kg numeric) returns text
language sql stable as $$
  select code from weight_tiers
  where (p_kg > min_kg or min_kg = 0) and (max_kg is null or p_kg <= max_kg)
  order by min_kg limit 1
$$;

-- น้องตัวนี้เข้ารอบสระนี้ได้ไหม (small ≤ 10 กก. · large > 10 กก.)
create or replace function pet_fits_size(p_kg numeric, p_rule text) returns boolean
language sql immutable as $$
  select case p_rule when 'small' then p_kg <= 10 when 'large' then p_kg > 10 else true end
$$;

-- วัคซีนผ่านตรวจและยังไม่หมดอายุ ณ วันที่ใช้บริการ
create or replace function vaccine_ok(p_pet text, p_on date) returns boolean
language sql stable as $$
  select exists (select 1 from pet_vaccines
                 where pet_code = p_pet and status = 'approved' and expires_on >= p_on)
$$;

-- มัดจำของรายการตามแบบมัดจำของธุรกิจ
create or replace function deposit_for(p_business text, p_price numeric) returns numeric
language sql stable as $$
  select case b.deposit_type
           when 'full'    then p_price
           when 'percent' then round(p_price * b.deposit_value / 100)
           when 'fixed'   then least(b.deposit_value, p_price)
         end
  from businesses b where b.code = p_business
$$;

-- ที่ว่างของรอบสระในวันนั้น (นับเป็นตัว)
create or replace function session_left(p_session text, p_start timestamptz) returns int
language sql stable as $$
  select s.capacity - coalesce((
           select count(*) from bookings b join booking_pets bp on bp.booking_code = b.code
           where b.session_code = p_session and b.start_at = p_start and booking_active(b.status)), 0)::int
  from pool_sessions s where s.code = p_session
$$;

-- วันนั้นปิดไหม (ทั้งธุรกิจ หรือเฉพาะห้อง/รอบ)
create or replace function is_closed(p_business text, p_unit text, p_session text, p_day date) returns boolean
language sql stable as $$
  select exists (select 1 from closures c
                 where c.business_code = p_business and p_day between c.date_from and c.date_to
                   and (num_nonnulls(c.unit_code, c.session_code) = 0
                        or c.unit_code = p_unit or c.session_code = p_session))
$$;

-- ---------- การจอง: เติมและตรวจความสอดคล้อง ----------
create or replace function bookings_fill() returns trigger
language plpgsql as $$
declare b businesses; s pool_sessions; u units; sv services; st staff;
begin
  select * into b from businesses where code = new.business_code;
  new.kind := b.booking_type;

  if new.kind = 'session' then
    select * into s from pool_sessions where code = new.session_code;
    if not found then raise exception 'session_not_found: %', new.session_code; end if;
    new.unit_code := s.unit_code;
    if (new.start_at at time zone 'Asia/Bangkok')::time <> s.start_time
       or extract(isodow from new.start_at at time zone 'Asia/Bangkok')::int <> all (s.weekdays) then
      raise exception 'session_time_mismatch: % ไม่ใช่เวลาของรอบ %', new.start_at, s.code;
    end if;
  end if;

  if new.unit_code is not null then
    select * into u from units where code = new.unit_code;
    if u.business_code <> new.business_code then
      raise exception 'unit_wrong_business: % ไม่ใช่ของ %', new.unit_code, new.business_code;
    end if;
    if new.guests is not null and u.max_people is not null and new.guests > u.max_people then
      raise exception 'too_many_guests: % รับได้ % คน', u.code, u.max_people;
    end if;
  end if;

  if new.service_code is not null then
    select * into sv from services where code = new.service_code;
    if sv.business_code <> new.business_code or sv.kind <> 'main' then
      raise exception 'service_invalid: %', new.service_code;
    end if;
    if exists (select 1 from unnest(new.addon_codes) a
               where not exists (select 1 from services x
                                 where x.code = a and x.kind = 'addon' and x.business_code = new.business_code)) then
      raise exception 'addon_invalid: %', new.addon_codes;
    end if;
  end if;

  if new.kind = 'slot' then
    select * into st from staff where code = new.staff_code;
    if not st.is_groomer or not (new.business_code = any (st.businesses) or 'all' = any (st.businesses)) then
      raise exception 'staff_not_groomer: %', new.staff_code;
    end if;
  end if;
  return new;
end $$;

create trigger t_fill before insert or update of business_code, unit_code, session_code, service_code, addon_codes, staff_code, start_at
  on bookings for each row execute function bookings_fill();

-- ---------- รอบสระ: ไม่เกินจำนวนที่รับ + ขนาดตรงรอบ ----------
create or replace function check_session_full(p_session text, p_start timestamptz) returns void
language plpgsql as $$
begin
  -- ล็อกรอบนี้ไว้ กันสองคนจองพร้อมกันแล้วเกิน
  perform pg_advisory_xact_lock(hashtext(p_session || '|' || p_start::text));
  if session_left(p_session, p_start) < 0 then
    raise exception 'session_full: รอบ % เต็มแล้ว', p_session using errcode = 'P0001';
  end if;
end $$;

create or replace function booking_pets_check() returns trigger
language plpgsql as $$
declare bk bookings; s pool_sessions; p pets; b businesses; u units;
begin
  select * into bk from bookings where code = new.booking_code;
  select * into p  from pets where code = new.pet_code;
  select * into b  from businesses where code = bk.business_code;

  -- น้องต้องเป็นของเจ้าของทริป
  if not exists (select 1 from orders o where o.code = bk.order_code and o.customer_code = p.customer_code) then
    raise exception 'pet_not_owner: % ไม่ใช่น้องของลูกค้าในทริปนี้', p.code;
  end if;

  -- วัคซีน (บังคับตอนลูกค้าจอง · หลังบ้านลงรายการย้อนหลังได้)
  if b.need_vaccine and bk.status = 'holding'
     and not vaccine_ok(p.code, (bk.start_at at time zone 'Asia/Bangkok')::date) then
    raise exception 'vaccine_required: % ยังไม่มีวัคซีนที่ผ่านตรวจ', p.name using errcode = 'P0001';
  end if;

  if bk.kind = 'session' then
    select * into s from pool_sessions where code = bk.session_code;
    if not pet_fits_size(p.weight_kg, s.size_rule) then
      raise exception 'size_mismatch: % (% กก.) ไม่ตรงรอบ %', p.name, p.weight_kg, s.code using errcode = 'P0001';
    end if;
    if booking_active(bk.status) then perform check_session_full(bk.session_code, bk.start_at); end if;
  end if;

  if bk.unit_code is not null then
    select * into u from units where code = bk.unit_code;
    if u.max_pet_kg is not null and p.weight_kg > u.max_pet_kg then
      raise exception 'pet_too_big: % เกิน % กก.', p.name, u.max_pet_kg using errcode = 'P0001';
    end if;
    if u.max_pets is not null and bk.kind = 'stay'
       and (select count(*) from booking_pets where booking_code = bk.code) > u.max_pets then
      raise exception 'too_many_pets: % รับได้ % ตัว', u.code, u.max_pets using errcode = 'P0001';
    end if;
  end if;
  return null;
end $$;

create trigger t_pets after insert on booking_pets for each row execute function booking_pets_check();

-- กลับมากินที่อีกครั้ง (เช่น เปลี่ยนสถานะกลับ) ต้องเช็กรอบเต็มใหม่
create or replace function bookings_recheck() returns trigger
language plpgsql as $$
begin
  if new.kind = 'session' and booking_active(new.status)
     and (not booking_active(old.status) or new.start_at <> old.start_at or new.session_code <> old.session_code) then
    perform check_session_full(new.session_code, new.start_at);
  end if;
  return null;
end $$;
create trigger t_recheck after update of status, start_at, session_code on bookings
  for each row execute function bookings_recheck();

-- ---------- ปล่อยที่เมื่อไม่โอนตามเวลา ----------
-- เรียกจากรอบตั้งเวลา (pg_cron หรือ Vercel Cron) ทุก 5 นาที และก่อนสร้างการจองใหม่
create or replace function expire_holds() returns int
language plpgsql as $$
declare n int;
begin
  with x as (
    update orders set status = 'expired'
    where status = 'holding' and hold_until < now()
    returning code)
  update bookings b set status = 'expired' from x
  where b.order_code = x.code and b.status = 'holding';
  get diagnostics n = row_count;
  return n;
end $$;

-- ===== 20261029000300_security.sql =====
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

-- ===== 20261029000400_storage.sql =====
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

-- ===== 20261029000500_phase2.sql =====
-- =========================================================
-- เฟส 2 (ยังไม่รวมในใบเสนอราคา) · สร้างโครงไว้ให้ตรงไฟล์ Excel
-- ยังไม่มีหน้าจอหรือ API ใช้ตารางเหล่านี้
-- =========================================================
create table passes (
  code          text primary key,
  customer_code text not null references customers(code) on update cascade on delete cascade,
  total_uses    int not null check (total_uses > 0),
  remaining     int not null check (remaining >= 0),
  expires_on    date not null,
  created_at    timestamptz not null default now(),
  check (remaining <= total_uses)
);

create table coupons (
  code           text primary key check (code ~ '^[A-Z0-9]+$'),
  business_code  text references businesses(code) on update cascade,   -- ว่าง = ทุกธุรกิจ
  discount_type  text not null check (discount_type in ('percent','amount')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  valid_until    date,
  max_uses       int check (max_uses > 0),
  used           int not null default 0,
  check (discount_type <> 'percent' or discount_value <= 100)
);

alter table passes  enable row level security;
alter table coupons enable row level security;

-- ===== 20261029000600_payments.sql =====
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

-- ===== 20261029000700_staff_vaccine_calendar.sql =====
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

-- ===== 20261029000800_settings_ui.sql =====
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

-- ===== 20261029000900_reschedule.sql =====
-- =========================================================
-- เลื่อนวัน: แจ้งลูกค้า + แก้ event ในปฏิทิน
-- =========================================================
alter table notifications drop constraint notifications_template_check;
alter table notifications add constraint notifications_template_check
  check (template in ('confirm','reminder','paid','cancelled','groom_done','new_booking','slip_review','slip_rejected',
                      'vaccine_ok','vaccine_rejected','vaccine_review','delete_request','rescheduled'));
insert into settings (key, value, note) values ('msg_rescheduled', 'on', 'แจ้งเลื่อนวัน') on conflict (key) do nothing;

-- ===== seed.sql =====
-- สร้างจาก data/BaanMax-booking-schema.xlsx · 2026-10-29 19:54 · ห้ามแก้ไฟล์นี้ตรง ๆ ให้แก้ Excel แล้วรันสคริปต์ใหม่
insert into settings (key, value, note) values ('shop_name', 'เพื่อนหมา PET LOVER', 'ชื่อที่ขึ้นในหน้าจองและการ์ด LINE');
insert into settings (key, value, note) values ('legal_name', 'บริษัท พันธุ์พฤทธิ์ จำกัด', 'ชื่อในใบเสร็จ (ทุกธุรกิจใช้นามเดียวกัน)');
insert into settings (key, value, note) values ('promptpay_id', '(ใส่เลขพร้อมเพย์ของร้าน)', 'ใช้สร้าง QR มัดจำ');
insert into settings (key, value, note) values ('account_name', '(ชื่อบัญชีรับเงิน)', 'แสดงใต้ QR ให้ลูกค้าเทียบก่อนโอน');
insert into settings (key, value, note) values ('hold_minutes', '30', 'กันที่ไว้กี่นาทีหลังกดจอง ไม่แนบสลิป = ปล่อยที่');
insert into settings (key, value, note) values ('remind_hours_before', '24', 'เตือนก่อนถึงวันกี่ชั่วโมง');
insert into settings (key, value, note) values ('notify_email', 'shop@example.com', 'อีเมลกลางรับแจ้งจองใหม่ / สลิปรอตรวจ');
insert into settings (key, value, note) values ('timezone', 'Asia/Bangkok', 'เขตเวลา');
insert into settings (key, value, note) values ('policy_version', '2026-11-01', 'เปลี่ยนเมื่อแก้นโยบาย ลูกค้าต้องกดยอมรับใหม่');
insert into businesses (code, name, tagline, booking_type, color, id_prefix, deposit_type, checkin_time, checkout_time, cancel_policy, need_vaccine, sort, active, open_hours, closed_weekdays, cancel_rules) values ('pet_hotel', 'Pet hotel', 'ฝากน้องค้างคืน', 'stay', '#FDF5DC', 'H', 'full', '14:00-18:00', '12:00', 'ยกเลิกก่อน 3 วัน คืนเป็นเครดิต · น้อยกว่า 3 วันไม่คืน', true, 1, true, '14:00-18:00', '{}', '[{"days": 3, "refund": 100}]'::jsonb);
insert into businesses (code, name, tagline, booking_type, color, id_prefix, deposit_type, deposit_value, checkin_time, checkout_time, cancel_policy, need_vaccine, sort, active, open_hours, closed_weekdays, cancel_rules) values ('villa', 'Villa', 'ที่พักสำหรับคน', 'stay', '#111111', 'V', 'percent', 50, '14:00', '12:00', 'ยกเลิกก่อน 14 วัน คืนเครดิตเต็ม · 7–13 วัน เครดิต 50% · น้อยกว่า 7 วันไม่คืน', false, 2, true, 'เข้า 14:00 · ออก 12:00', '{}', '[{"days": 14, "refund": 100}, {"days": 7, "refund": 50}]'::jsonb);
insert into businesses (code, name, tagline, booking_type, color, id_prefix, deposit_type, cancel_policy, need_vaccine, sort, active, open_hours, closed_weekdays, cancel_rules) values ('pool', 'สระ', 'จองรอบว่ายน้ำ', 'session', '#8FC9F0', 'P', 'full', 'ยกเลิกก่อน 2 ชม. คืนสิทธิ์ · หลังจากนั้นไม่คืน', true, 3, true, '09:00-18:00', '{}', '[{"days": 1, "refund": 100}]'::jsonb);
insert into businesses (code, name, tagline, booking_type, color, id_prefix, deposit_type, deposit_value, cancel_policy, need_vaccine, sort, active, open_hours, closed_weekdays, cancel_rules) values ('grooming', 'Grooming', 'อาบน้ำ ตัดขน', 'slot', '#E8444C', 'G', 'fixed', 200, 'ยกเลิก/เลื่อนก่อน 24 ชม. ฟรี · น้อยกว่า 24 ชม. ไม่คืนมัดจำ', false, 4, true, '09:00-18:00', array[1]::smallint[], '[{"days": 1, "refund": 100}]'::jsonb);
insert into units (code, business_code, name, summary, price, max_pets, max_pet_kg, amenities, sort, active) values ('COZY1', 'pet_hotel', 'Cozy 1', '6 ตร.ม. · รับ 1 ตัว', 650, 1, 10, array['แอร์','กล้องดูน้อง']::text[], 1, true);
insert into units (code, business_code, name, summary, price, max_pets, max_pet_kg, amenities, sort, active) values ('COZY2', 'pet_hotel', 'Cozy 2', '6 ตร.ม. · รับ 1 ตัว', 650, 1, 10, array['แอร์','กล้องดูน้อง']::text[], 2, true);
insert into units (code, business_code, name, summary, price, max_pets, amenities, sort, active) values ('GARDEN1', 'pet_hotel', 'Garden 1', 'ติดสนาม · รับ 2 ตัว', 950, 2, array['แอร์','สนามส่วนตัว']::text[], 3, true);
insert into units (code, business_code, name, summary, price, max_pets, amenities, sort, active) values ('GARDEN2', 'pet_hotel', 'Garden 2', 'ติดสนาม · รับ 2 ตัว', 950, 2, array['แอร์','สนามส่วนตัว']::text[], 4, true);
insert into units (code, business_code, name, summary, price, max_people, bedrooms, max_pets, pet_fee, amenities, rules, sort, active) values ('TEAK', 'villa', 'บ้านสักริมสวน', '3 ห้องนอน · 8 คน · สระส่วนตัว', 4500, 8, 3, 2, 300, array['สระส่วนตัว','ครัว','Wi-Fi','ที่จอดรถ']::text[], 'ห้ามสูบบุหรี่ในบ้าน · งดเสียงดังหลัง 22:00', 1, true);
insert into units (code, business_code, name, summary, price, max_people, bedrooms, max_pets, pet_fee, amenities, rules, sort, active) values ('LOFT', 'villa', 'ลอฟต์ทุ่งนา', '2 ห้องนอน · 4 คน', 3200, 4, 2, 2, 300, array['ครัว','Wi-Fi','ระเบียงวิวนา']::text[], 'ห้ามสูบบุหรี่ในบ้าน', 2, true);
insert into units (code, business_code, name, summary, price, amenities, rules, sort, active) values ('POOL1', 'pool', 'สระหลัก', 'สระน้ำเกลือสำหรับน้อง', 240, array['ห้องอาบน้ำ','ผ้าเช็ดตัว']::text[], 'น้องต้องมีวัคซีนครบ · เจ้าของอยู่ดูแลตลอด', 1, true);
insert into weight_tiers (code, label, min_kg, max_kg) values ('S', 'เล็ก', 0, 5);
insert into weight_tiers (code, label, min_kg, max_kg) values ('M', 'กลาง', 5, 10);
insert into weight_tiers (code, label, min_kg, max_kg) values ('L', 'ใหญ่', 10, 20);
insert into weight_tiers (code, label, min_kg) values ('XL', 'ใหญ่พิเศษ', 20);
insert into services (code, business_code, name, kind, price_mode, sort, active) values ('G-BATH', 'grooming', 'อาบน้ำ + เป่า', 'main', 'by_weight', 1, true);
insert into services (code, business_code, name, kind, price_mode, sort, active) values ('G-CUT', 'grooming', 'อาบ + ตัดทรง', 'main', 'by_weight', 2, true);
insert into services (code, business_code, name, kind, description, price_mode, sort, active) values ('G-STYLE', 'grooming', 'แต่งทรงอย่างเดียว', 'main', 'ไม่อาบ · ขนต้องสะอาดและแห้ง', 'by_weight', 3, true);
insert into services (code, business_code, name, kind, description, price_mode, price, duration_min, sort, active) values ('G-SPOT', 'grooming', 'ตัดเฉพาะจุด', 'main', 'หน้า เท้า ก้น', 'flat', 200, 30, 4, true);
insert into services (code, business_code, name, kind, price_mode, sort, active) values ('G-DRY', 'grooming', 'ไดขนทั้งตัว', 'main', 'by_weight', 5, true);
insert into services (code, business_code, name, kind, price_mode, price, duration_min, sort, active) values ('A-NAIL', 'grooming', 'ตัดเล็บ', 'addon', 'flat', 80, 10, 10, true);
insert into services (code, business_code, name, kind, price_mode, price, duration_min, sort, active) values ('A-TEETH', 'grooming', 'แปรงฟัน', 'addon', 'flat', 100, 10, 11, true);
insert into services (code, business_code, name, kind, price_mode, price, duration_min, sort, active) values ('A-EAR', 'grooming', 'เช็ดหู', 'addon', 'flat', 60, 10, 12, true);
insert into services (code, business_code, name, kind, price_mode, price, duration_min, sort, active) values ('A-SPA', 'grooming', 'สปาบำรุงขน', 'addon', 'flat', 200, 20, 13, true);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-BATH', 'S', 350, 60);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-BATH', 'M', 450, 75);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-BATH', 'L', 550, 90);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-BATH', 'XL', 700, 120);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-CUT', 'S', 550, 120);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-CUT', 'M', 650, 135);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-CUT', 'L', 750, 150);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-CUT', 'XL', 900, 180);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-STYLE', 'S', 300, 60);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-STYLE', 'M', 400, 75);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-STYLE', 'L', 500, 90);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-STYLE', 'XL', 650, 120);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-DRY', 'S', 450, 90);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-DRY', 'M', 550, 105);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-DRY', 'L', 650, 120);
insert into service_prices (service_code, tier_code, price, duration_min) values ('G-DRY', 'XL', 800, 150);
insert into unit_photos (file, caption, is_cover, sort, unit_code) values ('teak-01.jpg', 'ด้านหน้าบ้าน', true, 1, 'TEAK');
insert into unit_photos (file, caption, is_cover, sort, unit_code) values ('teak-02.jpg', 'สระส่วนตัว', false, 2, 'TEAK');
insert into unit_photos (file, caption, is_cover, sort, unit_code) values ('teak-03.jpg', 'ห้องนอนใหญ่', false, 3, 'TEAK');
insert into unit_photos (file, caption, is_cover, sort, unit_code) values ('loft-01.jpg', 'วิวทุ่งนา', true, 1, 'LOFT');
insert into unit_photos (file, is_cover, sort, unit_code) values ('cozy-01.jpg', true, 1, 'COZY1');
insert into unit_photos (file, caption, is_cover, sort, unit_code) values ('garden-01.jpg', 'สนามหน้าห้อง', true, 1, 'GARDEN1');
insert into unit_photos (file, is_cover, sort, unit_code) values ('pool-01.jpg', true, 1, 'POOL1');
insert into unit_photos (file, is_cover, sort, service_code) values ('g-bath.jpg', true, 1, 'G-BATH');
insert into pool_sessions (code, unit_code, weekdays, size_rule, capacity, price, active, start_time, end_time) values ('S1000', 'POOL1', array[1,2,3,4,5,6,7]::smallint[], 'small', 10, 240, true, '10:00', '11:00');
insert into pool_sessions (code, unit_code, weekdays, size_rule, capacity, price, active, start_time, end_time) values ('S1300', 'POOL1', array[1,2,3,4,5,6,7]::smallint[], 'large', 15, 240, true, '13:00', '14:00');
insert into pool_sessions (code, unit_code, weekdays, size_rule, capacity, price, active, start_time, end_time) values ('S1500', 'POOL1', array[6,7]::smallint[], 'all', 8, 240, true, '15:00', '16:00');
insert into staff (code, display_name, role, businesses, is_groomer, invite_status) values ('ST01', 'ฝน', 'owner', array['all']::text[], false, 'pending');
insert into staff (code, display_name, role, businesses, is_groomer, work_days, work_start, work_end, invite_status) values ('ST02', 'มะปราง', 'staff', array['grooming']::text[], true, array[2,3,4,5,6,7]::smallint[], '10:00', '19:00', 'pending');
insert into staff (code, display_name, role, businesses, is_groomer, work_days, work_start, work_end, invite_status) values ('ST03', 'ต้นหอม', 'staff', array['grooming','pool']::text[], true, array[1,2,3,5,6,7]::smallint[], '10:00', '19:00', 'pending');
insert into closures (business_code, date_from, date_to, reason) values ('pool', '2026-11-25', '2026-11-25', 'ล้างระบบกรองน้ำ');
insert into closures (business_code, date_from, date_to, reason, unit_code) values ('villa', '2026-12-01', '2026-12-03', 'ซ่อมบำรุง', 'LOFT');
insert into cross_sells (from_business, offer_business, offer_item, title, when_rule, sort) values ('pet_hotel', 'grooming', 'G-BATH', 'อาบน้ำก่อนรับกลับ', 'checkout_day', 1);
insert into cross_sells (from_business, offer_business, title, when_rule, sort) values ('pet_hotel', 'pool', 'ว่ายน้ำระหว่างพัก', 'during_stay', 2);
insert into cross_sells (from_business, offer_business, title, when_rule, sort) values ('villa', 'pet_hotel', 'ฝากน้องที่ Pet hotel', 'during_stay', 1);
insert into cross_sells (from_business, offer_business, title, when_rule, condition, sort) values ('villa', 'pool', 'รอบสระระหว่างพัก', 'during_stay', 'เฉพาะเมื่อพาน้องมา', 2);
insert into cross_sells (from_business, offer_business, offer_item, title, when_rule, condition, sort) values ('villa', 'grooming', 'G-BATH', 'อาบน้ำน้องก่อนกลับ', 'checkout_day', 'เฉพาะเมื่อพาน้องมา', 3);
insert into cross_sells (from_business, offer_business, offer_item, title, when_rule, sort) values ('pool', 'grooming', 'G-BATH', 'อาบน้ำหลังว่าย', 'same_day', 1);
insert into customers (code, line_user_id, display_name, phone, email, pdpa_at, policy_version) values ('C001', 'Utest0001', 'มายด์', '0800000001', 'mind@example.com', '2026-11-01 10:00+07', '2026-11-01');
insert into customers (code, line_user_id, display_name, phone, pdpa_at, policy_version) values ('C002', 'Utest0002', 'ต้า', '0800000002', '2026-11-02 09:00+07', '2026-11-01');
insert into customers (code, line_user_id, display_name, phone, pdpa_at, policy_version) values ('C003', 'Utest0003', 'มิว', '0800000003', '2026-11-03 12:00+07', '2026-11-01');
insert into customers (code, line_user_id, display_name, phone, email, pdpa_at, policy_version) values ('C004', 'Utest0004', 'ธาม', '0800000004', 'tham@example.com', '2026-11-05 20:00+07', '2026-11-01');
insert into customers (code, line_user_id, display_name, phone, pdpa_at, policy_version) values ('C005', 'Utest0005', 'จ๋า', '0800000005', '2026-11-06 08:30+07', '2026-11-01');
insert into customers (code, line_user_id, display_name, phone, pdpa_at, policy_version) values ('C006', 'Utest0006', 'แพรว', '0800000006', '2026-11-10 13:00+07', '2026-11-01');
insert into customers (code, line_user_id, display_name, phone, pdpa_at, policy_version) values ('C007', 'Utest0007', 'บีม', '0800000007', '2026-11-12 18:00+07', '2026-11-01');
insert into pets (code, customer_code, name, species, breed, weight_kg, tags) values ('P001', 'C001', 'โมจิ', 'dog', 'ปอม', 3.2, array['กลัวเสียงไดร์']::text[]);
insert into pets (code, customer_code, name, species, breed, weight_kg, tags) values ('P002', 'C001', 'ข้าวตู', 'dog', 'ชิสุ', 6.5, array['แพ้ไก่']::text[]);
insert into pets (code, customer_code, name, species, breed, weight_kg, tags) values ('P003', 'C002', 'พุดดิ้ง', 'dog', 'ชิบะ', 9, array['กลัวเสียงไดร์']::text[]);
insert into pets (code, customer_code, name, species, breed, weight_kg, tags) values ('P004', 'C002', 'นมสด', 'dog', 'ชิบะ', 8.5, '{}');
insert into pets (code, customer_code, name, species, breed, weight_kg, tags) values ('P005', 'C003', 'ลาเต้', 'dog', 'พุดเดิ้ล', 4.8, '{}');
insert into pets (code, customer_code, name, species, breed, weight_kg, tags) values ('P006', 'C005', 'ปุยฝ้าย', 'dog', 'ปอม', 2.9, '{}');
insert into pets (code, customer_code, name, species, breed, weight_kg, tags) values ('P007', 'C007', 'ขนมปัง', 'dog', 'บีเกิ้ล', 10.2, array['ชอบหนี']::text[]);
insert into pets (code, customer_code, name, species, breed, weight_kg, tags) values ('P008', 'C006', 'ถั่วแดง', 'dog', 'พันธุ์ผสม', 7, '{}');
insert into pet_vaccines (pet_code, vaccine, expires_on, photo, status, reviewed_by) values ('P001', 'รวม 5 โรค', '2027-06-30', 'p001-vac.jpg', 'approved', 'ST01');
insert into pet_vaccines (pet_code, vaccine, expires_on, photo, status, reviewed_by) values ('P001', 'พิษสุนัขบ้า', '2027-06-30', 'p001-vac.jpg', 'approved', 'ST01');
insert into pet_vaccines (pet_code, vaccine, expires_on, photo, status, reviewed_by) values ('P002', 'รวม 5 โรค', '2026-10-01', 'p002-vac.jpg', 'approved', 'ST01');
insert into pet_vaccines (pet_code, vaccine, expires_on, photo, status, reviewed_by) values ('P003', 'รวม 5 โรค', '2027-03-15', 'p003-vac.jpg', 'approved', 'ST01');
insert into pet_vaccines (pet_code, vaccine, expires_on, photo, status, reviewed_by) values ('P004', 'รวม 5 โรค', '2027-03-15', 'p004-vac.jpg', 'approved', 'ST01');
insert into pet_vaccines (pet_code, vaccine, expires_on, photo, status, reviewed_by) values ('P006', 'รวม 5 โรค', '2027-01-20', 'p006-vac.jpg', 'approved', 'ST01');
insert into pet_vaccines (pet_code, vaccine, expires_on, photo, status, reviewed_by) values ('P007', 'รวม 5 โรค', '2027-02-10', 'p007-vac.jpg', 'approved', 'ST01');
insert into orders (code, customer_code, status, total, due_now, created_at) values ('T-261120-01', 'C002', 'paid', 480, 480, '2026-11-20 09:10+07');
insert into orders (code, customer_code, status, total, due_now, created_at) values ('T-261119-01', 'C003', 'paid', 550, 200, '2026-11-19 21:00+07');
insert into orders (code, customer_code, status, total, due_now, created_at) values ('T-261115-01', 'C004', 'paid', 3200, 1600, '2026-11-15 19:40+07');
insert into orders (code, customer_code, status, total, due_now, created_at) values ('T-261118-01', 'C005', 'paid', 650, 650, '2026-11-18 12:00+07');
insert into orders (code, customer_code, status, total, due_now, hold_until, created_at) values ('T-261121-01', 'C006', 'pending_review', 9600, 4800, '2026-11-21 10:30+07', '2026-11-21 10:00+07');
insert into orders (code, customer_code, status, total, due_now, hold_until, created_at) values ('T-261121-02', 'C007', 'pending_review', 950, 950, '2026-11-21 10:45+07', '2026-11-21 10:15+07');
insert into bookings (code, order_code, business_code, start_at, end_at, price, status, session_code) values ('P-261121-01', 'T-261120-01', 'pool', '2026-11-21 10:00+07', '2026-11-21 11:00+07', 480, 'confirmed', 'S1000');
insert into booking_pets (booking_code, pet_code) values ('P-261121-01', 'P003');
insert into booking_pets (booking_code, pet_code) values ('P-261121-01', 'P004');
insert into bookings (code, order_code, business_code, staff_code, start_at, end_at, price, status, service_code, addon_codes) values ('G-261121-01', 'T-261119-01', 'grooming', 'ST02', '2026-11-21 14:00+07', '2026-11-21 16:00+07', 550, 'confirmed', 'G-CUT', '{}');
insert into booking_pets (booking_code, pet_code) values ('G-261121-01', 'P005');
insert into bookings (code, order_code, business_code, start_at, end_at, guests, price, status, unit_code) values ('V-261121-01', 'T-261115-01', 'villa', '2026-11-21 14:00+07', '2026-11-22 12:00+07', 2, 3200, 'confirmed', 'LOFT');
insert into bookings (code, order_code, business_code, start_at, end_at, price, status, unit_code) values ('H-261121-01', 'T-261118-01', 'pet_hotel', '2026-11-21 16:00+07', '2026-11-22 12:00+07', 650, 'confirmed', 'COZY1');
insert into booking_pets (booking_code, pet_code) values ('H-261121-01', 'P006');
insert into bookings (code, order_code, business_code, start_at, end_at, guests, price, status, unit_code) values ('V-261121-02', 'T-261121-01', 'villa', '2026-11-21 14:00+07', '2026-11-23 12:00+07', 6, 9600, 'holding', 'TEAK');
insert into booking_pets (booking_code, pet_code) values ('V-261121-02', 'P008');
insert into bookings (code, order_code, business_code, start_at, end_at, price, status, unit_code) values ('H-261121-02', 'T-261121-02', 'pet_hotel', '2026-11-21 16:00+07', '2026-11-22 12:00+07', 950, 'holding', 'GARDEN2');
insert into booking_pets (booking_code, pet_code) values ('H-261121-02', 'P007');
insert into payments (code, order_code, amount_due, amount_slip, slip_file, status, created_at) values ('PAY-0001', 'T-261121-01', 4800, 4500, 'slip-0001.jpg', 'pending', '2026-11-21 10:05+07');
insert into payments (code, order_code, amount_due, amount_slip, slip_file, status, created_at) values ('PAY-0002', 'T-261121-02', 950, 950, 'slip-0002.jpg', 'pending', '2026-11-21 10:20+07');
insert into passes (code, customer_code, total_uses, remaining, expires_on) values ('PS-0001', 'C002', 10, 6, '2027-02-28');
insert into coupons (code, business_code, discount_type, discount_value, valid_until, max_uses) values ('POOLFRIEND', 'pool', 'percent', 20, '2026-12-31', 100);
insert into code_counters (prefix, day, n)
select split_part(code, '-', 1), split_part(code, '-', 2), max(split_part(code, '-', 3)::int)
from (select code from bookings union all select code from orders) x
where code ~ '^[A-Z]+-[0-9]{6}-[0-9]+$' group by 1, 2
on conflict (prefix, day) do update set n = greatest(code_counters.n, excluded.n);
insert into code_counters (prefix, day, n)
select 'PAY', '', max(split_part(code, '-', 2)::int) from payments where code ~ '^PAY-[0-9]+$' having count(*) > 0
on conflict (prefix, day) do update set n = greatest(code_counters.n, excluded.n);
