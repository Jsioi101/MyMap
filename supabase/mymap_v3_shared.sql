-- 내 지도 v3: 즐겨찾기를 승인된 회원 모두가 함께 본다. 옵션(mymap_settings)은 지금처럼 각자 따로.
-- mymap.sql, mymap_v2.sql 다음에 실행한다. 여러 번 실행해도 결과가 같다.
--
-- 즐겨찾기(mymap_places)
--   보기   : 승인된 회원 누구나
--   추가   : 승인된 회원 (추가한 사람이 user_id 로 남는다)
--   수정   : 승인된 회원 누구나 (카테고리·메모 등을 같이 정리)
--   삭제   : 추가한 사람 본인 또는 관리자

drop policy if exists "mymap places own" on public.mymap_places;
drop policy if exists "mymap places read" on public.mymap_places;
drop policy if exists "mymap places insert" on public.mymap_places;
drop policy if exists "mymap places update" on public.mymap_places;
drop policy if exists "mymap places delete" on public.mymap_places;

create policy "mymap places read" on public.mymap_places
  for select to authenticated
  using ((select public.is_approved()));

create policy "mymap places insert" on public.mymap_places
  for insert to authenticated
  with check (user_id = auth.uid() and (select public.is_approved()));

create policy "mymap places update" on public.mymap_places
  for update to authenticated
  using ((select public.is_approved()))
  with check ((select public.is_approved()));

create policy "mymap places delete" on public.mymap_places
  for delete to authenticated
  using ((select public.is_approved()) and (user_id = auth.uid() or (select public.is_admin())));

-- 다른 사람이 수정해도 '추가한 사람'은 바뀌지 않게 한다.
create or replace function public.mymap_keep_owner()
returns trigger language plpgsql as $$
begin
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists mymap_places_keep_owner on public.mymap_places;
create trigger mymap_places_keep_owner
  before update on public.mymap_places
  for each row execute function public.mymap_keep_owner();

-- 즐겨찾기에 '추가한 사람' 이름을 보여 주기 위해 승인된 회원의 이름만 돌려준다. (이메일은 주지 않는다)
create or replace function public.mymap_people()
returns table (user_id uuid, name text)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(nullif(m.name, ''), split_part(m.email, '@', 1))
  from public.members m
  where m.status = 'approved' and (select public.is_approved());
$$;

grant execute on function public.mymap_people() to authenticated;

notify pgrst, 'reload schema';
