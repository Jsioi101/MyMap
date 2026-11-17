-- 내 지도 v4: 여행 일정. mymap_v3_shared.sql 다음에 실행한다. 여러 번 실행해도 결과가 같다.
--
-- 여행(mymap_trips)
--   보기·추가·수정 : 승인된 회원 누구나 (함께 계획)
--   삭제           : 만든 사람 본인 또는 관리자
--   공유 링크       : share_token 이 있으면 로그인 없이 mymap_shared_trip(token) 으로 '보기만' 할 수 있다
--
-- days 형식: [{ "date": "2026-12-01", "title": "", "stops": [{ "placeId": "<mymap_places.id>", "memo": "" }] }]

create table if not exists public.mymap_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  days jsonb not null default '[]'::jsonb,
  share_token uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mymap_trips enable row level security;

drop policy if exists "mymap trips read" on public.mymap_trips;
drop policy if exists "mymap trips insert" on public.mymap_trips;
drop policy if exists "mymap trips update" on public.mymap_trips;
drop policy if exists "mymap trips delete" on public.mymap_trips;

create policy "mymap trips read" on public.mymap_trips
  for select to authenticated using ((select public.is_approved()));
create policy "mymap trips insert" on public.mymap_trips
  for insert to authenticated with check (user_id = auth.uid() and (select public.is_approved()));
create policy "mymap trips update" on public.mymap_trips
  for update to authenticated using ((select public.is_approved())) with check ((select public.is_approved()));
create policy "mymap trips delete" on public.mymap_trips
  for delete to authenticated using ((select public.is_approved()) and (user_id = auth.uid() or (select public.is_admin())));

grant select, insert, update, delete on public.mymap_trips to authenticated;

-- 다른 사람이 수정해도 '만든 사람'이 바뀌지 않게 한다. (mymap_v3_shared.sql 에도 있는 함수)
create or replace function public.mymap_keep_owner()
returns trigger language plpgsql as $$
begin
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists mymap_trips_keep_owner on public.mymap_trips;
create trigger mymap_trips_keep_owner
  before update on public.mymap_trips
  for each row execute function public.mymap_keep_owner();

-- 공유 링크로 여는 '보기 전용' 여행: 여행 정보와 일정에 들어 있는 장소만 돌려준다.
create or replace function public.mymap_shared_trip(token uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trip', jsonb_build_object('id', t.id, 'name', t.name, 'start_date', t.start_date, 'end_date', t.end_date, 'days', t.days),
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'address', p.address, 'road_address', p.road_address, 'phone', p.phone,
        'lat', p.lat, 'lng', p.lng, 'place_url', p.place_url, 'category', p.category, 'categories', p.categories))
      from public.mymap_places p
      where p.id::text in (
        select s ->> 'placeId'
        from jsonb_array_elements(t.days) d, jsonb_array_elements(coalesce(d -> 'stops', '[]'::jsonb)) s
      )
    ), '[]'::jsonb)
  )
  from public.mymap_trips t
  where token is not null and t.share_token = token;
$$;

grant execute on function public.mymap_shared_trip(uuid) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mymap_trips'
  ) then
    alter publication supabase_realtime add table public.mymap_trips;
  end if;
end $$;

notify pgrst, 'reload schema';
