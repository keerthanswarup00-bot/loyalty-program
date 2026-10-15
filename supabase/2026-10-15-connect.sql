-- Connect page: a public "link in bio" page per shop at /app/<shop>/connect, switched on or off by the owner.
-- Needs the latest schema.sql to have been run first (it uses the platform admin check). Safe to run again.

alter table public.businesses add column if not exists connect_on boolean not null default false;
alter table public.businesses add column if not exists connect_title text not null default '';
alter table public.businesses add column if not exists connect_sub text not null default '';
alter table public.businesses add column if not exists review_url text not null default '';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_connect_chk') then
    alter table public.businesses add constraint businesses_connect_chk check (
      char_length(connect_title) <= 80 and char_length(connect_sub) <= 240
      and char_length(review_url) <= 500 and (review_url = '' or review_url ~ '^https://'));
  end if;
end $$;

-- Owners (and platform admins, through the existing row rules) may change only these new columns.
grant update (connect_on, connect_title, connect_sub, review_url) on public.businesses to authenticated;

-- Where the shop can be found (a shop, a stall, a branch) and what is on offer. Read through the owner rules;
-- written only through the functions below. Customers read them through get_connect().
create table if not exists public.shop_locations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  address     text not null default '' check (char_length(address) <= 240),
  maps_url    text not null default '' check (char_length(maps_url) <= 500 and (maps_url = '' or maps_url ~ '^https://')),
  status      text not null default 'open' check (status in ('open', 'closed', 'temporarily_closed')),
  hours_note  text not null default '' check (char_length(hours_note) <= 120),
  featured    boolean not null default false,
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists shop_locations_biz_idx on public.shop_locations (business_id, sort, created_at);

create table if not exists public.shop_promos (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  body        text not null default '' check (char_length(body) <= 300),
  kind        text not null default 'offer' check (kind in ('offer', 'festive')),
  ends_on     date,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists shop_promos_biz_idx on public.shop_promos (business_id, created_at desc);

alter table public.shop_locations enable row level security;
alter table public.shop_promos enable row level security;
revoke all on public.shop_locations, public.shop_promos from anon, authenticated;
grant select on public.shop_locations, public.shop_promos to authenticated;
drop policy if exists shoploc_owner_select on public.shop_locations;
create policy shoploc_owner_select on public.shop_locations for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and (b.owner_id = auth.uid() or (select public._is_platform_admin()))));
drop policy if exists shoppromo_owner_select on public.shop_promos;
create policy shoppromo_owner_select on public.shop_promos for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and (b.owner_id = auth.uid() or (select public._is_platform_admin()))));

-- Public: everything the connect page shows, or null when the shop has the page switched off (or does not exist).
create or replace function public.get_connect(p_slug text) returns json
language plpgsql stable security definer set search_path = public as $$
declare b businesses; today date;
begin
  select * into b from businesses where slug = p_slug and connect_on;
  if not found then return null; end if;
  today := (now() at time zone b.tz)::date;
  return json_build_object(
    'name', b.name, 'tagline', b.tagline, 'color', b.color, 'logo_url', b.logo_url, 'theme', b.theme,
    'ig', b.ig, 'fb', b.fb, 'wa', b.wa, 'web', b.web, 'review_url', b.review_url,
    'title', b.connect_title, 'sub', b.connect_sub, 'tz', b.tz,
    'locations', coalesce((select json_agg(json_build_object('id', l.id, 'name', l.name, 'address', l.address,
                  'maps_url', l.maps_url, 'status', l.status, 'hours_note', l.hours_note) order by l.featured desc, l.sort, l.created_at)
                from shop_locations l where l.business_id = b.id and l.active), '[]'::json),
    'promos', coalesce((select json_agg(json_build_object('id', p.id, 'title', p.title, 'body', p.body, 'kind', p.kind, 'ends_on', p.ends_on)
                  order by p.created_at desc)
                from shop_promos p where p.business_id = b.id and p.active and (p.ends_on is null or p.ends_on >= today)), '[]'::json));
end $$;

