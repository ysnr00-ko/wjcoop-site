-- 조직 로고 · 직인 이미지 보관함
--  로고: 로그인한 직원이 볼 수 있다.
--  직인(seal/ 폴더): 위조 위험이 있어 관리자만 볼 수 있다. 결의서 PDF 에는 서버가 찍는다.
--  올리기·바꾸기·지우기: 관리자만.
insert into storage.buckets (id, name, public)
values ('org-assets', 'org-assets', false)
on conflict (id) do nothing;

create policy "org-assets 읽기" on storage.objects for select to authenticated
  using (bucket_id = 'org-assets' and public.is_member()
         and (name not like 'seal/%' or public.is_admin()));
create policy "org-assets 관리자 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'org-assets' and public.is_admin());
create policy "org-assets 관리자 바꾸기" on storage.objects for update to authenticated
  using (bucket_id = 'org-assets' and public.is_admin())
  with check (bucket_id = 'org-assets' and public.is_admin());
create policy "org-assets 관리자 지우기" on storage.objects for delete to authenticated
  using (bucket_id = 'org-assets' and public.is_admin());
