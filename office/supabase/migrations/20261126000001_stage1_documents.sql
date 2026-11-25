-- =====================================================================
-- 1단계-1: 전자결재 흐름 (지출결의서 · 품의서/기안문 · 출장/휴가 신청)
--
-- 원칙
--  * 결재선은 상신할 때 '그날의 담당자'로 풀어서 문서에 복사한다 (이후 결재선 설정이 바뀌어도 이 문서는 그대로).
--  * 문서 상태와 결재 단계는 아래 함수로만 바뀐다. 직원은 임시저장 중인 자기 문서의 내용 칸만 고칠 수 있다.
--  * 결재가 끝나거나 반려된 문서는 아무도 고칠 수 없다. 반려되면 '재기안'으로 새 문서를 만든다.
--  * 문서번호는 처음 상신할 때 붙는다: 연도-일련번호 (법인 전체가 한 줄로 셈). 회수해도 번호는 그대로.
--  * 협조는 의견만 남긴다. 이견이 있어도 결재는 멈추지 않는다.
--  * 전결 여부는 기안자가 결재선을 고르며 정한다 (시스템이 막지 않음).
-- =====================================================================

-- Supabase 는 새 함수의 실행 권한을 로그인한 사람(authenticated)에게 자동으로 준다.
-- 내부용 함수가 실수로 열리지 않도록, 이제부터 만드는 함수는 아래에서 하나씩 명시적으로 연다.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- 한국 날짜 (데이터베이스 시계는 세계 표준시라서)
create function public.kst_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;

-- ---------------------------------------------------------------------
-- 문서
-- ---------------------------------------------------------------------
create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  doc_no           text unique,                         -- 처음 상신할 때 붙음
  doc_type         text not null check (doc_type in ('expense', 'proposal', 'leave')),
  status           text not null default 'draft'
                   check (status in ('draft', 'in_progress', 'approved', 'rejected')),
  title            text not null default '',
  department_id    uuid not null references public.departments(id),
  drafter_id       uuid not null default public.current_person_id() references public.people(id),
  line_id          uuid references public.approval_lines(id) on delete set null,  -- 고른 결재선 (임시저장 중)
  body             text not null default '',            -- 내용 · 사용 내역 · 사유
  -- 지출결의서
  amount           bigint check (amount is null or amount >= 0),
  payee            text,                                -- 사용처
  pay_date         date,                                -- 지출 예정일
  -- 출장 · 휴가
  leave_kind       text check (leave_kind in ('출장', '연차', '반차', '병가', '경조사', '기타')),
  period_start     date,
  period_end       date,
  place            text,                                -- 출장지
  -- 상신할 때 남기는 당시 정보 (나중에 이름·발령이 바뀌어도 문서에는 그대로)
  drafter_name     text,
  drafter_position text,
  department_name  text,
  line_name        text,
  is_jeongyeol     boolean not null default false,
  redraft_of       uuid references public.documents(id),  -- 반려된 문서를 다시 올린 것
  created_at       timestamptz not null default now(),
  submitted_at     timestamptz,
  completed_at     timestamptz                          -- 결재 완료 또는 반려 시각
);
create index documents_drafter on public.documents (drafter_id);
create index documents_department on public.documents (department_id);

-- 결재 단계 (상신할 때 결재선에서 복사)
--  status
--    waiting   앞 단계를 기다림
--    pending   지금 차례
--    approved  결재함 (협조는 '확인함')
--    rejected  반려함
--    skipped   건너뜀 (기안자 본인, 기안자보다 아래 직책, 같은 사람이 뒤에서 결재)
--    marked    결재하지 않고 '전결' 표시만
create table public.document_steps (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents(id) on delete cascade,
  seq           int not null check (seq > 0),
  step_type     text not null check (step_type in ('approve', 'cooperate', 'jeongyeol_mark')),
  position_id   uuid not null references public.positions(id),
  position_name text not null,
  assignee_id   uuid references public.people(id),
  assignee_name text,
  status        text not null
                check (status in ('waiting', 'pending', 'approved', 'rejected', 'skipped', 'marked')),
  skip_reason   text,
  opinion       text,                    -- 결재 의견 · 반려 사유 · 협조 의견
  disagree      boolean not null default false,   -- 협조에서 이견
  seen_at       timestamptz,             -- 차례가 된 뒤 처음 열어 본 시각 (이후엔 회수 불가)
  acted_at      timestamptz,
  unique (document_id, seq, position_id)
);
create index document_steps_assignee on public.document_steps (assignee_id, status);

