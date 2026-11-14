-- 내 지도 v2: 한 매장에 카테고리 여러 개, 지역 묶음, 화면 옵션(필터·지도 색감·아이콘) 동기화.
-- mymap.sql 을 먼저 실행한 뒤 이 파일을 실행한다. 여러 번 실행해도 결과가 같다.

alter table public.mymap_places
  add column if not exists categories text[] not null default '{}';

-- 기존 단일 카테고리를 목록으로 옮긴다.
update public.mymap_places
  set categories = array[category]
  where categories = '{}' and coalesce(category, '') <> '';

alter table public.mymap_settings
  add column if not exists regions jsonb not null default '[]'::jsonb,
  add column if not exists prefs jsonb not null default '{}'::jsonb;

-- 설정이 바뀌면 다른 기기에도 바로 반영되도록 실시간 반영을 켠다.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mymap_settings'
  ) then
    alter publication supabase_realtime add table public.mymap_settings;
  end if;
end $$;

notify pgrst, 'reload schema';
