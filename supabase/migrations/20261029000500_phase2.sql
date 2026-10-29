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
