-- =====================================================================
-- 0단계: 조직 · 사람 · 권한 · 기본 결재선
--
-- 원칙
--  * 조직마다 다른 값(부서, 직책, 결재선)은 코드가 아니라 이 표들에 담는다.
--  * 권한은 데이터베이스에서 막는다(행 수준 보안, RLS).
--  * 지우지 않고 남긴다: 부서는 '폐지', 사람은 '비활성', 발령은 이력으로 보관.
--  * 모든 변경은 audit_log 에 누가·언제·무엇을 바꿨는지 남는다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 조직 정보 (한 줄만 존재)
-- ---------------------------------------------------------------------
create table public.org_settings (
  id                  smallint primary key default 1 check (id = 1),
  name                text not null default '',
  logo_path           text,                 -- 저장소(org-assets) 안의 파일 경로
  seal_path           text,                 -- 직인 이미지
  is_nonprofit        boolean not null default true,
  -- 전결 규정에 어긋난 결재선으로 상신할 때: warn(경고만) / block(상신 막기)
  jeongyeol_violation text not null default 'warn'
                      check (jeongyeol_violation in ('warn', 'block')),
  setup_completed_at  timestamptz,          -- 초기 설정 마법사를 마친 시각
  updated_at          timestamptz not null default now()
);
insert into public.org_settings default values;

-- ---------------------------------------------------------------------
-- 부서 (나무 구조, 단계 제한 없음)
-- ---------------------------------------------------------------------
create table public.departments (
  id             uuid primary key default gen_random_uuid(),
  parent_id      uuid references public.departments(id),
  name           text not null check (length(trim(name)) > 0),
  -- 독립 운영: 자기 결재선·장부·예산·문서번호를 가진다 (예: 산하센터)
  is_independent boolean not null default false,
  abolished_at   timestamptz,               -- 폐지 시각 (삭제하지 않음)
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  check (parent_id is distinct from id)
);
-- 최상위(법인)는 하나만
create unique index departments_single_root on public.departments ((true)) where parent_id is null;

-- 부서를 옮길 때 자기 아래 부서 밑으로 들어가 고리가 생기지 않게 막는다
create function public.departments_no_cycle() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_id is null then return new; end if;
  if exists (
    with recursive up as (
      select id, parent_id from public.departments where id = new.parent_id
      union all
      select d.id, d.parent_id from public.departments d join up on d.id = up.parent_id
    ) select 1 from up where id = new.id
  ) then
    raise exception '부서를 자기 아래 부서 밑으로 옮길 수 없습니다';
  end if;
  return new;
end $$;
create trigger departments_no_cycle before insert or update of parent_id on public.departments
  for each row execute function public.departments_no_cycle();

-- ---------------------------------------------------------------------
-- 직책과 결재 순위 (rank 가 클수록 윗 직책)
-- ---------------------------------------------------------------------
create table public.positions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) > 0),
  rank       int not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 사람 (직원 · 이사장)