-- Owner / platform admin: add (p_id null) or change a location. Returns its id.
create or replace function public.save_location(p_slug text, p_id uuid, p_name text, p_address text, p_maps_url text,
  p_status text, p_hours text, p_featured boolean, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare b businesses; r uuid; n text := btrim(coalesce(p_name, ''));
begin
  select * into b from businesses where slug = p_slug and (owner_id = auth.uid() or (select public._is_platform_admin()));
  if not found then raise exception 'Not allowed'; end if;
  if char_length(n) < 1 or char_length(n) > 80 then raise exception 'Give the location a name (up to 80 characters)'; end if;
  if coalesce(p_status, '') not in ('open', 'closed', 'temporarily_closed') then raise exception 'Pick open, closed or temporarily closed'; end if;
  if btrim(coalesce(p_maps_url, '')) <> '' and btrim(p_maps_url) !~ '^https://' then raise exception 'The map link must start with https://'; end if;
  if p_id is null then
    if (select count(*) from shop_locations where business_id = b.id) >= 20 then raise exception 'Too many locations (20 max)'; end if;
    insert into shop_locations (business_id, name, address, maps_url, status, hours_note, featured, active, sort)
    values (b.id, n, left(btrim(coalesce(p_address, '')), 240), btrim(coalesce(p_maps_url, '')), p_status, left(btrim(coalesce(p_hours, '')), 120),
            coalesce(p_featured, false), coalesce(p_active, true), coalesce((select max(sort) from shop_locations where business_id = b.id), 0) + 1)
    returning id into r;
  else
    update shop_locations set name = n, address = left(btrim(coalesce(p_address, '')), 240), maps_url = btrim(coalesce(p_maps_url, '')),
           status = p_status, hours_note = left(btrim(coalesce(p_hours, '')), 120), featured = coalesce(p_featured, false), active = coalesce(p_active, true)
     where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Location not found'; end if;
  end if;
  return r;
end $$;

-- Quick open / closed switch for a location.
create or replace function public.set_location_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_status, '') not in ('open', 'closed', 'temporarily_closed') then raise exception 'Pick open, closed or temporarily closed'; end if;
  update shop_locations l set status = p_status from businesses b
   where l.id = p_id and b.id = l.business_id and (b.owner_id = auth.uid() or (select public._is_platform_admin()));
  if not found then raise exception 'Not allowed'; end if;
end $$;

create or replace function public.delete_location(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from shop_locations l using businesses b
   where l.id = p_id and b.id = l.business_id and (b.owner_id = auth.uid() or (select public._is_platform_admin()));
end $$;

-- Owner / platform admin: add (p_id null) or change an offer shown on the connect page. Returns its id.
create or replace function public.save_promo(p_slug text, p_id uuid, p_title text, p_body text, p_kind text, p_ends date, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare b businesses; r uuid; t text := btrim(coalesce(p_title, ''));
begin
  select * into b from businesses where slug = p_slug and (owner_id = auth.uid() or (select public._is_platform_admin()));
  if not found then raise exception 'Not allowed'; end if;
  if char_length(t) < 1 or char_length(t) > 80 then raise exception 'Give the offer a title (up to 80 characters)'; end if;
  if coalesce(p_kind, 'offer') not in ('offer', 'festive') then raise exception 'Pick offer or festive'; end if;
  if p_id is null then
    if (select count(*) from shop_promos where business_id = b.id) >= 20 then raise exception 'Too many offers (20 max)'; end if;
    insert into shop_promos (business_id, title, body, kind, ends_on, active)
    values (b.id, t, left(btrim(coalesce(p_body, '')), 300), coalesce(p_kind, 'offer'), p_ends, coalesce(p_active, true)) returning id into r;
  else
    update shop_promos set title = t, body = left(btrim(coalesce(p_body, '')), 300), kind = coalesce(p_kind, 'offer'), ends_on = p_ends,
           active = coalesce(p_active, true) where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Offer not found'; end if;
  end if;
  return r;
end $$;

create or replace function public.delete_promo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from shop_promos p using businesses b
   where p.id = p_id and b.id = p.business_id and (b.owner_id = auth.uid() or (select public._is_platform_admin()));
end $$;

revoke execute on function public.get_connect(text), public.save_location(text, uuid, text, text, text, text, text, boolean, boolean),
  public.set_location_status(uuid, text), public.delete_location(uuid),
  public.save_promo(text, uuid, text, text, text, date, boolean), public.delete_promo(uuid) from public, anon, authenticated;
grant execute on function public.get_connect(text) to anon, authenticated;
grant execute on function public.save_location(text, uuid, text, text, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.set_location_status(uuid, text) to authenticated;
grant execute on function public.delete_location(uuid) to authenticated;
grant execute on function public.save_promo(text, uuid, text, text, text, date, boolean) to authenticated;
grant execute on function public.delete_promo(uuid) to authenticated;
