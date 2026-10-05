-- Add the stamp image column behind the admin "Stamp image" upload.
-- Safe to run more than once.

alter table public.businesses add column if not exists stamp_url text not null default '';

-- Owners may edit only these business columns, so the new one must be listed here.
revoke update on public.businesses from anon, authenticated;
grant update (name, tagline, color, logo_url, stamp_url, ig, fb, wa, web, need, reward, cooldown_min,
              sur_stamps, sur_offer, welcome_offer, bday_offer, exp_days, join_stamp, card_months, scan_token)
  on public.businesses to authenticated;

-- The customer page reads branding through this function, so it has to return the new column.
create or replace function public.get_business(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', name, 'tagline', tagline, 'color', color, 'logo_url', logo_url,
    'stamp_url', stamp_url,
    'ig', ig, 'fb', fb, 'wa', wa, 'web', web, 'need', need, 'reward', reward,
    'cooldown_min', cooldown_min, 'sur_stamps', sur_stamps, 'sur_offer', sur_offer,
    'welcome_offer', welcome_offer, 'bday_offer', bday_offer, 'exp_days', exp_days,
    'join_stamp', join_stamp, 'card_months', card_months, 'tz', tz)
  from businesses where slug = p_slug;
$$;

grant execute on function public.get_business(text) to anon, authenticated;
