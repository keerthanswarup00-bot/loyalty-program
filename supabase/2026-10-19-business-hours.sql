-- Opening hours for the Connect page (shows an "Open now / Closed" badge and a weekly list).
-- Run in the Supabase SQL editor. Safe to run more than once. Needs 2026-10-18-connect-hero.sql applied first.
-- Format: {"mon":[["09:00","21:00"]],"tue":[],...}. A missing day or [] = closed. A close time at or before the open
-- time runs past midnight. {} = hours not set (no badge is shown). Times use the shop's own time zone (businesses.tz).

alter table public.businesses add column if not exists hours jsonb not null default '{}'::jsonb;

grant update (hours) on public.businesses to authenticated;

create or replace function public.get_business(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'slug', slug,
    'name', name, 'tagline', tagline, 'color', color, 'logo_url', logo_url,
    'stamp_url', stamp_url,
    'ig', ig, 'fb', fb, 'yt', yt, 'wa', wa, 'web', web,
    'phone', phone, 'wa_phone', wa_phone, 'address', address, 'maps_url', maps_url,
    'lat', lat, 'lng', lng, 'review_url', review_url,
    'links', links, 'gallery', gallery, 'vertical', vertical,
    'hero_url', hero_url, 'about', about, 'connect_loyalty', connect_loyalty,
    'hours', hours,
    'need', need, 'reward', reward,
    'cooldown_min', cooldown_min, 'sur_stamps', sur_stamps, 'sur_offer', sur_offer,
    'welcome_offer', welcome_offer, 'bday_offer', bday_offer, 'exp_days', exp_days,
    'join_stamp', join_stamp, 'card_months', card_months, 'tz', tz,
    'news_text', news_text, 'news_at', news_at, 'ref_on', ref_on, 'ref_offer', ref_offer,
    'theme', theme)
  from businesses where slug = p_slug;
$$;
grant execute on function public.get_business(text) to anon, authenticated;

notify pgrst, 'reload schema';
