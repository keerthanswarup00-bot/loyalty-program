-- Phase 7: the Connect page.
-- A public one-page site per shop (innondu.com/connect/<slug>) plus its owner editor
-- (innondu.com/connect/<slug>/admin). This adds the extra profile fields the page shows
-- and the owner can edit, widens get_business() so the page and its share preview can read them,
-- and adds a reorder function for products. Safe to run more than once.
-- Run it in the Supabase SQL editor.

-- ---------- 1) Extra Connect fields on businesses ----------
alter table public.businesses add column if not exists phone text not null default '';
alter table public.businesses add column if not exists wa_phone text not null default '';
alter table public.businesses add column if not exists address text not null default '';
alter table public.businesses add column if not exists maps_url text not null default '';
alter table public.businesses add column if not exists lat double precision;
alter table public.businesses add column if not exists lng double precision;
alter table public.businesses add column if not exists review_url text not null default '';
alter table public.businesses add column if not exists yt text not null default '';
-- Custom links: [{"label":"Book a table","url":"https://..."}].
alter table public.businesses add column if not exists links jsonb not null default '[]'::jsonb;
-- Photo gallery: a short list of image URLs uploaded to the public "brand" bucket.
alter table public.businesses add column if not exists gallery jsonb not null default '[]'::jsonb;
-- Shop type: cafe | bakery | salon | boutique | repair | generic (see assets/verticals.js).
alter table public.businesses add column if not exists vertical text not null default 'cafe';

-- Owners edit the new columns through the same row rules as the rest of their row.
grant update (phone, wa_phone, address, maps_url, lat, lng, review_url, yt, links, gallery, vertical)
  on public.businesses to authenticated;

-- ---------- 2) get_business returns the Connect fields (never scan_token, join_token or owner) ----------
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
    'need', need, 'reward', reward,
    'cooldown_min', cooldown_min, 'sur_stamps', sur_stamps, 'sur_offer', sur_offer,
    'welcome_offer', welcome_offer, 'bday_offer', bday_offer, 'exp_days', exp_days,
    'join_stamp', join_stamp, 'card_months', card_months, 'tz', tz,
    'news_text', news_text, 'news_at', news_at, 'ref_on', ref_on, 'ref_offer', ref_offer,
    'theme', theme)
  from businesses where slug = p_slug;
$$;

-- ---------- 3) Reorder products ----------
create or replace function public.reorder_menu_items(p_slug text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare b businesses;
begin
  select * into b from businesses where slug = p_slug and (owner_id = auth.uid() or (select public._is_platform_admin()));
  if not found then raise exception 'Not allowed'; end if;
  update menu_items i set sort = x.ord
    from unnest(coalesce(p_ids, '{}'::uuid[])) with ordinality as x(id, ord)
   where i.id = x.id and i.business_id = b.id;
end $$;

revoke execute on function public.reorder_menu_items(text, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_menu_items(text, uuid[]) to authenticated;
