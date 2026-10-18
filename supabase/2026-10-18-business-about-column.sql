-- Aroma Scripts brand story field.
-- Run once in Supabase Dashboard -> SQL Editor.
alter table public.businesses
  add column if not exists about text not null default '';

notify pgrst, 'reload schema';
