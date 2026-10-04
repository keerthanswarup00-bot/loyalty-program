-- Loyalty Kit backend (Supabase / Postgres)
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: it only creates what is missing and replaces the functions/policies.

-- ---------- Tables ----------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  tagline text not null default '',
  color text not null default '#8a4b2a',
  logo_url text not null default '',
  ig text not null default '',
  fb text not null default '',
  wa text not null default '',
  web text not null default '',
  need int not null default 8 check (need between 2 and 20),
  reward text not null default 'Free reward',
  cooldown_min int not null default 60 check (cooldown_min >= 0),
  sur_stamps text not null default '',
  sur_offer text not null default '',
  welcome_offer text not null default '',
  bday_offer text not null default '',
  exp_days int not null default 30 check (exp_days >= 0),
  tz text not null default 'Asia/Kolkata',
  scan_token text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text not null,
  bday date,
  stamps int not null default 0,
  total int not null default 0,
  redeemed int not null default 0,
  last_stamp timestamptz,
  bday_year int,
  consent boolean not null default true,
  joined timestamptz not null default now(),
  unique (business_id, user_id),
  unique (business_id, phone)
);
create index if not exists members_business_idx on public.members (business_id);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null,
  text text not null,
  code text not null,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists offers_member_idx on public.offers (member_id);

create table if not exists public.visits (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists visits_business_idx on public.visits (business_id, created_at);

-- ---------- Row level security ----------
-- Customers can read only their own rows. Owners can read only their business's rows.
-- Nobody writes to members/offers/visits directly: all writes go through the functions below.
alter table public.businesses enable row level security;
alter table public.members enable row level security;
alter table public.offers enable row level security;
alter table public.visits enable row level security;

drop policy if exists biz_owner_select on public.businesses;
create policy biz_owner_select on public.businesses for select to authenticated
  using (owner_id = auth.uid());
drop policy if exists biz_owner_update on public.businesses;
create policy biz_owner_update on public.businesses for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists member_self_select on public.members;
create policy member_self_select on public.members for select to authenticated
  using (user_id = auth.uid());
drop policy if exists member_owner_select on public.members;
create policy member_owner_select on public.members for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

drop policy if exists offer_self_select on public.offers;
create policy offer_self_select on public.offers for select to authenticated
  using (member_id in (select id from public.members where user_id = auth.uid()));
drop policy if exists offer_owner_select on public.offers;
create policy offer_owner_select on public.offers for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

drop policy if exists visit_owner_select on public.visits;
create policy visit_owner_select on public.visits for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

-- Table privileges: read-only for members/offers/visits; owners may edit only these business columns.
revoke all on public.businesses, public.members, public.offers, public.visits from anon, authenticated;
grant select on public.businesses, public.members, public.offers, public.visits to authenticated;
grant update (name, tagline, color, logo_url, ig, fb, wa, web, need, reward, cooldown_min,
              sur_stamps, sur_offer, welcome_offer, bday_offer, exp_days, scan_token)
  on public.businesses to authenticated;

-- ---------- Functions ----------
-- Public branding for the customer page (never exposes the scan token or owner).
create or replace function public.get_business(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', name, 'tagline', tagline, 'color', color, 'logo_url', logo_url,
    'ig', ig, 'fb', fb, 'wa', wa, 'web', web, 'need', need, 'reward', reward,
    'cooldown_min', cooldown_min, 'sur_stamps', sur_stamps, 'sur_offer', sur_offer,
    'welcome_offer', welcome_offer, 'bday_offer', bday_offer, 'exp_days', exp_days)
  from businesses where slug = p_slug;
$$;

-- Internal helper: hand an offer to a member.
create or replace function public._give(p_member uuid, p_biz uuid, p_type text, p_text text, p_days int)
returns void language sql security definer set search_path = public as $$
  insert into offers (member_id, business_id, type, text, code, expires_at)
  values (p_member, p_biz, p_type, p_text,
          upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)),
          case when p_days > 0 then now() + make_interval(days => p_days) end);
$$;

-- Create the member row for the signed-in customer and give the welcome offer.
create or replace function public.join_business(p_slug text, p_name text, p_phone text, p_bday date, p_consent boolean)
returns void language plpgsql security definer set search_path = public as $$
declare b businesses; m uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not coalesce(p_consent, false) then raise exception 'Consent is required to join'; end if;
  select * into b from businesses where slug = p_slug;
  if not found then raise exception 'Unknown business'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 or length(coalesce(p_phone, '')) < 7 then
    raise exception 'Please enter a valid name and phone number';
  end if;
  insert into members (business_id, user_id, name, phone, bday, consent)
  values (b.id, auth.uid(), trim(p_name), p_phone, p_bday, true)
  returning id into m;
  if b.welcome_offer <> '' then perform _give(m, b.id, 'Welcome', b.welcome_offer, b.exp_days); end if;
