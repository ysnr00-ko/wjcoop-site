-- 0단계 권한 검사 테스트 (가짜 데이터만 사용)
-- 실행: office/supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = notice;

create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception '실패: %', msg; end if;
  raise notice '통과: %', msg;
end $$;

-- 실패해야 하는 문장을 실행해 보고, 실패하면 true
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
grant execute on function pg_temp.ok(boolean, text), pg_temp.fails(text) to anon, authenticated;

-- 가짜 사람: 관리자(사무국장 역할) 1명, 직원 1명
insert into public.people (id, email, name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.com', '가짜관리자', true),
  ('00000000-0000-0000-0000-0000000000b1', 'staff@example.com', '가짜직원', false);
-- 관리자: 구글처럼 이미 확인된 이메일로 가입 / 직원: 초대 메일로 가입(처음엔 미확인)
insert into auth.users (id, email, email_confirmed_at) values
  ('11111111-0000-0000-0000-0000000000a1', 'Admin@Example.com', now());
insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-0000000000b1', 'staff@example.com');
select pg_temp.ok((select auth_user_id from public.people where email = 'staff@example.com') is null,
                  '초대 메일 링크를 누르기 전(이메일 미확인)에는 계정과 연결되지 않는다');
update auth.users set email_confirmed_at = now() where id = '11111111-0000-0000-0000-0000000000b1';
select pg_temp.ok((select auth_user_id from public.people where email = 'staff@example.com')
                  = '11111111-0000-0000-0000-0000000000b1', '초대 메일 링크를 누르면 계정과 연결된다');
insert into auth.sessions (id, user_id) values
  ('22222222-0000-0000-0000-0000000000a1', '11111111-0000-0000-0000-0000000000a1'),
  ('22222222-0000-0000-0000-0000000000b1', '11111111-0000-0000-0000-0000000000b1'),
  ('22222222-0000-0000-0000-0000000000b2', '11111111-0000-0000-0000-0000000000b1');

select pg_temp.ok((select auth_user_id from public.people where email = 'admin@example.com')
                  = '11111111-0000-0000-0000-0000000000a1', '초대한 이메일은 대소문자 달라도 계정과 연결된다');
select pg_temp.ok(pg_temp.fails($$insert into auth.users (email) values ('stranger@example.com')$$),
                  '초대받지 않은 이메일은 계정을 만들 수 없다 (구글 로그인 포함)');

-- ------------------------------------------------------------ 로그인 안 한 사람
set role anon;
select pg_temp.ok(pg_temp.fails('select * from public.people'), '로그인 안 하면 사람 목록을 못 본다');
select pg_temp.ok(pg_temp.fails('select * from public.org_settings'), '로그인 안 하면 조직 정보를 못 본다');
reset role;

-- ------------------------------------------------------------ 관리자
set role authenticated;
set request.jwt.claim.sub = '11111111-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"session_id": "22222222-0000-0000-0000-0000000000a1"}';
select pg_temp.ok(public.is_admin(), '관리자는 관리자로 인식된다');

insert into public.departments (id, name) values ('d0000000-0000-0000-0000-000000000001', '법인');
insert into public.departments (id, parent_id, name) values
  ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', '사무국');
insert into public.departments (id, parent_id, name, is_independent) values
  ('d0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', '산하센터', true);
select pg_temp.ok(pg_temp.fails($$insert into public.departments (name) values ('두번째 법인')$$),
                  '최상위 부서(법인)는 하나뿐이다');
select pg_temp.ok(pg_temp.fails($$update public.departments set parent_id = 'd0000000-0000-0000-0000-000000000003'
                                  where id = 'd0000000-0000-0000-0000-000000000001'$$),
                  '부서를 자기 아래 부서 밑으로 옮길 수 없다');

insert into public.positions (id, name, rank) values
  ('e0000000-0000-0000-0000-000000000001', '팀장', 20),
  ('e0000000-0000-0000-0000-000000000002', '사무국장', 40),
  ('e0000000-0000-0000-0000-000000000003', '이사장', 50);
insert into public.assignments (person_id, department_id, position_id, starts_on) values
  ('00000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-000000000002',
   'e0000000-0000-0000-0000-000000000002', current_date),
  ('00000000-0000-0000-0000-0000000000b1', 'd0000000-0000-0000-0000-000000000003',
   'e0000000-0000-0000-0000-000000000001', current_date);
insert into public.approval_lines (id, department_id, name, is_default) values
  ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', '사무국', true);
insert into public.approval_line_steps (line_id, seq, position_id) values
  ('f0000000-0000-0000-0000-000000000001', 1, 'e0000000-0000-0000-0000-000000000002'),
  ('f0000000-0000-0000-0000-000000000001', 2, 'e0000000-0000-0000-0000-000000000003');
update public.org_settings set name = '가짜 협동조합';

select pg_temp.ok(pg_temp.fails($$update public.people set auth_user_id = null where email = 'staff@example.com'$$),
                  '관리자도 로그인 연결 정보는 바꿀 수 없다');
select pg_temp.ok(pg_temp.fails($$update public.people set is_admin = false where email = 'admin@example.com'$$),
                  '마지막 관리자는 관리자 권한을 잃을 수 없다');
select pg_temp.ok(pg_temp.fails($$delete from public.people where email = 'staff@example.com'$$), '사람 삭제는 거부된다');
select pg_temp.ok((select count(*) from public.people) = 2, '사람은 삭제되지 않는다 (관리자도 비활성만 가능)');
select pg_temp.ok((select count(*) from public.audit_log) > 0, '관리자는 변경 기록을 볼 수 있다');
insert into public.people (email, name, joined_at, deactivated_at)
  values ('fake@example.com', '거짓이력', '2000-01-01', '2000-01-01');
select pg_temp.ok((select joined_at is null and deactivated_at is null from public.people where email = 'fake@example.com'),
                  '관리자도 가입·비활성 시각을 거짓으로 적을 수 없다');
select pg_temp.ok(pg_temp.fails($$update public.people set deactivated_at = '2000-01-01' where email = 'fake@example.com'$$),
                  '활성 상태를 바꾸지 않고 비활성 시각만 고칠 수 없다');
select pg_temp.ok(pg_temp.fails('truncate public.assignments'), '표를 통째로 비울 수 없다 (기록 건너뛰기 방지)');
reset role;

select pg_temp.ok((select actor_name from public.audit_log where table_name = 'departments' limit 1) = '가짜관리자',
                  '변경 기록에 바꾼 사람 이름이 남는다');

-- ------------------------------------------------------------ 직원
set role authenticated;
set request.jwt.claim.sub = '11111111-0000-0000-0000-0000000000b1';
set request.jwt.claims = '{"session_id": "22222222-0000-0000-0000-0000000000b1"}';
select pg_temp.ok(not public.is_admin(), '직원은 관리자가 아니다');
select pg_temp.ok((select count(*) from public.departments) = 3, '직원은 부서 목록을 볼 수 있다');
select pg_temp.ok((select count(*) from public.people) = 3, '직원은 결재자 고를 때 쓸 직원 목록을 볼 수 있다');
select pg_temp.ok((select count(*) from public.audit_log) = 0, '직원은 변경 기록을 못 본다');

select pg_temp.ok(pg_temp.fails($$insert into public.departments (parent_id, name)
                                  values ('d0000000-0000-0000-0000-000000000001', '몰래 만든 부서')$$),
                  '직원은 부서를 추가할 수 없다');
update public.departments set name = '바뀐이름';  -- RLS 때문에 0줄만 바뀌어야 한다
select pg_temp.ok(not exists (select 1 from public.departments where name = '바뀐이름'), '직원은 부서 이름을 못 바꾼다');
update public.people set is_admin = true where email = 'staff@example.com';
select pg_temp.ok(not public.is_admin(), '직원은 스스로 관리자가 될 수 없다');
update public.org_settings set name = '해킹';
select pg_temp.ok((select name from public.org_settings) = '가짜 협동조합', '직원은 조직 정보를 못 바꾼다');
select pg_temp.ok(pg_temp.fails($$insert into public.positions (name, rank) values ('대표', 99)$$), '직원은 직책을 못 만든다');
select pg_temp.ok(pg_temp.fails($$insert into public.approval_line_steps (line_id, seq, position_id)
                                  values ('f0000000-0000-0000-0000-000000000001', 3, 'e0000000-0000-0000-0000-000000000001')$$),
                  '직원은 결재선을 못 바꾼다');
select pg_temp.ok(pg_temp.fails($$insert into public.audit_log (table_name, action) values ('x', 'INSERT')$$),
                  '직원은 변경 기록을 직접 쓸 수 없다');
select pg_temp.ok(pg_temp.fails($$select public.admin_sign_out_everywhere('00000000-0000-0000-0000-0000000000a1')$$),
                  '직원은 다른 사람을 강제 로그아웃시킬 수 없다');
select pg_temp.ok(pg_temp.fails($$insert into public.people (email, name) values ('friend@example.com', '친구')$$),
                  '직원은 사람을 초대할 수 없다');
select pg_temp.ok(pg_temp.fails($$insert into storage.objects (bucket_id, name) values ('org-assets', 'logo.png')$$),
                  '직원은 로고·직인을 올릴 수 없다');
select pg_temp.ok(pg_temp.fails('truncate public.approval_line_steps'), '직원은 표를 통째로 비울 수 없다');
reset role;
insert into storage.objects (bucket_id, name) values ('org-assets', 'logo/logo.png'), ('org-assets', 'seal/seal.png');
set role authenticated;
select pg_temp.ok((select array_agg(name) from storage.objects) = array['logo/logo.png'],
                  '직원은 로고는 보지만 직인 이미지는 못 본다');
reset role;

-- ------------------------------------------------------------ 강제 로그아웃과 비활성
set role authenticated;
set request.jwt.claim.sub = '11111111-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"session_id": "22222222-0000-0000-0000-0000000000a1"}';
select public.admin_sign_out_everywhere('00000000-0000-0000-0000-0000000000b1');
reset role;
select pg_temp.ok((select count(*) from auth.sessions where user_id = '11111111-0000-0000-0000-0000000000b1') = 0,
                  '관리자가 강제 로그아웃하면 그 사람의 모든 기기 로그인이 끊긴다');
select pg_temp.ok(exists (select 1 from public.audit_log where new_data ? '강제로그아웃'), '강제 로그아웃도 변경 기록에 남는다');
set role authenticated;
set request.jwt.claim.sub = '11111111-0000-0000-0000-0000000000b1';
set request.jwt.claims = '{"session_id": "22222222-0000-0000-0000-0000000000b1"}';
select pg_temp.ok((select count(*) from public.people) = 0, '강제 로그아웃 직후, 남은 출입증(토큰)으로도 아무것도 못 본다');
set request.jwt.claim.sub = '11111111-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"session_id": "22222222-0000-0000-0000-0000000000a1"}';
update public.people set is_active = false where email = 'staff@example.com';
reset role;
insert into auth.sessions (id, user_id) values ('22222222-0000-0000-0000-0000000000b3', '11111111-0000-0000-0000-0000000000b1');
select pg_temp.ok((select deactivated_at is not null from public.people where email = 'staff@example.com'),
                  '비활성으로 바꾸면 비활성 시각이 남는다');
select pg_temp.ok((select count(*) from public.assignments
                    where person_id = '00000000-0000-0000-0000-0000000000b1') = 1,
                  '비활성이 돼도 발령 이력은 그대로 남는다');

set role authenticated;
set request.jwt.claim.sub = '11111111-0000-0000-0000-0000000000b1';
set request.jwt.claims = '{"session_id": "22222222-0000-0000-0000-0000000000b3"}';
select pg_temp.ok((select count(*) from public.people) = 0, '비활성 직원은 새로 로그인해도 아무것도 못 본다');
reset role;

\echo '모든 테스트 통과'
