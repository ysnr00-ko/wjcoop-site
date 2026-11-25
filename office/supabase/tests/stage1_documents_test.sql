-- 1단계-1 전자결재 흐름 테스트 (가짜 데이터만 사용)
-- 실행: office/supabase/tests/run.sh
\set ON_ERROR_STOP on
set client_min_messages = notice;

create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception '실패: %', msg; end if;
  raise notice '통과: %', msg;
end $$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;
-- 문서 상태 · 단계 상태 확인용 (관리자 권한 없이 실제 값을 본다)
create function pg_temp.doc_status(p uuid) returns text language sql security definer as $$
  select status from public.documents where id = p $$;
create function pg_temp.steps(p uuid) returns text language sql security definer as $$
  select string_agg(position_name || ':' || status, ' ' order by seq, step_type = 'cooperate', position_name)
    from public.document_steps where document_id = p $$;
grant execute on function pg_temp.ok(boolean, text), pg_temp.fails(text),
  pg_temp.doc_status(uuid), pg_temp.steps(uuid) to anon, authenticated;

-- ------------------------------------------------------------ 가짜 조직
-- 법인 → 사무국, 산하센터(독립 운영)
insert into public.departments (id, name) values ('d0000000-0000-0000-0000-000000000001', '법인');
insert into public.departments (id, parent_id, name, is_independent) values
  ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', '사무국', false),
  ('d0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', '산하센터', true);
insert into public.positions (id, name, rank) values
  ('e0000000-0000-0000-0000-000000000001', '이사장', 50),
  ('e0000000-0000-0000-0000-000000000002', '센터장', 40),
  ('e0000000-0000-0000-0000-000000000003', '사무국장', 40),
  ('e0000000-0000-0000-0000-000000000004', '부장', 30),
  ('e0000000-0000-0000-0000-000000000005', '팀장', 20),
  ('e0000000-0000-0000-0000-000000000006', '직원', 10);

-- 가짜 사람 7명 (1 이사장, 2 사무국장·관리자, 3 센터장, 4 부장, 5 팀장, 6 센터 직원, 7 사무국 직원)
insert into public.people (id, email, name, is_admin) values
  ('00000000-0000-0000-0000-000000000001', 'p1@example.com', '가짜이사장', false),
  ('00000000-0000-0000-0000-000000000002', 'p2@example.com', '가짜사무국장', true),
  ('00000000-0000-0000-0000-000000000003', 'p3@example.com', '가짜센터장', false),
  ('00000000-0000-0000-0000-000000000004', 'p4@example.com', '가짜부장', false),
  ('00000000-0000-0000-0000-000000000005', 'p5@example.com', '가짜팀장', false),
  ('00000000-0000-0000-0000-000000000006', 'p6@example.com', '가짜센터직원', false),
  ('00000000-0000-0000-0000-000000000007', 'p7@example.com', '가짜사무국직원', false);
insert into auth.users (id, email, email_confirmed_at)
select ('11111111-0000-0000-0000-00000000000' || n)::uuid, 'p' || n || '@example.com', now()
  from generate_series(1, 7) n;
insert into auth.sessions (id, user_id)
select ('22222222-0000-0000-0000-00000000000' || n)::uuid, ('11111111-0000-0000-0000-00000000000' || n)::uuid
  from generate_series(1, 7) n;