--  초대할 때 먼저 이메일로 한 줄을 만들고, 그 사람이 처음 들어오면
--  로그인 계정(auth.users)과 연결된다.
-- ---------------------------------------------------------------------
create table public.people (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid unique references auth.users(id) on delete set null,
  email          text not null unique check (email = lower(trim(email)) and email like '%_@_%'),
  name           text not null check (length(trim(name)) > 0),
  phone          text,
  is_admin       boolean not null default false,  -- 관리자 (사무국장이 겸함)
  is_active      boolean not null default true,   -- false = 퇴사 등 비활성
  invited_at     timestamptz not null default now(),
  joined_at      timestamptz,
  deactivated_at timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 인사발령: 누가, 언제부터, 어느 부서의 어느 직책 (겸직 = 여러 줄)
--  starts_on 이 되면 자동 적용, ends_on 다음 날부터 끝. 이력은 지우지 않는다.
-- ---------------------------------------------------------------------
create table public.assignments (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.people(id),
  department_id uuid not null references public.departments(id),
  position_id   uuid not null references public.positions(id),
  starts_on     date not null,
  ends_on       date,                       -- 마지막 근무일 (비어 있으면 계속)
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.people(id),
  check (ends_on is null or ends_on >= starts_on)
);
create index assignments_person on public.assignments (person_id);
create index assignments_dept_pos on public.assignments (department_id, position_id);

-- ---------------------------------------------------------------------
-- 기본 결재선 (부서 · 문서 종류별, 사람이 아니라 직책으로 정한다)
-- ---------------------------------------------------------------------
create table public.approval_lines (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id),
  doc_type      text not null default 'expense',   -- expense = 지출결의서
  name          text not null check (length(trim(name)) > 0),
  is_default    boolean not null default false,    -- 기안할 때 먼저 채워지는 결재선
  is_jeongyeol  boolean not null default false,    -- 전결 결재선인지
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);
-- 부서·문서 종류마다 기본값은 하나
create unique index approval_lines_one_default
  on public.approval_lines (department_id, doc_type) where is_default and is_active;

-- 결재 단계. 기안자는 단계에 넣지 않는다(항상 첫 칸).
--  seq 가 같은 단계는 동시에 진행한다 (예: 센터장 결재 + 사무국장 협조).
--  step_type
--    approve        결재
--    cooperate      협조 (확인하고 의견을 남김)
--    jeongyeol_mark 결재하지 않고 결재란에 '전결' 표시만 (예: 전결 시 이사장 칸)
create table public.approval_line_steps (
  id          uuid primary key default gen_random_uuid(),
  line_id     uuid not null references public.approval_lines(id) on delete cascade,
  seq         int not null check (seq > 0),
  position_id uuid not null references public.positions(id),
  step_type   text not null default 'approve'
              check (step_type in ('approve', 'cooperate', 'jeongyeol_mark')),
  unique (line_id, seq, position_id)
);

-- ---------------------------------------------------------------------
-- 변경 기록 (누가 언제 무엇을 바꿨는지)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,        -- people.id (시스템 작업이면 비어 있음)
  actor_name   text,        -- 당시 이름 (나중에 이름이 바뀌어도 남도록)
  table_name   text not null,
  row_id       text,
  action       text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data     jsonb,
  new_data     jsonb
);
create index audit_log_at on public.audit_log (at desc);

-- =====================================================================
-- 권한 도우미 함수
-- =====================================================================

-- 로그인이 아직 살아 있는가
--  강제 로그아웃하면 로그인 기록(auth.sessions)이 지워지는데, 이미 발급된 출입증(토큰)은
--  최대 1시간 유효하다. 그래서 출입증의 로그인 기록이 남아 있는지도 매번 확인한다.
create function public.session_alive() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.sessions s
                 where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
                   and s.user_id = auth.uid())
$$;

-- 지금 로그인한 사람 (비활성이거나 로그아웃당했으면 없음)
create function public.current_person_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.people
   where auth_user_id = auth.uid() and is_active and public.session_alive()
$$;

-- 활성 직원인가
create function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_person_id() is not null
$$;

-- 관리자인가
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people
                 where id = public.current_person_id() and is_admin)
$$;

-- 변경 기록을 남기는 트리거
create function public.write_audit_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public.current_person_id();
  v_name  text;
