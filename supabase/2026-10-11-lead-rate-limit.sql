-- Public contact-form abuse protection.
-- Apply once to the existing Supabase project before deploying the submit-lead Edge Function.
-- Limits are enforced in Postgres so parallel requests cannot bypass them.
-- Only an HMAC of the caller IP is stored; raw IP addresses are not persisted.

create table if not exists public.lead_rate_limits (
  rate_key text not null,
  window_seconds integer not null check (window_seconds in (900, 3600)),
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  updated_at timestamptz not null default now(),
  primary key (rate_key, window_seconds, window_start)
);

create index if not exists lead_rate_limits_updated_idx
  on public.lead_rate_limits (updated_at);

alter table public.lead_rate_limits enable row level security;
revoke all on public.lead_rate_limits from public, anon, authenticated;

-- Replace the directly callable RPC. Only the server-side Edge Function (service_role)
-- may submit a lead, so callers cannot choose or spoof the IP rate-limit key.
drop function if exists public.submit_lead(text, text, text, text);

create or replace function public.submit_lead(
  p_name text,
  p_shop text,
  p_contact text,
  p_message text,
  p_ip_key text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_shop text := trim(coalesce(p_shop, ''));
  v_contact text := trim(coalesce(p_contact, ''));
  v_message text := trim(coalesce(p_message, ''));
  v_now timestamptz := clock_timestamp();
  v_15m timestamptz;
  v_hour timestamptz;
  v_hits int;
  v_allowed boolean := true;
begin
  -- Strict server-side validation; never rely on browser checks.
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Please enter a name between 2 and 80 characters';
  end if;
  if char_length(v_shop) > 80 then raise exception 'Shop name is too long'; end if;
  if char_length(v_contact) < 5 or char_length(v_contact) > 120 then
    raise exception 'Please enter a phone number or email';
  end if;
  if char_length(v_message) > 1000 then raise exception 'Message is too long'; end if;
  if v_name ~ '[[:cntrl:]]' or v_shop ~ '[[:cntrl:]]' or v_contact ~ '[[:cntrl:]]' or v_message ~ '[[:cntrl:]]' then
    raise exception 'Please remove unsupported control characters';
  end if;
  if coalesce(p_ip_key, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid rate-limit key';
  end if;

  v_15m := date_bin(interval '15 minutes', v_now, timestamptz '2000-01-01 00:00:00+00');
  v_hour := date_trunc('hour', v_now);

  -- Per-IP HMAC key: maximum 5 requests / 15 minutes and 20 / hour.
  insert into public.lead_rate_limits (rate_key, window_seconds, window_start, hits, updated_at)
  values (p_ip_key, 900, v_15m, 1, v_now)
  on conflict (rate_key, window_seconds, window_start)
  do update set hits = public.lead_rate_limits.hits + 1, updated_at = excluded.updated_at
  returning hits into v_hits;
  if v_hits > 5 then v_allowed := false; end if;

  insert into public.lead_rate_limits (rate_key, window_seconds, window_start, hits, updated_at)
  values (p_ip_key, 3600, v_hour, 1, v_now)
  on conflict (rate_key, window_seconds, window_start)
  do update set hits = public.lead_rate_limits.hits + 1, updated_at = excluded.updated_at
  returning hits into v_hits;
  if v_hits > 20 then v_allowed := false; end if;

  -- A global emergency ceiling protects the inbox/database if traffic spikes.
  insert into public.lead_rate_limits (rate_key, window_seconds, window_start, hits, updated_at)
  values ('global', 3600, v_hour, 1, v_now)
  on conflict (rate_key, window_seconds, window_start)
  do update set hits = public.lead_rate_limits.hits + 1, updated_at = excluded.updated_at
  returning hits into v_hits;
  if v_hits > 200 then v_allowed := false; end if;

  if not v_allowed then return false; end if;

  insert into public.leads (name, shop, contact, message)
  values (v_name, v_shop, v_contact, v_message);

  return true;
end;
$$;

revoke execute on function public.submit_lead(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_lead(text, text, text, text, text) to service_role;

-- Keep the rate-limit table small. This can also be run periodically as a scheduled cleanup.
delete from public.lead_rate_limits where updated_at < now() - interval '2 days';
