-- 모든 부서 문서 보기를 사람마다 켜고 끌 수 있게 (담당자 결정 2026-11-26)
--  이전: 관리자는 자동으로 모든 상신 문서를 봄
--  이후: 관리자가 직원마다 '모든 부서 문서 보기'를 켜 준 사람만 전체를 본다. 관리자라도 자동은 아니다.
--  (법인=맨 위 부서에 발령된 사람(이사장 등)은 원래 규칙대로 전체를 본다.)
--  지금 관리자인 사람은 보이는 범위가 갑자기 줄지 않게 처음엔 켜 둔다.

alter table public.people add column can_view_all_docs boolean not null default false;
update public.people set can_view_all_docs = true where is_admin;

-- 지금 로그인한 사람이 모든 부서 문서를 볼 수 있는가
create function public.can_view_all_docs() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select can_view_all_docs from public.people where id = public.current_person_id()), false)
$$;
revoke execute on function public.can_view_all_docs() from public, anon, authenticated;
grant execute on function public.can_view_all_docs() to authenticated;

create or replace function public.can_view_document(p_doc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
     where d.id = p_doc
       and public.is_member()
       and (d.drafter_id = public.current_person_id()
            or (d.status <> 'draft'
                and (public.can_view_all_docs()
                     or exists (select 1 from public.document_steps s
                                 where s.document_id = d.id and s.assignee_id = public.current_person_id())
                     or public.in_my_subtree(d.department_id))))
  )
$$;

drop policy "볼 수 있는 문서" on public.documents;
create policy "볼 수 있는 문서" on public.documents for select to authenticated
  using (public.is_member()
         and (drafter_id = public.current_person_id()
              or (status <> 'draft'
                  and (public.can_view_all_docs()
                       or public.is_document_assignee(id)
                       or public.in_my_subtree(department_id)))));
