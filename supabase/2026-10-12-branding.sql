-- Per-client look: a small, validated theme (corner style, heading font, header style).
-- Safe to re-run. Also included in schema.sql.
-- Why a fixed set of choices and not free CSS: the value is shown to every customer of the shop, so it must never be able to carry markup.

alter table public.businesses add column if not exists theme jsonb not null default '{}'::jsonb;

create or replace function public._theme_ok(t jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(t) = 'object'
     and not exists (select 1 from jsonb_object_keys(t) k where k not in ('radius', 'font', 'hero', 'done'))
     and coalesce(t->>'radius', 'soft') in ('sharp', 'soft', 'round')
     and coalesce(t->>'font', 'serif') in ('serif', 'sans')
     and coalesce(t->>'hero', 'gradient') in ('gradient', 'solid')
     and (not (t ? 'done') or jsonb_typeof(t->'done') = 'boolean');
$$;
-- The check runs as the signed-in owner, so they need to be able to call this harmless pure function.
revoke execute on function public._theme_ok(jsonb) from public, anon;
grant execute on function public._theme_ok(jsonb) to authenticated;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_theme_chk') then
    alter table public.businesses add constraint businesses_theme_chk check (public._theme_ok(theme));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'businesses_color_chk') then
    alter table public.businesses add constraint businesses_color_chk check (color ~ '^#[0-9a-fA-F]{6}$') not valid;
  end if;
end $$;

grant update (theme) on public.businesses to authenticated;

create or replace function public.get_business(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', name, 'tagline', tagline, 'color', color, 'logo_url', logo_url,
    'stamp_url', stamp_url,
    'ig', ig, 'fb', fb, 'wa', wa, 'web', web, 'need', need, 'reward', reward,
    'cooldown_min', cooldown_min, 'sur_stamps', sur_stamps, 'sur_offer', sur_offer,
    'welcome_offer', welcome_offer, 'bday_offer', bday_offer, 'exp_days', exp_days,
    'join_stamp', join_stamp, 'card_months', card_months, 'tz', tz,
    'news_text', news_text, 'news_at', news_at, 'ref_on', ref_on, 'ref_offer', ref_offer,
    'theme', theme)
  from businesses where slug = p_slug;
$$;
revoke execute on function public.get_business(text) from public, anon, authenticated;
grant execute on function public.get_business(text) to anon, authenticated;