-- 문서번호 세는 곳 (연도별)
create table public.doc_counters (
  year    int primary key,
  last_no int not null
);

create trigger audit after insert or update or delete on public.documents
  for each row execute function public.write_audit_log();
create trigger audit after insert or update or delete on public.document_steps
  for each row execute function public.write_audit_log();

-- =====================================================================
-- 도우미 함수
-- =====================================================================

-- 오늘 유효한 발령인가
create function public.assignment_current(a public.assignments) returns boolean
language sql stable set search_path = '' as $$
  select a.starts_on <= public.kst_today() and (a.ends_on is null or a.ends_on >= public.kst_today())
$$;

-- 이 부서(또는 그 위 부서)에 내가 오늘 발령돼 있는가 = 이 부서의 업무를 볼 수 있는가
create function public.in_my_subtree(p_department uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with recursive up as (
    select id, parent_id from public.departments where id = p_department
    union all
    select d.id, d.parent_id from public.departments d join up on d.id = up.parent_id
  )
  select public.is_member() and exists (
    select 1 from public.assignments a join up on up.id = a.department_id
     where a.person_id = public.current_person_id() and public.assignment_current(a)
  )
$$;

-- 이 문서를 볼 수 있는가
--  임시저장: 기안자만 / 상신 후: 기안자, 결재선에 든 사람, 그 부서(와 위 부서) 사람, 관리자
create function public.can_view_document(p_doc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
     where d.id = p_doc
       and public.is_member()
       and (d.drafter_id = public.current_person_id()
            or (d.status <> 'draft'
                and (public.is_admin()
                     or exists (select 1 from public.document_steps s
                                 where s.document_id = d.id and s.assignee_id = public.current_person_id())
                     or public.in_my_subtree(d.department_id))))
  )
$$;

-- 이 부서의 결재선을 가진 부서: 자기 결재선이 없으면 위 부서의 결재선을 쓴다
create function public.line_department(p_department uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  with recursive up as (
    select id, parent_id, 0 as depth from public.departments where id = p_department
    union all
    select d.id, d.parent_id, up.depth + 1 from public.departments d join up on d.id = up.parent_id
  )
  select up.id from up
   where public.is_member()
     and exists (select 1 from public.approval_lines l where l.department_id = up.id and l.is_active)
   order by up.depth limit 1
$$;

-- 이 직책을 맡은 사람 찾기: 문서 부서에서 위로 올라가며 찾고, 없으면 조직 전체에서 찾는다.
--  (예: 센터 문서의 '팀장'은 센터의 팀장, '사무국장'은 사무국의 사무국장)
create function public.resolve_holder(p_position uuid, p_department uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_dept uuid := p_department;
  v_ids  uuid[];
  v_name text;
begin
  select name into v_name from public.positions where id = p_position;
  while v_dept is not null loop
    select array_agg(distinct a.person_id) into v_ids
      from public.assignments a join public.people p on p.id = a.person_id
     where a.department_id = v_dept and a.position_id = p_position
       and p.is_active and public.assignment_current(a);
    if cardinality(v_ids) = 1 then return v_ids[1]; end if;
    if cardinality(v_ids) > 1 then
      raise exception '같은 부서에 ''%'' 직책을 맡은 사람이 여러 명이라 결재자를 정할 수 없어요. 관리자에게 알려 주세요', v_name;
    end if;
    select parent_id into v_dept from public.departments where id = v_dept;
  end loop;

  select array_agg(distinct a.person_id) into v_ids
    from public.assignments a join public.people p on p.id = a.person_id
   where a.position_id = p_position and p.is_active and public.assignment_current(a);
  if cardinality(v_ids) = 1 then return v_ids[1]; end if;
  if cardinality(v_ids) > 1 then
    raise exception '''%'' 직책을 맡은 사람이 여러 부서에 있어 결재자를 정할 수 없어요. 관리자에게 알려 주세요', v_name;
  end if;
  return null;
end $$;

-- 결재선 미리보기: 이 결재선으로 올리면 누가 어떤 순서로 결재하는지
--  status: waiting(결재함) / skipped(건너뜀) / marked('전결' 표시) / problem(맡은 사람 없음)
create function public.preview_line(p_line uuid, p_department uuid, p_drafter uuid default null)
returns table (seq int, step_type text, position_id uuid, position_name text,
               assignee_id uuid, assignee_name text, status text, note text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_drafter uuid := coalesce(p_drafter, public.current_person_id());
  v_rank    int;
begin
  -- 기안자가 이 부서에서 맡은 가장 높은 직책 순위
  select max(pos.rank) into v_rank
    from public.assignments a join public.positions pos on pos.id = a.position_id
   where a.person_id = v_drafter and a.department_id = p_department and public.assignment_current(a);

  return query
  with base as (
    select s.seq, s.step_type, s.position_id, pos.name as pname, pos.rank,
           case when s.step_type = 'jeongyeol_mark' then null
                else public.resolve_holder(s.position_id, p_department) end as who
      from public.approval_line_steps s join public.positions pos on pos.id = s.position_id
     where s.line_id = p_line
  ), r1 as (
    select b.*,
           case when b.step_type = 'jeongyeol_mark' then 'marked'
                when b.who is null then 'problem'
                when b.who = v_drafter then 'skip_self'
                when b.step_type = 'approve' and b.rank < coalesce(v_rank, 0) then 'skip_lower'
                else 'active' end as st
      from base b
  ), r2 as (
    select r1.*,
           case when r1.st = 'active' and exists (
                  select 1 from r1 o
                   where o.st = 'active' and o.who = r1.who
                     and (o.seq > r1.seq
                          or (o.seq = r1.seq and r1.step_type = 'cooperate' and o.step_type = 'approve')))
                then 'skip_dup' else r1.st end as st2
      from r1
  )
  select r2.seq, r2.step_type, r2.position_id, r2.pname, r2.who, p.name,
         case r2.st2 when 'active' then 'waiting' when 'marked' then 'marked'
                     when 'problem' then 'problem' else 'skipped' end,
         case r2.st2 when 'skip_self' then '기안자 본인'
                     when 'skip_lower' then '기안자보다 아래 직책'
                     when 'skip_dup' then '같은 사람이 뒤에서 결재'
                     when 'problem' then '이 직책을 맡은 사람이 없어요'
                     else null end
    from r2 left join public.people p on p.id = r2.who
   order by r2.seq, (r2.step_type = 'cooperate'), r2.pname;
end $$;

-- 다음 차례로 넘기기 (지금 차례가 모두 끝났으면 다음 순서를, 남은 단계가 없으면 결재 완료)
create function public.advance_document(p_doc uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_next int;
begin
  if not exists (select 1 from public.documents where id = p_doc and status = 'in_progress') then
    return;
  end if;
  if exists (select 1 from public.document_steps where document_id = p_doc and status = 'pending') then
    return;
  end if;
  select min(seq) into v_next from public.document_steps where document_id = p_doc and status = 'waiting';
  if v_next is null then
    update public.documents set status = 'approved', completed_at = now() where id = p_doc;
  else
    update public.document_steps set status = 'pending'
     where document_id = p_doc and seq = v_next and status = 'waiting';
  end if;
end $$;

-- =====================================================================
-- 직원이 부르는 함수
-- =====================================================================

-- 상신
create function public.submit_document(p_doc uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me     uuid := public.current_person_id();
  d      public.documents;
  v_line public.approval_lines;
  v_year int := extract(year from public.kst_today())::int;
  v_no   int;
  v_pos  text;
begin
  select * into d from public.documents where id = p_doc for update;
  if d.id is null or d.drafter_id is distinct from me then raise exception '내 문서가 아니에요'; end if;
  if d.status <> 'draft' then raise exception '이미 올린 문서예요'; end if;

  -- 칸 확인
  if length(trim(d.title)) = 0 then raise exception '제목을 적어 주세요'; end if;
  if d.doc_type = 'expense' then
    if coalesce(d.amount, 0) <= 0 then raise exception '금액을 적어 주세요'; end if;
    if length(trim(coalesce(d.payee, ''))) = 0 then raise exception '사용처를 적어 주세요'; end if;
    if length(trim(d.body)) = 0 then raise exception '사용 내역을 적어 주세요'; end if;
  elsif d.doc_type = 'proposal' then
    if length(trim(d.body)) = 0 then raise exception '내용을 적어 주세요'; end if;
  elsif d.doc_type = 'leave' then
    if d.leave_kind is null then raise exception '종류(출장·연차 등)를 골라 주세요'; end if;
    if d.period_start is null or d.period_end is null then raise exception '기간을 적어 주세요'; end if;
    if d.period_end < d.period_start then raise exception '끝나는 날이 시작하는 날보다 빨라요'; end if;
  end if;

  -- 기안자가 오늘 그 부서에 발령돼 있어야 한다
  select pos.name into v_pos
    from public.assignments a join public.positions pos on pos.id = a.position_id
   where a.person_id = me and a.department_id = d.department_id and public.assignment_current(a)
   order by pos.rank desc limit 1;
  if v_pos is null then raise exception '이 부서에 발령된 사람만 기안할 수 있어요'; end if;

  -- 결재선 확인
  select * into v_line from public.approval_lines where id = d.line_id and is_active;
  if v_line.id is null or v_line.department_id is distinct from public.line_department(d.department_id) then
    raise exception '결재선을 골라 주세요';
  end if;
  if exists (select 1 from public.preview_line(v_line.id, d.department_id, me) where status = 'problem') then
    raise exception '결재선에 맡은 사람이 없는 직책이 있어요. 관리자에게 인사발령을 요청해 주세요';
  end if;
  if not exists (select 1 from public.preview_line(v_line.id, d.department_id, me)
                  where status = 'waiting' and step_type = 'approve') then
    raise exception '이 결재선에는 나 말고 결재할 사람이 없어요. 다른 결재선을 골라 주세요';
  end if;

  -- 결재 단계 복사
  delete from public.document_steps where document_id = d.id;
  insert into public.document_steps
    (document_id, seq, step_type, position_id, position_name, assignee_id, assignee_name, status, skip_reason)
  select d.id, pv.seq, pv.step_type, pv.position_id, pv.position_name, pv.assignee_id, pv.assignee_name,
         pv.status, pv.note
    from public.preview_line(v_line.id, d.department_id, me) pv;

  -- 문서번호 (처음 상신할 때만)
  if d.doc_no is null then
    insert into public.doc_counters (year, last_no) values (v_year, 1)
    on conflict (year) do update set last_no = public.doc_counters.last_no + 1
    returning last_no into v_no;
    d.doc_no := v_year || '-' || lpad(v_no::text, 4, '0');
  end if;

  update public.documents
     set doc_no = d.doc_no, status = 'in_progress', submitted_at = now(), completed_at = null,
         drafter_name = (select name from public.people where id = me),
         drafter_position = v_pos,
         department_name = (select name from public.departments where id = d.department_id),
         line_name = v_line.name, is_jeongyeol = v_line.is_jeongyeol
   where id = d.id;

  perform public.advance_document(d.id);
end $$;

-- 결재 · 반려 · 협조
--  p_action: approve(결재) / reject(반려, 사유 필수) / confirm(협조 확인, 이견이면 의견 필수)
create function public.act_on_document(p_doc uuid, p_action text, p_opinion text default null,
                                       p_disagree boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.current_person_id();
  d  public.documents;
  s  public.document_steps;
  v_opinion text := nullif(trim(coalesce(p_opinion, '')), '');
begin
  select * into d from public.documents where id = p_doc for update;
  if d.id is null or d.status <> 'in_progress' then raise exception '결재 중인 문서가 아니에요'; end if;
  select * into s from public.document_steps
   where document_id = p_doc and assignee_id = me and status = 'pending' limit 1;
  if s.id is null then raise exception '지금 내가 결재할 차례가 아니에요'; end if;

  if s.step_type = 'cooperate' then
    if p_action <> 'confirm' then raise exception '협조 단계에서는 의견을 남기고 확인만 할 수 있어요'; end if;
    if p_disagree and v_opinion is null then raise exception '이견이 있으면 의견을 적어 주세요'; end if;
    update public.document_steps
       set status = 'approved', opinion = v_opinion, disagree = coalesce(p_disagree, false), acted_at = now()
     where id = s.id;
  elsif p_action = 'approve' then
    update public.document_steps set status = 'approved', opinion = v_opinion, acted_at = now() where id = s.id;
  elsif p_action = 'reject' then
    if v_opinion is null then raise exception '반려 사유를 적어 주세요'; end if;
    update public.document_steps set status = 'rejected', opinion = v_opinion, acted_at = now() where id = s.id;
    update public.document_steps set status = 'waiting' where document_id = p_doc and status = 'pending';
    update public.documents set status = 'rejected', completed_at = now() where id = p_doc;
    return;
  else
    raise exception '알 수 없는 요청이에요';
  end if;

  perform public.advance_document(p_doc);
end $$;

-- 차례가 된 결재자가 문서를 처음 열었음을 남긴다 (이후 기안자는 회수할 수 없음)
create function public.mark_document_seen(p_doc uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.document_steps
                  where document_id = p_doc and assignee_id = public.current_person_id()
                    and status = 'pending' and seen_at is null) then
    return;
  end if;
  -- 회수와 동시에 일어나도 순서대로 처리되게 문서를 먼저 잠근다
  perform 1 from public.documents where id = p_doc for update;
  update public.document_steps set seen_at = now()
   where document_id = p_doc and assignee_id = public.current_person_id()
     and status = 'pending' and seen_at is null;
end $$;

-- 회수: 지금 차례인 결재자가 아직 열어 보지 않았을 때만. 임시저장으로 돌아가고 문서번호는 그대로.
create function public.withdraw_document(p_doc uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.documents;
begin
  select * into d from public.documents where id = p_doc for update;
  if d.id is null or d.drafter_id is distinct from public.current_person_id() then
    raise exception '내 문서가 아니에요';
  end if;
  if d.status <> 'in_progress' then raise exception '결재 중인 문서만 회수할 수 있어요'; end if;
  if exists (select 1 from public.document_steps
              where document_id = p_doc and status = 'pending' and seen_at is not null) then
    raise exception '결재자가 이미 문서를 열어 봐서 회수할 수 없어요';
  end if;
  delete from public.document_steps where document_id = p_doc;
  update public.documents set status = 'draft', submitted_at = null where id = p_doc;
end $$;

-- 재기안: 반려된 문서를 복사해 새 임시저장 문서를 만든다 (원래 문서는 그대로 남음)
create function public.redraft_document(p_doc uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  d     public.documents;
  v_new uuid;
begin
  select * into d from public.documents where id = p_doc;
  if d.id is null or d.drafter_id is distinct from public.current_person_id() then
    raise exception '내 문서가 아니에요';
  end if;
  if d.status <> 'rejected' then raise exception '반려된 문서만 다시 올릴 수 있어요'; end if;
  if exists (select 1 from public.documents where redraft_of = d.id) then
    raise exception '이미 다시 올린 문서가 있어요';
  end if;
  insert into public.documents
    (doc_type, title, department_id, drafter_id, line_id, body, amount, payee, pay_date,
     leave_kind, period_start, period_end, place, redraft_of)
  values
    (d.doc_type, d.title, d.department_id, d.drafter_id, d.line_id, d.body, d.amount, d.payee, d.pay_date,
     d.leave_kind, d.period_start, d.period_end, d.place, d.id)
  returning id into v_new;
  return v_new;
end $$;

-- =====================================================================
-- 권한
-- =====================================================================
alter table public.documents      enable row level security;
alter table public.document_steps enable row level security;
alter table public.doc_counters   enable row level security;   -- 정책 없음 = 함수로만

revoke all on public.documents, public.document_steps, public.doc_counters from anon;
revoke all on public.doc_counters from authenticated;
revoke truncate, references, trigger on public.documents, public.document_steps from authenticated;
-- 결재 단계는 함수로만 바뀐다
revoke insert, update, delete on public.document_steps from authenticated;
-- 문서는 내용 칸만 직접 쓸 수 있다 (상태 · 번호 · 당시 정보 · 재기안 연결은 함수만)
revoke insert, update on public.documents from authenticated;
grant insert (id, doc_type, title, department_id, line_id, body, amount, payee, pay_date,
              leave_kind, period_start, period_end, place) on public.documents to authenticated;
grant update (title, department_id, line_id, body, amount, payee, pay_date,
              leave_kind, period_start, period_end, place) on public.documents to authenticated;

create policy "볼 수 있는 문서" on public.documents for select to authenticated
  using (public.can_view_document(id));
-- 자기가 발령된 부서로만 새 문서를 만든다
create policy "내 부서로 기안" on public.documents for insert to authenticated
  with check (drafter_id = public.current_person_id() and status = 'draft'
              and exists (select 1 from public.assignments a
                           where a.person_id = public.current_person_id()
                             and a.department_id = documents.department_id
                             and public.assignment_current(a)));
create policy "임시저장 중인 내 문서만 고치기" on public.documents for update to authenticated
  using (drafter_id = public.current_person_id() and status = 'draft')
  with check (drafter_id = public.current_person_id() and status = 'draft'
              and exists (select 1 from public.assignments a
                           where a.person_id = public.current_person_id()
                             and a.department_id = documents.department_id
                             and public.assignment_current(a)));
-- 번호가 붙은 적 없는 임시저장 문서만 지울 수 있다
create policy "올린 적 없는 내 문서만 지우기" on public.documents for delete to authenticated
  using (drafter_id = public.current_person_id() and status = 'draft' and doc_no is null);

create policy "볼 수 있는 문서의 결재 단계" on public.document_steps for select to authenticated
  using (public.can_view_document(document_id));

-- 함수 실행 권한
revoke execute on function public.kst_today(), public.assignment_current(public.assignments),
  public.in_my_subtree(uuid), public.can_view_document(uuid), public.line_department(uuid),
  public.resolve_holder(uuid, uuid), public.preview_line(uuid, uuid, uuid), public.advance_document(uuid),
  public.submit_document(uuid), public.act_on_document(uuid, text, text, boolean),
  public.mark_document_seen(uuid), public.withdraw_document(uuid), public.redraft_document(uuid)
  from public, anon, authenticated;
grant execute on function public.kst_today(), public.assignment_current(public.assignments),
  public.in_my_subtree(uuid), public.can_view_document(uuid), public.line_department(uuid),
  public.submit_document(uuid), public.act_on_document(uuid, text, text, boolean),
  public.mark_document_seen(uuid), public.withdraw_document(uuid), public.redraft_document(uuid)
  to authenticated;
-- 미리보기는 기안자 본인 기준으로만 (다른 사람을 기안자로 넣어 볼 수 없게 감싼 함수를 연다)
create function public.preview_my_line(p_line uuid, p_department uuid)
returns table (seq int, step_type text, position_id uuid, position_name text,
               assignee_id uuid, assignee_name text, status text, note text)
language sql stable security definer set search_path = '' as $$
  select * from public.preview_line(p_line, p_department, public.current_person_id())
   where public.is_member()
$$;
revoke execute on function public.preview_my_line(uuid, uuid) from public, anon, authenticated;
grant execute on function public.preview_my_line(uuid, uuid) to authenticated;