insert into public.assignments (person_id, department_id, position_id, starts_on) values
  ('00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '2026-01-01'),
  ('00000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003', '2026-01-01'),
  ('00000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000002', '2026-01-01'),
  ('00000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000004', '2026-01-01'),
  ('00000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000005', '2026-01-01'),
  ('00000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000006', '2026-01-01'),
  ('00000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000006', '2026-01-01');

-- 계획서의 결재선 3가지
insert into public.approval_lines (id, department_id, name, is_default, is_jeongyeol) values
  ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', '센터 · 전결', true, true),
  ('f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', '센터 · 전체', false, false),
  ('f0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', '사무국', true, false);
insert into public.approval_line_steps (line_id, seq, position_id, step_type) values
  ('f0000000-0000-0000-0000-000000000001', 1, 'e0000000-0000-0000-0000-000000000005', 'approve'),
  ('f0000000-0000-0000-0000-000000000001', 2, 'e0000000-0000-0000-0000-000000000004', 'approve'),
  ('f0000000-0000-0000-0000-000000000001', 3, 'e0000000-0000-0000-0000-000000000002', 'approve'),
  ('f0000000-0000-0000-0000-000000000001', 3, 'e0000000-0000-0000-0000-000000000003', 'cooperate'),
  ('f0000000-0000-0000-0000-000000000001', 4, 'e0000000-0000-0000-0000-000000000001', 'jeongyeol_mark'),
  ('f0000000-0000-0000-0000-000000000002', 1, 'e0000000-0000-0000-0000-000000000005', 'approve'),
  ('f0000000-0000-0000-0000-000000000002', 2, 'e0000000-0000-0000-0000-000000000004', 'approve'),
  ('f0000000-0000-0000-0000-000000000002', 3, 'e0000000-0000-0000-0000-000000000002', 'approve'),
  ('f0000000-0000-0000-0000-000000000002', 3, 'e0000000-0000-0000-0000-000000000003', 'cooperate'),
  ('f0000000-0000-0000-0000-000000000002', 4, 'e0000000-0000-0000-0000-000000000001', 'approve'),
  ('f0000000-0000-0000-0000-000000000003', 1, 'e0000000-0000-0000-0000-000000000003', 'approve'),
  ('f0000000-0000-0000-0000-000000000003', 2, 'e0000000-0000-0000-0000-000000000001', 'approve');

-- 로그인 전환 (사람 번호별)
\set p1 'reset role; set request.jwt.claim.sub = ''11111111-0000-0000-0000-000000000001''; set request.jwt.claims = ''{"session_id": "22222222-0000-0000-0000-000000000001"}''; set role authenticated;'
\set p2 'reset role; set request.jwt.claim.sub = ''11111111-0000-0000-0000-000000000002''; set request.jwt.claims = ''{"session_id": "22222222-0000-0000-0000-000000000002"}''; set role authenticated;'
\set p3 'reset role; set request.jwt.claim.sub = ''11111111-0000-0000-0000-000000000003''; set request.jwt.claims = ''{"session_id": "22222222-0000-0000-0000-000000000003"}''; set role authenticated;'
\set p4 'reset role; set request.jwt.claim.sub = ''11111111-0000-0000-0000-000000000004''; set request.jwt.claims = ''{"session_id": "22222222-0000-0000-0000-000000000004"}''; set role authenticated;'
\set p5 'reset role; set request.jwt.claim.sub = ''11111111-0000-0000-0000-000000000005''; set request.jwt.claims = ''{"session_id": "22222222-0000-0000-0000-000000000005"}''; set role authenticated;'
\set p6 'reset role; set request.jwt.claim.sub = ''11111111-0000-0000-0000-000000000006''; set request.jwt.claims = ''{"session_id": "22222222-0000-0000-0000-000000000006"}''; set role authenticated;'
\set p7 'reset role; set request.jwt.claim.sub = ''11111111-0000-0000-0000-000000000007''; set request.jwt.claims = ''{"session_id": "22222222-0000-0000-0000-000000000007"}''; set role authenticated;'

-- =====================================================================
-- 1. 센터 전결: 직원 → 팀장 → 부장 → 센터장(+사무국장 협조), 이사장 칸은 '전결' 표시
-- =====================================================================
:p6
insert into public.documents (id, doc_type, title, department_id, line_id, body, amount, payee, pay_date) values
  ('a0000000-0000-0000-0000-000000000001', 'expense', '가짜 사무용품 구입', 'd0000000-0000-0000-0000-000000000003',
   'f0000000-0000-0000-0000-000000000001', '복사용지 10박스', 250000, '가짜문구점', '2026-12-01');
select pg_temp.ok(not pg_temp.fails($$insert into public.documents (doc_type, title, department_id)
                                      values ('proposal', '저장하며 돌려받기', 'd0000000-0000-0000-0000-000000000003')
                                      returning id$$),
                  '새 문서를 저장하면서 바로 돌려받을 수 있다 (화면에서 저장할 때 쓰는 방식)');
select pg_temp.ok((select drafter_id from public.documents where id = 'a0000000-0000-0000-0000-000000000001')
                  = '00000000-0000-0000-0000-000000000006', '기안자는 자동으로 로그인한 사람이 된다');
select pg_temp.ok(pg_temp.fails($$insert into public.documents (doc_type, title, department_id)
                                  values ('expense', 'x', 'd0000000-0000-0000-0000-000000000002')$$),
                  '자기가 발령되지 않은 부서로는 기안할 수 없다');
select pg_temp.ok(pg_temp.fails($$insert into public.documents (doc_type, title, department_id, status)
                                  values ('expense', 'x', 'd0000000-0000-0000-0000-000000000003', 'approved')$$),
                  '처음부터 결재 완료 상태로 만들 수 없다');
select pg_temp.ok((select count(*) from public.preview_my_line('f0000000-0000-0000-0000-000000000001',
                                                               'd0000000-0000-0000-0000-000000000003')) = 5,
                  '상신 전에 결재선을 미리 볼 수 있다');
:p5
select pg_temp.ok((select count(*) from public.documents where id = 'a0000000-0000-0000-0000-000000000001') = 0,
                  '임시저장 중인 문서는 기안자만 본다');
:p6
select public.submit_document('a0000000-0000-0000-0000-000000000001');
select pg_temp.ok((select doc_no from public.documents where id = 'a0000000-0000-0000-0000-000000000001')
                  = extract(year from public.kst_today())::int || '-0001', '상신하면 연도-일련번호 문서번호가 붙는다');
select pg_temp.ok(pg_temp.steps('a0000000-0000-0000-0000-000000000001')
                  = '팀장:pending 부장:waiting 센터장:waiting 사무국장:waiting 이사장:marked',
                  '첫 결재자(팀장) 차례가 되고 이사장 칸은 전결 표시');
select pg_temp.ok(pg_temp.fails($$update public.documents set title = '몰래 수정' where id = 'a0000000-0000-0000-0000-000000000001'$$)
                  or (select title from public.documents where id = 'a0000000-0000-0000-0000-000000000001') = '가짜 사무용품 구입',
                  '상신한 문서는 기안자도 고칠 수 없다');
select pg_temp.ok(pg_temp.fails($$update public.documents set status = 'approved' where id = 'a0000000-0000-0000-0000-000000000001'$$),
                  '문서 상태를 직접 바꿀 수 없다');
select pg_temp.ok(pg_temp.fails($$update public.document_steps set status = 'approved'$$),
                  '결재 단계를 직접 바꿀 수 없다');
:p4
select pg_temp.ok(pg_temp.fails($$select public.act_on_document('a0000000-0000-0000-0000-000000000001', 'approve')$$),
                  '차례가 아닌 사람(부장)은 결재할 수 없다');
:p7
select pg_temp.ok((select count(*) from public.documents where id = 'a0000000-0000-0000-0000-000000000001') = 0,
                  '다른 부서 직원은 센터 문서를 못 본다');
select pg_temp.ok(pg_temp.fails($$select public.act_on_document('a0000000-0000-0000-0000-000000000001', 'approve')$$),
                  '결재선에 없는 사람은 결재할 수 없다');
:p5
select public.mark_document_seen('a0000000-0000-0000-0000-000000000001');
select public.act_on_document('a0000000-0000-0000-0000-000000000001', 'approve');
:p4
select public.act_on_document('a0000000-0000-0000-0000-000000000001', 'approve', '확인했습니다');
select pg_temp.ok(pg_temp.steps('a0000000-0000-0000-0000-000000000001')
                  = '팀장:approved 부장:approved 센터장:pending 사무국장:pending 이사장:marked',
                  '센터장 결재와 사무국장 협조가 동시에 차례가 된다');
:p2
select pg_temp.ok(pg_temp.fails($$select public.act_on_document('a0000000-0000-0000-0000-000000000001', 'reject', '안 됨')$$),
                  '협조자는 반려할 수 없다');
select pg_temp.ok(pg_temp.fails($$select public.act_on_document('a0000000-0000-0000-0000-000000000001', 'confirm', null, true)$$),
                  '이견을 낼 때는 의견이 필수다');
select public.act_on_document('a0000000-0000-0000-0000-000000000001', 'confirm', '단가가 조금 높아 보여요', true);
select pg_temp.ok(pg_temp.doc_status('a0000000-0000-0000-0000-000000000001') = 'in_progress',
                  '협조에서 이견이 있어도 결재는 멈추지 않는다');
:p3
select public.act_on_document('a0000000-0000-0000-0000-000000000001', 'approve');
select pg_temp.ok(pg_temp.doc_status('a0000000-0000-0000-0000-000000000001') = 'approved',
                  '센터 전결: 센터장 결재로 끝난다 (이사장 결재 없음)');
select pg_temp.ok(pg_temp.fails($$select public.act_on_document('a0000000-0000-0000-0000-000000000001', 'approve')$$),
                  '끝난 문서에는 더 결재할 수 없다');
:p1
select pg_temp.ok((select count(*) from public.documents where id = 'a0000000-0000-0000-0000-000000000001') = 1,
                  '이사장(법인)은 센터 문서를 볼 수 있다');

-- =====================================================================
-- 2. 센터 이사장 결재 (전체), 팀장이 기안 → 팀장 단계는 건너뜀
-- =====================================================================
:p5
insert into public.documents (id, doc_type, title, department_id, line_id, body, amount, payee) values
  ('a0000000-0000-0000-0000-000000000002', 'expense', '가짜 행사 대관료', 'd0000000-0000-0000-0000-000000000003',
   'f0000000-0000-0000-0000-000000000002', '강당 대관 1일', 3000000, '가짜문화센터');
select public.submit_document('a0000000-0000-0000-0000-000000000002');
select pg_temp.ok(pg_temp.steps('a0000000-0000-0000-0000-000000000002')
                  = '팀장:skipped 부장:pending 센터장:waiting 사무국장:waiting 이사장:waiting',
                  '기안자가 결재선의 직책(팀장)이면 그 단계는 건너뛴다');
select pg_temp.ok((select doc_no from public.documents where id = 'a0000000-0000-0000-0000-000000000002')
                  like '%-0002', '문서번호는 차례로 늘어난다');
:p4
select public.act_on_document('a0000000-0000-0000-0000-000000000002', 'approve');
:p3
select public.act_on_document('a0000000-0000-0000-0000-000000000002', 'approve');
select pg_temp.ok(pg_temp.steps('a0000000-0000-0000-0000-000000000002')
                  = '팀장:skipped 부장:approved 센터장:approved 사무국장:pending 이사장:waiting',
                  '협조가 끝나기 전에는 다음 단계로 넘어가지 않는다');
:p2
select public.act_on_document('a0000000-0000-0000-0000-000000000002', 'confirm');
:p1
select public.act_on_document('a0000000-0000-0000-0000-000000000002', 'approve');
select pg_temp.ok(pg_temp.doc_status('a0000000-0000-0000-0000-000000000002') = 'approved',
                  '센터 전체 결재: 이사장 결재까지 끝난다');

-- =====================================================================
-- 3. 사무국: 직원 → 사무국장 → 이사장 (품의서)
-- =====================================================================
:p7
insert into public.documents (id, doc_type, title, department_id, line_id, body) values
  ('a0000000-0000-0000-0000-000000000003', 'proposal', '가짜 홍보물 제작 품의', 'd0000000-0000-0000-0000-000000000002',
   'f0000000-0000-0000-0000-000000000003', '');
select pg_temp.ok(pg_temp.fails($$select public.submit_document('a0000000-0000-0000-0000-000000000003')$$),
                  '내용이 비어 있으면 상신할 수 없다');
update public.documents set body = '리플릿 500부' where id = 'a0000000-0000-0000-0000-000000000003';
select public.submit_document('a0000000-0000-0000-0000-000000000003');
:p6
select pg_temp.ok((select count(*) from public.documents where id = 'a0000000-0000-0000-0000-000000000003') = 0,
                  '센터 직원은 사무국 문서를 못 본다');
:p2
select public.act_on_document('a0000000-0000-0000-0000-000000000003', 'approve');
:p1
select public.act_on_document('a0000000-0000-0000-0000-000000000003', 'approve');
select pg_temp.ok(pg_temp.doc_status('a0000000-0000-0000-0000-000000000003') = 'approved', '사무국 문서가 끝까지 간다');

-- =====================================================================
-- 4. 반려 후 재기안 (출장 신청)
-- =====================================================================
:p6
insert into public.documents (id, doc_type, title, department_id, line_id, leave_kind, period_start, period_end, place) values
  ('a0000000-0000-0000-0000-000000000004', 'leave', '가짜 출장 신청', 'd0000000-0000-0000-0000-000000000003',
   'f0000000-0000-0000-0000-000000000001', '출장', '2026-12-10', '2026-12-09', '가짜시');
select pg_temp.ok(pg_temp.fails($$select public.submit_document('a0000000-0000-0000-0000-000000000004')$$),
                  '끝나는 날이 시작하는 날보다 빠르면 상신할 수 없다');
update public.documents set period_end = '2026-12-11' where id = 'a0000000-0000-0000-0000-000000000004';
select public.submit_document('a0000000-0000-0000-0000-000000000004');
:p5
select public.act_on_document('a0000000-0000-0000-0000-000000000004', 'approve');
:p4
select pg_temp.ok(pg_temp.fails($$select public.act_on_document('a0000000-0000-0000-0000-000000000004', 'reject')$$),
                  '반려할 때는 사유가 필수다');
select public.act_on_document('a0000000-0000-0000-0000-000000000004', 'reject', '일정을 다시 잡아 주세요');
select pg_temp.ok(pg_temp.doc_status('a0000000-0000-0000-0000-000000000004') = 'rejected', '반려하면 문서가 반려 상태가 된다');
:p3
select pg_temp.ok(pg_temp.fails($$select public.act_on_document('a0000000-0000-0000-0000-000000000004', 'approve')$$),
                  '반려된 문서는 더 결재할 수 없다');
:p5
select pg_temp.ok(pg_temp.fails($$select public.redraft_document('a0000000-0000-0000-0000-000000000004')$$),
                  '기안자가 아니면 재기안할 수 없다');
:p6
select pg_temp.ok(pg_temp.fails($$update public.documents set title = 'x' where id = 'a0000000-0000-0000-0000-000000000004'$$)
                  or (select title from public.documents where id = 'a0000000-0000-0000-0000-000000000004') = '가짜 출장 신청',
                  '반려된 문서도 고칠 수 없다');
select set_config('test.new_doc', public.redraft_document('a0000000-0000-0000-0000-000000000004')::text, false);
select pg_temp.ok((select redraft_of from public.documents where id = current_setting('test.new_doc')::uuid)
                  = 'a0000000-0000-0000-0000-000000000004', '재기안하면 원래 문서와 연결된 새 문서가 생긴다');
update public.documents set period_start = '2026-12-17', period_end = '2026-12-18'
 where id = current_setting('test.new_doc')::uuid;
select public.submit_document(current_setting('test.new_doc')::uuid);
:p5
select public.act_on_document(current_setting('test.new_doc')::uuid, 'approve');
:p4
select public.act_on_document(current_setting('test.new_doc')::uuid, 'approve');
:p3
select public.act_on_document(current_setting('test.new_doc')::uuid, 'approve');
:p2
select public.act_on_document(current_setting('test.new_doc')::uuid, 'confirm');
select pg_temp.ok(pg_temp.doc_status(current_setting('test.new_doc')::uuid) = 'approved', '재기안한 문서가 끝까지 간다');
select pg_temp.ok(pg_temp.doc_status('a0000000-0000-0000-0000-000000000004') = 'rejected',
                  '원래 반려 문서는 그대로 남는다');

-- =====================================================================
-- 5. 회수
-- =====================================================================
:p6
insert into public.documents (id, doc_type, title, department_id, line_id, body) values
  ('a0000000-0000-0000-0000-000000000005', 'proposal', '가짜 회수 테스트', 'd0000000-0000-0000-0000-000000000003',
   'f0000000-0000-0000-0000-000000000001', '내용');
select public.submit_document('a0000000-0000-0000-0000-000000000005');
select public.withdraw_document('a0000000-0000-0000-0000-000000000005');
select pg_temp.ok(pg_temp.doc_status('a0000000-0000-0000-0000-000000000005') = 'draft'
                  and pg_temp.steps('a0000000-0000-0000-0000-000000000005') is null,
                  '결재자가 열어 보기 전에는 회수할 수 있다 (임시저장으로 돌아감)');
select pg_temp.ok(pg_temp.fails($$delete from public.documents where id = 'a0000000-0000-0000-0000-000000000005'$$)
                  or (select count(*) from public.documents where id = 'a0000000-0000-0000-0000-000000000005') = 1,
                  '번호가 붙은 문서는 회수해도 지울 수 없다');
update public.documents set body = '고친 내용' where id = 'a0000000-0000-0000-0000-000000000005';
select public.submit_document('a0000000-0000-0000-0000-000000000005');
:p5
select public.mark_document_seen('a0000000-0000-0000-0000-000000000005');
:p6
select pg_temp.ok(pg_temp.fails($$select public.withdraw_document('a0000000-0000-0000-0000-000000000005')$$),
                  '결재자가 열어 본 뒤에는 회수할 수 없다');

-- 임시저장 문서 지우기
insert into public.documents (id, doc_type, title, department_id) values
  ('a0000000-0000-0000-0000-000000000006', 'proposal', '지울 문서', 'd0000000-0000-0000-0000-000000000003');
delete from public.documents where id = 'a0000000-0000-0000-0000-000000000006';
select pg_temp.ok((select count(*) from public.documents where id = 'a0000000-0000-0000-0000-000000000006') = 0,
                  '올린 적 없는 임시저장 문서는 지울 수 있다');
:p5
select pg_temp.ok(pg_temp.fails($$select public.submit_document('a0000000-0000-0000-0000-000000000005')$$),
                  '남의 문서는 상신할 수 없다');

-- =====================================================================
-- 6. 로그인 안 한 사람 · 비활성 · 겸직
-- =====================================================================
reset role;
set role anon;
select pg_temp.ok(pg_temp.fails('select * from public.documents'), '로그인 안 하면 문서를 못 본다');
select pg_temp.ok(pg_temp.fails($$select public.submit_document('a0000000-0000-0000-0000-000000000005')$$),
                  '로그인 안 하면 결재 함수를 못 부른다');
reset role;

-- 부장이 팀장을 겸직하면 한 번만 결재 (팀장 단계 건너뜀)
update public.assignments set ends_on = public.kst_today() - 1
 where person_id = '00000000-0000-0000-0000-000000000005';
insert into public.assignments (person_id, department_id, position_id, starts_on) values
  ('00000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000005', '2026-01-01');
:p6
select pg_temp.ok((select string_agg(position_name || ':' || status, ' ' order by seq, step_type = 'cooperate', position_name)
                     from public.preview_my_line('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003'))
                  = '팀장:skipped 부장:waiting 센터장:waiting 사무국장:waiting 이사장:marked',
                  '한 사람이 두 직책을 겸하면 한 번만 결재한다');
reset role;

-- 결재선에 맡은 사람이 없으면 상신할 수 없다
update public.assignments set ends_on = public.kst_today() - 1
 where person_id = '00000000-0000-0000-0000-000000000004';
:p6
insert into public.documents (id, doc_type, title, department_id, line_id, body) values
  ('a0000000-0000-0000-0000-000000000007', 'proposal', '가짜 빈자리 테스트', 'd0000000-0000-0000-0000-000000000003',
   'f0000000-0000-0000-0000-000000000001', '내용');
select pg_temp.ok(pg_temp.fails($$select public.submit_document('a0000000-0000-0000-0000-000000000007')$$),
                  '결재선에 맡은 사람이 없는 직책이 있으면 상신할 수 없다');
reset role;

-- =====================================================================
-- 7. 내부용 함수는 직원이 직접 부를 수 없다 (보안 검토에서 나온 항목)
-- =====================================================================
select pg_temp.ok(not has_function_privilege('authenticated', 'public.advance_document(uuid)', 'execute'),
                  '직원은 다음 차례로 넘기는 내부 함수를 직접 부를 수 없다');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.preview_line(uuid,uuid,uuid)', 'execute'),
                  '직원은 남을 기안자로 넣어 결재선을 미리 볼 수 없다');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.resolve_holder(uuid,uuid)', 'execute'),
                  '직원은 직책 담당자 찾기 내부 함수를 직접 부를 수 없다');
