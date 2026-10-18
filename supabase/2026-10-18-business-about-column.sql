-- Brand story ("about") field for the Connect page.
-- Run once in Supabase Dashboard -> SQL Editor. Safe to run more than once.
-- The column grant matters: without it the owner's save is refused with "permission denied".
-- (2026-10-18-connect-hero.sql does the same and also adds hero_url, connect_loyalty and get_business.)
alter table public.businesses
  add column if not exists about text not null default '';

grant update (about) on public.businesses to authenticated;

notify pgrst, 'reload schema';
