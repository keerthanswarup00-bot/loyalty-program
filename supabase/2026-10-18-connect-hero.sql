-- Connect page: hero image, "about" description and a switch for the loyalty button.
-- Run in the Supabase SQL editor. Safe to run more than once.

alter table public.businesses add column if not exists hero_url text not null default '';
alter table public.businesses add column if not exists about text not null default '';
-- true = show "Join the loyalty card" on the Connect page (default, so every other shop is unchanged).
alter table public.businesses add column if not exists connect_loyalty boolean not null default true;

grant update (hero_url, about, connect_loyalty) on public.businesses to authenticated;

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
    'need', need, 'reward', reward,
    'cooldown_min', cooldown_min, 'sur_stamps', sur_stamps, 'sur_offer', sur_offer,
    'welcome_offer', welcome_offer, 'bday_offer', bday_offer, 'exp_days', exp_days,
    'join_stamp', join_stamp, 'card_months', card_months, 'tz', tz,
    'news_text', news_text, 'news_at', news_at, 'ref_on', ref_on, 'ref_offer', ref_offer,
    'theme', theme)
  from businesses where slug = p_slug;
$$;
grant execute on function public.get_business(text) to anon, authenticated;

-- Aroma Scripts only: hide the loyalty button on its Connect page for now.
-- (To bring it back: set connect_loyalty = true here, or flip the switch in the Connect editor.)
update public.businesses set connect_loyalty = false where slug = 'aroma-scripts';