select pg_temp.ok(not has_function_privilege('anon', 'public.preview_my_line(uuid,uuid)', 'execute'),
                  '로그인 안 하면 결재선 미리보기를 못 부른다');
-- 반려된 문서는 내부 함수로도 결재 완료가 되지 않는다
select public.advance_document('a0000000-0000-0000-0000-000000000004');
select pg_temp.ok(pg_temp.doc_status('a0000000-0000-0000-0000-000000000004') = 'rejected',
                  '반려된 문서는 어떤 경우에도 결재 완료로 바뀌지 않는다');
:p6
select pg_temp.ok(pg_temp.fails($$select public.redraft_document('a0000000-0000-0000-0000-000000000004')$$),
                  '같은 반려 문서를 두 번 재기안할 수 없다');
reset role;

-- 결재할 사람이 하나도 없는 결재선은 올릴 수 없다 (이사장이 사무국 결재선으로 기안)
insert into public.assignments (person_id, department_id, position_id, starts_on) values
  ('00000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', '2026-01-01');
:p1
insert into public.documents (id, doc_type, title, department_id, line_id, body) values
  ('a0000000-0000-0000-0000-000000000008', 'proposal', '가짜 자기결재 테스트', 'd0000000-0000-0000-0000-000000000002',
   'f0000000-0000-0000-0000-000000000003', '내용');
select pg_temp.ok(pg_temp.fails($$select public.submit_document('a0000000-0000-0000-0000-000000000008')$$),
                  '나 말고 결재할 사람이 없는 결재선으로는 올릴 수 없다 (혼자 결재 완료 방지)');
reset role;

\echo '모든 테스트 통과'