end $$;

-- The customer's card: stats and offers. Also grants the yearly birthday offer.
create or replace function public.my_card(p_slug text) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; m members; local_now timestamp; granted boolean := false;
begin
  if auth.uid() is null then return null; end if;
  select * into b from businesses where slug = p_slug;
  if not found then return null; end if;
  select * into m from members where business_id = b.id and user_id = auth.uid();
  if not found then return null; end if;
  local_now := now() at time zone b.tz;
  if b.bday_offer <> '' and m.bday is not null
     and extract(month from m.bday) = extract(month from local_now)
     and coalesce(m.bday_year, 0) <> extract(year from local_now)::int then
    perform _give(m.id, b.id, 'Birthday', b.bday_offer, b.exp_days);
    update members set bday_year = extract(year from local_now)::int where id = m.id;
    granted := true;
  end if;
  return json_build_object(
    'granted', granted,
    'member', json_build_object('name', m.name, 'phone', m.phone, 'bday', m.bday,
              'stamps', m.stamps, 'total', m.total, 'redeemed', m.redeemed, 'last_stamp', m.last_stamp),
    'offers', coalesce((select json_agg(json_build_object(
                'id', o.id, 'type', o.type, 'text', o.text, 'code', o.code,
                'expires_at', o.expires_at, 'used_at', o.used_at) order by o.created_at desc)
              from offers o where o.member_id = m.id), '[]'::json));
end $$;

-- Add one stamp (needs the secret scan token from the QR / NFC link). Enforces the cooldown.
create or replace function public.add_stamp(p_slug text, p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; m members; wait int; pos int; surprise text := null;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  select * into b from businesses where slug = p_slug;
  if not found or b.scan_token <> coalesce(p_token, '') then
    return json_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into m from members where business_id = b.id and user_id = auth.uid() for update;
  if not found then return json_build_object('ok', false, 'error', 'nomember'); end if;
  if m.last_stamp is not null then
    wait := ceil(extract(epoch from (m.last_stamp + make_interval(mins => b.cooldown_min) - now())))::int;
    if wait > 0 then return json_build_object('ok', false, 'error', 'cooldown', 'wait', wait); end if;
  end if;
  update members set stamps = stamps + 1, total = total + 1, last_stamp = now()
    where id = m.id returning * into m;
  insert into visits (member_id, business_id) values (m.id, b.id);
  pos := (m.stamps - 1) % b.need + 1;
  if b.sur_offer <> '' and exists (
       select 1 from unnest(string_to_array(regexp_replace(b.sur_stamps, '\s', '', 'g'), ',')) s
       where s ~ '^[0-9]+$' and s::int = pos) then
    perform _give(m.id, b.id, 'Surprise', b.sur_offer, b.exp_days);
    surprise := b.sur_offer;
  end if;
  return json_build_object('ok', true, 'stamps', m.stamps, 'surprise', surprise);
end $$;

-- Redeem the main reward when the card is full.
create or replace function public.redeem_reward(p_slug text) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; m members;
begin
  select * into b from businesses where slug = p_slug;
  select * into m from members where business_id = b.id and user_id = auth.uid() for update;
  if not found or m.stamps < b.need then raise exception 'Card is not full yet'; end if;
  update members set stamps = stamps - b.need, redeemed = redeemed + 1 where id = m.id;
  return json_build_object('code', upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)));
end $$;

-- Mark one of the customer's offers as used.
create or replace function public.use_offer(p_offer uuid) returns json
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  update offers set used_at = now()
   where id = p_offer and used_at is null and (expires_at is null or expires_at > now())
     and member_id in (select id from members where user_id = auth.uid())
   returning code into c;
  if c is null then raise exception 'This offer is no longer available'; end if;
  return json_build_object('code', c);
end $$;

-- Owner deletes a customer completely (login, card, offers, visits).
create or replace function public.delete_member(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select m.user_id into uid from members m join businesses b on b.id = m.business_id
   where m.id = p_member and b.owner_id = auth.uid();
  if uid is null then raise exception 'Not allowed'; end if;
  if exists (select 1 from businesses where owner_id = uid) then raise exception 'Not allowed'; end if;
  delete from auth.users where id = uid;
end $$;

-- Customer deletes their own account.
create or replace function public.delete_me() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from businesses where owner_id = auth.uid()) then raise exception 'Owner accounts cannot be deleted here'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- Who may call what ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.get_business(text) to anon, authenticated;
grant execute on function public.join_business(text, text, text, date, boolean) to authenticated;
grant execute on function public.my_card(text) to authenticated;
grant execute on function public.add_stamp(text, text) to authenticated;
grant execute on function public.redeem_reward(text) to authenticated;
grant execute on function public.use_offer(uuid) to authenticated;
grant execute on function public.delete_member(uuid) to authenticated;
grant execute on function public.delete_me() to authenticated;
