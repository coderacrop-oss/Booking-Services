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
