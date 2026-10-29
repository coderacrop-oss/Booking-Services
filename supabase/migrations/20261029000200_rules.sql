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
