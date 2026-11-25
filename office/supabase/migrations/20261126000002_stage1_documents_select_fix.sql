-- 문서 보기 규칙 고침
--  새 문서를 저장하면서 바로 돌려받을 때(insert ... returning) '볼 수 있는가' 검사가
--  아직 저장되지 않은 줄을 다시 찾아보느라 막히던 문제. 줄의 값으로 바로 판단하게 바꾼다.

-- 이 문서의 결재선에 내가 들어 있는가
create function public.is_document_assignee(p_doc uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.document_steps
                  where document_id = p_doc and assignee_id = public.current_person_id())
$$;
revoke execute on function public.is_document_assignee(uuid) from public, anon, authenticated;
grant execute on function public.is_document_assignee(uuid) to authenticated;

drop policy "볼 수 있는 문서" on public.documents;
create policy "볼 수 있는 문서" on public.documents for select to authenticated
  using (public.is_member()
         and (drafter_id = public.current_person_id()
              or (status <> 'draft'
                  and (public.is_admin()
                       or public.is_document_assignee(id)
                       or public.in_my_subtree(department_id)))));
