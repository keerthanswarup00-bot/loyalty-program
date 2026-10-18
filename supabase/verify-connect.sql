-- Read-only check of everything the Connect editor needs. Changes nothing.
-- Run in Supabase Dashboard -> SQL Editor. Every row should say ok = true.
-- Any false row names the file under supabase/ to run.

with cols(col, fix) as (values
  ('phone','2026-10-16-connect.sql'), ('wa_phone','2026-10-16-connect.sql'), ('address','2026-10-16-connect.sql'),
  ('maps_url','2026-10-16-connect.sql'), ('lat','2026-10-16-connect.sql'), ('lng','2026-10-16-connect.sql'),
  ('review_url','2026-10-16-connect.sql'), ('links','2026-10-16-connect.sql'), ('gallery','2026-10-16-connect.sql'),
  ('vertical','2026-10-16-connect.sql'),
  ('hero_url','2026-10-18-connect-hero.sql'), ('about','2026-10-18-business-about-column.sql'),
  ('connect_loyalty','2026-10-18-connect-hero.sql'), ('hours','2026-10-19-business-hours.sql'))
select 'column ' || c.col as check_name,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'businesses' and column_name = c.col) as ok,
       c.fix as run_if_false
from cols c
union all
select 'owner can update ' || c.col,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'businesses' and column_name = c.col)
            then has_column_privilege('authenticated', 'public.businesses', c.col, 'UPDATE')
            else false end,
       c.fix
from cols c
union all
select 'get_business returns about',
       coalesce((select (get_business(slug)::jsonb -> 'about') is not null from public.businesses limit 1), true),
       '2026-10-18-connect-hero.sql'
union all
select 'get_business returns hours',
       coalesce((select (get_business(slug)::jsonb -> 'hours') is not null from public.businesses limit 1), true),
       '2026-10-19-business-hours.sql'
union all
select 'storage bucket "brand" exists', exists (select 1 from storage.buckets where id = 'brand'), 'schema.sql'
union all
select 'storage bucket "brand" is public', coalesce((select public from storage.buckets where id = 'brand'), false), 'schema.sql'
union all
select 'storage policy ' || p, exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = p), 'schema.sql'
from unnest(array['brand_owner_insert', 'brand_owner_update', 'brand_owner_delete']) as p
order by ok, check_name;