begin
  if v_actor is not null then
    select name into v_name from public.people where id = v_actor;
  end if;
  insert into public.audit_log (actor_id, actor_name, table_name, row_id, action, old_data, new_data)
  values (
    v_actor, v_name, tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', ''),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit after insert or update or delete on public.org_settings
  for each row execute function public.write_audit_log();
create trigger audit after insert or update or delete on public.departments
  for each row execute function public.write_audit_log();
create trigger audit after insert or update or delete on public.positions
  for each row execute function public.write_audit_log();
create trigger audit after insert or update or delete on public.people
  for each row execute function public.write_audit_log();
create trigger audit after insert or update or delete on public.assignments
  for each row execute function public.write_audit_log();
create trigger audit after insert or update or delete on public.approval_lines
  for each row execute function public.write_audit_log();
create trigger audit after insert or update or delete on public.approval_line_steps
  for each row execute function public.write_audit_log();

-- 관리자가 한 명도 남지 않게 되는 변경을 막는다 (잠김 방지)
create function public.keep_one_admin() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- 두 관리자가 동시에 서로를 해제하는 경우를 막기 위해 차례로 처리한다
  perform pg_advisory_xact_lock(hashtext('people_admin'));
  if old.is_admin and old.is_active and not (new.is_admin and new.is_active) then
    if not exists (select 1 from public.people
                   where id <> old.id and is_admin and is_active) then
      raise exception '관리자가 최소 한 명은 있어야 합니다';
    end if;
  end if;
  return new;
end $$;
create trigger keep_one_admin before update on public.people
  for each row execute function public.keep_one_admin();

-- 사람 정보에서 로그인 연결·초대·가입·비활성 시각은 관리자도 직접 정할 수 없다
-- (시스템이 자동으로 적는다. 거짓 이력을 남길 수 없게)
create function public.people_protect_columns() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.auth_user_id   := null;
      new.invited_at     := now();
      new.joined_at      := null;
      new.is_active      := true;
      new.deactivated_at := null;
      return new;
    end if;
    if new.auth_user_id is distinct from old.auth_user_id
       or new.joined_at is distinct from old.joined_at
       or new.invited_at is distinct from old.invited_at
       or (new.deactivated_at is distinct from old.deactivated_at
           and new.is_active is not distinct from old.is_active) then
      raise exception '바꿀 수 없는 항목입니다';
    end if;
    if new.is_active is distinct from old.is_active then
      new.deactivated_at := case when new.is_active then null else now() end;
    end if;
  end if;
  return new;
end $$;
create trigger people_protect_columns before insert or update on public.people
  for each row execute function public.people_protect_columns();

-- =====================================================================
-- 가입 막기: 초대받은 이메일만 로그인 계정을 만들 수 있다
--  (구글 로그인으로 처음 들어와도 같은 규칙이 적용된다)
--  계정과 사람 정보의 연결은 이메일이 확인된 뒤에만 한다
--  (초대 메일 링크를 눌렀거나, 구글이 확인한 이메일).
-- =====================================================================
create function public.gate_invited_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.people
                  where email = lower(trim(new.email)) and auth_user_id is null and is_active) then
    raise exception '초대받지 않은 이메일입니다';
  end if;
  return new;
end $$;
create trigger gate_invited_email before insert on auth.users
  for each row execute function public.gate_invited_email();

create function public.link_invited_person() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.people
     set auth_user_id = new.id
   where email = lower(trim(new.email)) and auth_user_id is null and is_active;
  return new;
end $$;
create trigger link_on_confirmed_signup after insert on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function public.link_invited_person();
create trigger link_on_email_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.link_invited_person();

-- 처음 로그인에 성공하면 가입 시각을 남긴다 (서버에서 호출)
create function public.mark_joined() returns void
language sql security definer set search_path = '' as $$
  update public.people set joined_at = now()
   where auth_user_id = auth.uid() and joined_at is null and is_active
$$;

