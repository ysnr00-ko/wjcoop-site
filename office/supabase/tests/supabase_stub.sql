-- 로컬 테스트용: Supabase 가 기본으로 갖춘 부분(역할, auth, storage)을 흉내 낸다.
-- 실제 Supabase 에는 이미 있으므로 이 파일은 테스트에서만 쓴다.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

-- Supabase 기본 권한과 같게: public 표는 anon/authenticated 에게 열려 있고 RLS 로 막는다
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
