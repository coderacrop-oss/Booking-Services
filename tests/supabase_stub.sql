-- จำลองส่วนที่ Supabase มีให้ (ใช้ทดสอบบน Postgres เปล่าเท่านั้น ห้ามรันบน Supabase)
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select on tables to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