-- 관리자: 그 사람의 모든 기기에서 강제 로그아웃
create function public.admin_sign_out_everywhere(p_person uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있습니다';
  end if;
  delete from auth.sessions
   where user_id = (select auth_user_id from public.people where id = p_person);
  insert into public.audit_log (actor_id, actor_name, table_name, row_id, action, new_data)
  select public.current_person_id(),
         (select name from public.people where id = public.current_person_id()),
         'people', p_person::text, 'UPDATE', jsonb_build_object('강제로그아웃', now());
end $$;

-- =====================================================================
-- 행 수준 보안 (RLS)
--  읽기: 로그인한 활성 직원
--  쓰기: 관리자만
--  로그인하지 않은 사람(anon): 아무것도 못 봄
-- =====================================================================
alter table public.org_settings        enable row level security;
alter table public.departments         enable row level security;
alter table public.positions           enable row level security;
alter table public.people              enable row level security;
alter table public.assignments         enable row level security;
alter table public.approval_lines      enable row level security;
alter table public.approval_line_steps enable row level security;
alter table public.audit_log           enable row level security;

revoke all on public.org_settings, public.departments, public.positions, public.people,
              public.assignments, public.approval_lines, public.approval_line_steps,
              public.audit_log from anon;
-- 표 통째로 비우기(TRUNCATE)는 행 수준 보안과 변경 기록을 건너뛰므로 막는다
revoke truncate, references, trigger on all tables in schema public from authenticated, anon;
-- 지우지 않는 표는 삭제 권한 자체를 없앤다
revoke delete on public.people, public.departments, public.org_settings from authenticated;
revoke execute on function public.admin_sign_out_everywhere(uuid), public.mark_joined(),
                           public.current_person_id(), public.is_member(), public.is_admin(),
                           public.session_alive()
  from public, anon;
grant execute on function public.admin_sign_out_everywhere(uuid), public.mark_joined(),
                          public.current_person_id(), public.is_member(), public.is_admin(),
                          public.session_alive()
  to authenticated;
-- 트리거 전용 함수는 직접 부를 수 없게
revoke execute on function public.write_audit_log(), public.link_invited_person(),
                           public.gate_invited_email() from public, anon, authenticated;

-- 조직 정보: 한 줄을 고치기만 한다 (추가·삭제 없음)
create policy "직원 읽기" on public.org_settings for select to authenticated using (public.is_member());
create policy "관리자 수정" on public.org_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 부서: 삭제 대신 폐지
create policy "직원 읽기" on public.departments for select to authenticated using (public.is_member());
create policy "관리자 추가" on public.departments for insert to authenticated with check (public.is_admin());
create policy "관리자 수정" on public.departments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 직책: 쓰인 적 없는 직책만 삭제 가능 (외래키가 막아 준다)
create policy "직원 읽기" on public.positions for select to authenticated using (public.is_member());
create policy "관리자 추가" on public.positions for insert to authenticated with check (public.is_admin());
create policy "관리자 수정" on public.positions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "관리자 삭제" on public.positions for delete to authenticated using (public.is_admin());

-- 사람: 삭제 대신 비활성
create policy "직원 읽기" on public.people for select to authenticated using (public.is_member());
create policy "관리자 추가" on public.people for insert to authenticated
  with check (public.is_admin() and auth_user_id is null);
create policy "관리자 수정" on public.people for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 인사발령: 이력 보관. 아직 시작 안 한 발령만 취소(삭제) 가능
create policy "직원 읽기" on public.assignments for select to authenticated using (public.is_member());
create policy "관리자 추가" on public.assignments for insert to authenticated with check (public.is_admin());
create policy "관리자 수정" on public.assignments for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "관리자 예정 발령 취소" on public.assignments for delete to authenticated
  using (public.is_admin() and starts_on > current_date);

-- 결재선
create policy "직원 읽기" on public.approval_lines for select to authenticated using (public.is_member());
create policy "관리자 추가" on public.approval_lines for insert to authenticated with check (public.is_admin());
create policy "관리자 수정" on public.approval_lines for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "관리자 삭제" on public.approval_lines for delete to authenticated using (public.is_admin());

create policy "직원 읽기" on public.approval_line_steps for select to authenticated using (public.is_member());
create policy "관리자 추가" on public.approval_line_steps for insert to authenticated with check (public.is_admin());
create policy "관리자 수정" on public.approval_line_steps for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "관리자 삭제" on public.approval_line_steps for delete to authenticated using (public.is_admin());

-- 변경 기록: 관리자만 읽기, 아무도 직접 쓰거나 고치지 못함
create policy "관리자 읽기" on public.audit_log for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.audit_log from authenticated;
