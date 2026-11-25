-- 본인 결재를 더 안전하게 (보안 검토 반영)
--  본인 결재는 다음 두 경우에만 된다.
--   1) 기안자가 그 결재선의 결재 단계를 직접 맡고 있을 때 (예: 센터장이 '센터 · 전결'로 올림)
--   2) 관리자가 그 결재선에 '본인 결재 허용'을 켰을 때 (예: 보조금 사업 기록용 결재선)
--  단계가 하나도 없거나 만드는 중인 결재선, 협조만 있는 결재선으로는 혼자 끝낼 수 없다.
--  본인 결재 문서에는 항상 기안자 이름으로 결재 칸이 하나 찍힌다.
--  (참고: 결재선의 doc_type 은 아직 쓰지 않는다. 모든 문서 종류가 부서의 결재선을 함께 쓴다.)

alter table public.approval_lines add column allow_self_approval boolean not null default false;

create or replace function public.submit_document(p_doc uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me     uuid := public.current_person_id();
  d      public.documents;
  v_line public.approval_lines;
  v_year int := extract(year from public.kst_today())::int;
  v_no   int;
  v_pos  text;
  v_pos_id uuid;
  v_self boolean;
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
  select pos.name, pos.id into v_pos, v_pos_id
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
  -- 결재 단계 복사
  delete from public.document_steps where document_id = d.id;
  insert into public.document_steps
    (document_id, seq, step_type, position_id, position_name, assignee_id, assignee_name, status, skip_reason)
  select d.id, pv.seq, pv.step_type, pv.position_id, pv.position_name, pv.assignee_id, pv.assignee_name,
         pv.status, pv.note
    from public.preview_line(v_line.id, d.department_id, me) pv;

  -- 나 말고 결재할 사람이 없을 때 (저장된 단계로 판단)
  --  * 내가 이 결재선의 결재 단계를 맡고 있으면(맨 위 결재자) 본인 결재
  --  * 관리자가 '본인 결재 허용'을 켠 결재선이면 본인 결재 (보조금 기록용 등)
  --  * 그 밖에는 막는다 (단계가 없거나 만드는 중인 결재선으로 혼자 끝내는 것 방지)
  v_self := not exists (select 1 from public.document_steps
                         where document_id = d.id and step_type = 'approve' and status = 'waiting');
  if v_self then
    if exists (select 1 from public.document_steps
                where document_id = d.id and assignee_id = me and step_type = 'approve'
                  and status = 'skipped' and skip_reason = '기안자 본인') then
      update public.document_steps
         set status = 'approved', acted_at = now(), skip_reason = '본인 결재'
       where document_id = d.id and assignee_id = me and step_type = 'approve'
         and status = 'skipped' and skip_reason = '기안자 본인';
    elsif v_line.allow_self_approval then
      insert into public.document_steps
        (document_id, seq, step_type, position_id, position_name, assignee_id, assignee_name, status, skip_reason, acted_at)
      values (d.id, coalesce((select max(seq) from public.document_steps where document_id = d.id), 0) + 1,
              'approve', v_pos_id, v_pos, me, (select name from public.people where id = me),
              'approved', '본인 결재', now());
    else
      raise exception '이 결재선에는 나 말고 결재할 사람이 없어요. 관리자에게 결재선을 확인해 달라고 해 주세요';
    end if;
  end if;

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
         line_name = v_line.name, is_jeongyeol = v_line.is_jeongyeol, self_approved = v_self
   where id = d.id;

  perform public.advance_document(d.id);
end $$;

