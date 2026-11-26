-- 변경 기록에서 문서 내용이 새지 않게 (보안 검토 반영)
--  변경 기록에는 문서 내용(제목·금액·내역, 임시저장 중인 내용 포함)이 통째로 남는다.
--  지금까지는 관리자가 변경 기록을 모두 볼 수 있어서, '모든 부서 문서 보기'를 꺼도
--  변경 기록으로 다른 부서 문서와 남의 임시저장 문서를 볼 수 있었다.
--  → 문서·결재 단계의 변경 기록은 그 문서를 볼 수 있는 사람(관리자 포함)에게만 보인다.
--    지워진 임시저장 문서의 기록은 아무에게도 보이지 않는다.

drop policy "관리자 읽기" on public.audit_log;
create policy "관리자 읽기" on public.audit_log for select to authenticated
  using (public.is_admin()
         and (table_name not in ('documents', 'document_steps')
              or (table_name = 'documents'
                  and public.can_view_document(nullif(row_id, '')::uuid))
              or (table_name = 'document_steps'
                  and public.can_view_document((coalesce(new_data, old_data) ->> 'document_id')::uuid))));
