do $$ begin
  alter publication supabase_realtime add table public.offers;
exception when duplicate_object then null; end $$;