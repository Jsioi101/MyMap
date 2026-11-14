-- 내 매장 지도(MyMap) 테이블. TodoBoard 와 같은 Supabase 프로젝트를 쓴다.
-- TodoBoard 의 members / is_approved() 를 그대로 써서, 승인된 계정만 자기 데이터를 읽고 쓴다.
-- 여러 번 실행해도 결과가 같다.

create table if not exists public.mymap_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kakao_id text,
  name text not null,
  address text not null default '',
  road_address text not null default '',
  phone text not null default '',
  lat double precision not null,
  lng double precision not null,
  place_url text not null default '',
  kakao_category text not null default '',
  category text not null default '기타',
  tags text[] not null default '{}',
  memo text not null default '',
  rating smallint not null default 0 check (rating between 0 and 5),
  visited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mymap_places_user_idx on public.mymap_places (user_id);

create table if not exists public.mymap_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  cats jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.mymap_places enable row level security;
alter table public.mymap_settings enable row level security;

drop policy if exists "mymap places own" on public.mymap_places;
create policy "mymap places own" on public.mymap_places
  for all to authenticated
  using (user_id = auth.uid() and (select public.is_approved()))
  with check (user_id = auth.uid() and (select public.is_approved()));

drop policy if exists "mymap settings own" on public.mymap_settings;
create policy "mymap settings own" on public.mymap_settings
  for all to authenticated
  using (user_id = auth.uid() and (select public.is_approved()))
  with check (user_id = auth.uid() and (select public.is_approved()));

grant select, insert, update, delete on public.mymap_places to authenticated;
grant select, insert, update, delete on public.mymap_settings to authenticated;

-- 다른 기기에서 바꾼 내용이 바로 보이도록 실시간 반영을 켠다.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mymap_places'
  ) then
    alter publication supabase_realtime add table public.mymap_places;
  end if;
end $$;

notify pgrst, 'reload schema';
