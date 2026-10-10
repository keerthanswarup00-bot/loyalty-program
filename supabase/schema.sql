-- Loyalty Kit backend (Supabase / Postgres)
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run any time (after every update of this file): it only adds what is missing and replaces the functions.

-- ---------- Tables ----------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  tagline text not null default '',
  color text not null default '#8a4b2a',
  logo_url text not null default '',
  stamp_url text not null default '',
  ig text not null default '',
  fb text not null default '',
  wa text not null default '',
  web text not null default '',
  need int not null default 8 check (need between 2 and 20),
  reward text not null default 'Free reward',
  cooldown_min int not null default 240 check (cooldown_min >= 0),
  sur_stamps text not null default '',
  sur_offer text not null default '',
  welcome_offer text not null default '',
  bday_offer text not null default '',
  exp_days int not null default 30 check (exp_days >= 0),
  join_stamp boolean not null default true,
  card_months int not null default 6 check (card_months >= 0),
  tz text not null default 'Asia/Kolkata',
  scan_token text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
  created_at timestamptz not null default now()
);
alter table public.businesses add column if not exists join_stamp boolean not null default true;
alter table public.businesses add column if not exists card_months int not null default 6 check (card_months >= 0);
alter table public.businesses add column if not exists stamp_url text not null default '';
-- join_token: in the sign-up QR (join + first stamp only). scan_token: written to the NFC tag (every later stamp).
alter table public.businesses add column if not exists join_token text not null default substr(md5(random()::text || clock_timestamp()::text), 1, 12);
-- "What's new" note shown on every customer's card.
alter table public.businesses add column if not exists news_text text not null default '';
alter table public.businesses add column if not exists news_at timestamptz;
-- Refer a friend: both people get a coupon. The referrer's coupon is given when the friend collects a real stamp at the tag.
alter table public.businesses add column if not exists ref_on boolean not null default false;
alter table public.businesses add column if not exists ref_offer text not null default '20% off your next bill';
alter table public.businesses add column if not exists ref_cap int not null default 5 check (ref_cap between 1 and 100);
-- Daily scratch card: on/off, the prize list (one per line), the internal win chance,
-- the maximum surprise offers a customer can win in a week, and the messages for no-win days (one per line).
alter table public.businesses add column if not exists daily_on boolean not null default false;
alter table public.businesses add column if not exists daily_offers text not null default '';
alter table public.businesses add column if not exists daily_win_pct int not null default 60 check (daily_win_pct between 0 and 100);
alter table public.businesses add column if not exists daily_week_cap int not null default 2 check (daily_week_cap between 0 and 7);
alter table public.businesses add column if not exists daily_notes text not null default '';
-- Prizes: [{"text":"5% off your next order","chance":60}, {"text":"20% off","chance":10}]. chance = percent per scratch.
alter table public.businesses add column if not exists daily_prizes jsonb not null default '[]'::jsonb;
-- Weekdays a prize can drop on: ISO numbers, 1 = Monday ... 7 = Sunday, e.g. '2,4' for Tuesday and Thursday.
alter table public.businesses add column if not exists daily_days text not null default '1,2,3,4,5,6,7';
-- How many days a won coupon stays valid.
alter table public.businesses add column if not exists daily_valid_days int not null default 7;
-- Win-back: how long a customer is counted as lapsed (no visit), the offer in the WhatsApp message, and coupon validity.
alter table public.businesses add column if not exists lapsed_days int not null default 10 check (lapsed_days between 1 and 365);
alter table public.businesses add column if not exists winback_offer text not null default '';
alter table public.businesses add column if not exists winback_valid_days int not null default 7 check (winback_valid_days between 0 and 90);


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
  card_started_at timestamptz,
  bday_year int,
  consent boolean not null default true,
  joined timestamptz not null default now(),
  unique (business_id, user_id),
  unique (business_id, phone)
);
alter table public.members add column if not exists card_started_at timestamptz;
-- WhatsApp opt-out: set when the customer turns offers off themselves, or when the owner records a STOP reply.
alter table public.members add column if not exists wa_optout boolean not null default false;
alter table public.members add column if not exists wa_optout_at timestamptz;
alter table public.members add column if not exists ref_code text;
alter table public.members add column if not exists referred_by uuid references public.members(id) on delete set null;
alter table public.members add column if not exists ref_rewarded boolean not null default false;
-- Daily scratch card state per customer: when they last played and their current streak.
alter table public.members add column if not exists last_daily timestamptz;
alter table public.members add column if not exists daily_streak int not null default 0;
-- Earlier hand-run SQL named this column daily_date: carry its values over.
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'members' and column_name = 'daily_date') then
    update public.members m
       set last_daily = (m.daily_date::timestamp at time zone coalesce((select b.tz from public.businesses b where b.id = m.business_id), 'Asia/Kolkata')) + interval '12 hours'
     where m.last_daily is null and m.daily_date is not null;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'businesses_daily_days_chk') then
    alter table public.businesses add constraint businesses_daily_days_chk check (daily_days ~ '^[1-7](,[1-7]){0,6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'businesses_daily_valid_chk') then
    alter table public.businesses add constraint businesses_daily_valid_chk check (daily_valid_days between 1 and 90);
  end if;
end $$;

-- Carry the old plain prize list over: the old overall win chance is shared equally between the old prizes.
do $$
declare b record; items text[]; n int; per numeric;
begin
  for b in select id, daily_offers, daily_win_pct from public.businesses
            where daily_prizes = '[]'::jsonb and btrim(daily_offers) <> '' loop
    select array_agg(btrim(x)) into items
      from unnest(string_to_array(replace(b.daily_offers, E'\r', ''), E'\n')) x where btrim(x) <> '';
    n := coalesce(array_length(items, 1), 0);
    if n > 0 then
      per := round(greatest(b.daily_win_pct, 0)::numeric / n, 1);
      update public.businesses
         set daily_prizes = (select jsonb_agg(jsonb_build_object('text', left(i, 80), 'chance', per)) from unnest(items[1:12]) i)
       where id = b.id;
    end if;
  end loop;
end $$;

create unique index if not exists members_refcode_idx on public.members (business_id, ref_code);
create index if not exists members_business_idx on public.members (business_id);

-- Customers imported from a CSV (e.g. a paper stamp book). They are claimed when that phone number joins.
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null default '',
  phone text not null,
  bday date,
  stamps int not null default 0 check (stamps between 0 and 1000),
  total int not null default 0 check (total >= 0),
  redeemed int not null default 0 check (redeemed >= 0),
  unique (business_id, phone)
);
alter table public.imports enable row level security;
revoke all on public.imports from anon, authenticated;

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  type text not null,
  text text not null,
  code text not null,
  valid_from timestamptz,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.offers add column if not exists valid_from timestamptz;
create index if not exists offers_member_idx on public.offers (member_id);
create index if not exists offers_code_idx on public.offers (business_id, code);

-- Realtime: offer changes are pushed to the customer's app. (Also shipped as its own migration.)
do $$ begin
  alter publication supabase_realtime add table public.offers;
exception when duplicate_object then null; end $$;

create table if not exists public.visits (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists visits_business_idx on public.visits (business_id, created_at);

-- Win-back: a log of win-back messages sent, and whether the customer came back afterwards.
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  kind text not null default 'winback',
  created_at timestamptz not null default now(),
  returned_at timestamptz
);
create index if not exists messages_member_idx on public.messages (member_id, created_at desc);
create index if not exists messages_business_idx on public.messages (business_id, created_at desc);

-- ---------- Row level security ----------
-- Customers can read only their own rows. Owners can read only their business's rows.
-- Nobody writes to members/offers/visits directly: all writes go through the functions below.
alter table public.businesses enable row level security;
alter table public.members enable row level security;
alter table public.offers enable row level security;
alter table public.visits enable row level security;
alter table public.messages enable row level security;

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

drop policy if exists message_owner_select on public.messages;
create policy message_owner_select on public.messages for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

-- Table privileges: read-only for members/offers/visits; owners may edit only these business columns.
revoke all on public.businesses, public.members, public.offers, public.visits, public.messages from anon, authenticated;
grant select on public.businesses, public.members, public.offers, public.visits, public.messages to authenticated;
grant update (name, tagline, color, logo_url, stamp_url, ig, fb, wa, web, need, reward, cooldown_min,
              sur_stamps, sur_offer, welcome_offer, bday_offer, exp_days, join_stamp, card_months, scan_token,
              join_token, news_text, news_at, ref_on, ref_offer, ref_cap,
              daily_on, daily_offers, daily_win_pct, daily_week_cap, daily_notes,
              daily_prizes, daily_days, daily_valid_days,
              lapsed_days, winback_offer, winback_valid_days)
  on public.businesses to authenticated;

-- ---------- Functions ----------
-- Functions from earlier versions that no longer exist (customers no longer mark their own offers as used).
drop function if exists public.use_offer(uuid);
drop function if exists public.redeem_reward(text);
drop function if exists public._give(uuid, uuid, text, text, int);

-- Public branding for the customer page (never exposes the scan token or owner).
create or replace function public.get_business(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', name, 'tagline', tagline, 'color', color, 'logo_url', logo_url,
    'stamp_url', stamp_url,
    'ig', ig, 'fb', fb, 'wa', wa, 'web', web, 'need', need, 'reward', reward,
    'cooldown_min', cooldown_min, 'sur_stamps', sur_stamps, 'sur_offer', sur_offer,
    'welcome_offer', welcome_offer, 'bday_offer', bday_offer, 'exp_days', exp_days,
    'join_stamp', join_stamp, 'card_months', card_months, 'tz', tz,
    'news_text', news_text, 'news_at', news_at, 'ref_on', ref_on, 'ref_offer', ref_offer)
  from businesses where slug = p_slug;
$$;

-- Internal: a fresh 6-character coupon code (no look-alike letters), unique within the business.
create or replace function public._code(p_biz uuid) returns text
language plpgsql set search_path = public as $$
declare chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
    exit when not exists (select 1 from offers where business_id = p_biz and code = c);
  end loop;
  return c;
end $$;

-- Internal: hand a coupon to a member. Returns its code. valid_from / until are optional (used for birthdays).
create or replace function public._give(p_member uuid, p_biz uuid, p_type text, p_text text, p_days int,
                                        p_from timestamptz default null, p_until timestamptz default null)
returns text language plpgsql security definer set search_path = public as $$
declare c text := _code(p_biz);
begin
  insert into offers (member_id, business_id, type, text, code, valid_from, expires_at)
  values (p_member, p_biz, p_type, p_text, c, p_from,
          coalesce(p_until, case when p_days > 0 then now() + make_interval(days => p_days) end));
  return c;
end $$;

-- Internal: a unique friend code for a member (name prefix + 4 characters).
create or replace function public._refcode(p_member uuid) returns text
language plpgsql security definer set search_path = public as $$
declare chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; m members; c text; i int; pre text;
begin
  select * into m from members where id = p_member;
  if m.ref_code is not null then return m.ref_code; end if;
  pre := left(upper(regexp_replace(m.name, '[^A-Za-z]', '', 'g')), 4);
  loop
    c := pre || '-';
    for i in 1..4 loop c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
    exit when not exists (select 1 from members where business_id = m.business_id and ref_code = c);
  end loop;
  update members set ref_code = c where id = m.id;
  return c;
end $$;

-- Internal: the next date a birthday falls on, today or later (29 Feb becomes 28 Feb in non-leap years).
create or replace function public._next_bday(p_bday date, p_today date) returns date
language plpgsql immutable as $$
declare y int := extract(year from p_today)::int; mo int := extract(month from p_bday)::int;
        dd int := extract(day from p_bday)::int; d date; i int;
begin
  for i in 0..1 loop
    d := make_date(y + i, mo, least(dd, extract(day from (make_date(y + i, mo, 1) + interval '1 month' - interval '1 day'))::int));
    if d >= p_today then return d; end if;
  end loop;
  return d;
end $$;

-- Internal: if the member's unfinished card is older than the business's card validity, wipe its stamps.
-- Returns how many stamps were lost (0 if nothing expired). A full card (ready to claim) never expires.
create or replace function public._expire_card(p_member uuid) returns int
language plpgsql security definer set search_path = public as $$
declare m members; b businesses;
begin
  select * into m from members where id = p_member;
  select * into b from businesses where id = m.business_id;
  if b.card_months > 0 and m.card_started_at is not null and m.stamps > 0 and m.stamps < b.need
     and now() > m.card_started_at + make_interval(months => b.card_months) then
    update members set stamps = 0, card_started_at = null where id = m.id;
    return m.stamps;
  end if;
  return 0;
end $$;

-- Internal: add one stamp (no cooldown check), start the card clock on the first stamp, give the surprise offer if due.
-- Also marks a recent win-back message as "came back".
create or replace function public._do_stamp(p_member uuid) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; m members; pos int; surprise text := null; lost int; need_visits int;
begin
  select * into m from members where id = p_member;
  select * into b from businesses where id = m.business_id;
  lost := _expire_card(m.id);
  update members set stamps = stamps + 1, total = total + 1, last_stamp = now(),
         card_started_at = coalesce(card_started_at, now())
   where id = m.id returning * into m;
  insert into visits (member_id, business_id) values (m.id, b.id);
  -- Referral reward for whoever invited this member: only once the friend has really visited (a stamp after the sign-up one).
  need_visits := (case when b.join_stamp then 2 else 1 end);
  if b.ref_on and m.referred_by is not null and not m.ref_rewarded and m.total >= need_visits then
    update members set ref_rewarded = true where id = m.id;
    if (select count(*) from offers where member_id = m.referred_by and type = 'Referral reward' and created_at > now() - interval '30 days') < b.ref_cap then
      perform _give(m.referred_by, b.id, 'Referral reward', b.ref_offer, b.exp_days);
    end if;
  end if;
  update messages set returned_at = now()
   where member_id = m.id and returned_at is null and created_at > now() - interval '30 days';
  pos := (m.stamps - 1) % b.need + 1;
  if b.sur_offer <> '' and exists (
       select 1 from unnest(string_to_array(regexp_replace(b.sur_stamps, '\s', '', 'g'), ',')) s
       where s ~ '^[0-9]+$' and s::int = pos) then
    perform _give(m.id, b.id, 'Surprise', b.sur_offer, b.exp_days);
    surprise := b.sur_offer;
  end if;
  return json_build_object('stamps', m.stamps, 'surprise', surprise, 'lost', lost);
end $$;

-- Owner taps "Message" on a lapsed customer: creates the coupon, logs the message, returns what the app needs.
create or replace function public.winback_message(p_slug text, p_member uuid) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; m members; c text; oid uuid; ex timestamptz; recent timestamptz;
begin
  select * into b from businesses where slug = p_slug and owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  select * into m from members where id = p_member and business_id = b.id for update;
  if not found then raise exception 'Customer not found'; end if;
  if coalesce(b.winback_offer, '') = '' then
    return json_build_object('ok', false, 'error', 'nooffer');
  end if;
  if coalesce(m.last_stamp, m.joined) > now() - make_interval(days => b.lapsed_days) then
    return json_build_object('ok', false, 'error', 'notlapsed');
  end if;
  select max(created_at) into recent from messages where member_id = m.id and kind = 'winback';
  if recent is not null and recent > now() - interval '14 days' then
    return json_build_object('ok', false, 'error', 'recent', 'sent_at', recent);
  end if;
  c := _give(m.id, b.id, 'Win-back', b.winback_offer, b.winback_valid_days);
  select id, expires_at into oid, ex from offers where business_id = b.id and code = c order by created_at desc limit 1;
  insert into messages (business_id, member_id, offer_id, kind) values (b.id, m.id, oid, 'winback');
  return json_build_object('ok', true, 'code', c, 'expires_at', ex, 'offer', b.winback_offer,
                           'name', m.name, 'phone', m.phone);
end $$;

-- Create the member row for the signed-in customer, give the welcome offer and (if switched on) the first stamp.
drop function if exists public.join_business(text, text, text, date, boolean);
drop function if exists public.join_business(text, text, text, date, boolean, text);
create or replace function public.join_business(p_slug text, p_name text, p_phone text, p_bday date, p_consent boolean, p_join_token text default null, p_ref text default null)
returns void language plpgsql security definer set search_path = public as $$
declare b businesses; m uuid; im imports; claimed boolean := false; rf uuid := null; rc text := upper(trim(coalesce(p_ref, '')));
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not coalesce(p_consent, false) then raise exception 'Consent is required to join'; end if;
  select * into b from businesses where slug = p_slug;
  if not found then raise exception 'Unknown business'; end if;
  if coalesce(p_join_token, '') = '' or p_join_token not in (b.join_token, b.scan_token) then raise exception 'Please scan the sign-up QR code at the counter to join'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Please enter your full name'; end if;
  if coalesce(p_phone, '') !~ '^[0-9]{10}$' then raise exception 'Enter a valid 10-digit mobile number'; end if;
  if b.ref_on and rc <> '' then
    select id into rf from members where business_id = b.id and ref_code = rc and phone <> p_phone;
    if rf is null then raise exception 'That friend code was not found'; end if;
  end if;
  insert into members (business_id, user_id, name, phone, bday, consent, referred_by)
  values (b.id, auth.uid(), trim(p_name), p_phone, p_bday, true, rf)
  returning id into m;
  perform _refcode(m);
  if rf is not null then perform _give(m, b.id, 'Referral', b.ref_offer, b.exp_days); end if;
  select * into im from imports where business_id = b.id and phone = p_phone;
  if found then
    claimed := true;
    update members set stamps = im.stamps, total = greatest(im.total, im.stamps), redeemed = im.redeemed,
           card_started_at = case when im.stamps > 0 then now() end, bday = coalesce(bday, im.bday) where id = m;
    delete from imports where id = im.id;
  end if;
  if b.welcome_offer <> '' then perform _give(m, b.id, 'Welcome', b.welcome_offer, b.exp_days); end if;
  if b.join_stamp and not claimed then perform _do_stamp(m); end if;
end $$;

-- The customer's card: stats, coupons and card validity. Also reserves the birthday coupon (valid only on the birthday).
create or replace function public.my_card(p_slug text) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; m members; today date; nb date; lost int; granted boolean := false; ends timestamptz;
begin
  if auth.uid() is null then return null; end if;
  select * into b from businesses where slug = p_slug;
  if not found then return null; end if;
  select * into m from members where business_id = b.id and user_id = auth.uid();
  if not found then return null; end if;
  lost := _expire_card(m.id);
  select * into m from members where id = m.id;
  today := (now() at time zone b.tz)::date;
  if b.bday_offer <> '' and m.bday is not null then
    nb := _next_bday(m.bday, today);
    if nb - today <= 7 and coalesce(m.bday_year, 0) <> extract(year from nb)::int and m.joined < now() - interval '14 days' then
      -- Reserved up to 7 days ahead, but only usable from the start to the end of the birthday itself.
      perform _give(m.id, b.id, 'Birthday', b.bday_offer, 0,
                    nb::timestamp at time zone b.tz, (nb + 1)::timestamp at time zone b.tz);
      update members set bday_year = extract(year from nb)::int where id = m.id;
      granted := true;
    end if;
  end if;
  if b.card_months > 0 and m.card_started_at is not null and m.stamps < b.need then
    ends := m.card_started_at + make_interval(months => b.card_months);
  end if;
  return json_build_object(
    'granted', granted, 'lost', lost,
    'member', json_build_object('name', m.name, 'phone', m.phone, 'bday', m.bday,
              'stamps', m.stamps, 'total', m.total, 'redeemed', m.redeemed, 'last_stamp', m.last_stamp,
              'card_started_at', m.card_started_at, 'card_ends_at', ends, 'wa_optout', m.wa_optout,
              'ref_code', _refcode(m.id), 'ref_count', (select count(*) from members x where x.referred_by = m.id)),
    'offers', coalesce((select json_agg(json_build_object(
                'id', o.id, 'type', o.type, 'text', o.text, 'valid_from', o.valid_from,
                'expires_at', o.expires_at, 'used_at', o.used_at,
                -- the code is only shown while the coupon can actually be used
                'code', case when o.used_at is null
                              and (o.valid_from is null or o.valid_from <= now())
                              and (o.expires_at is null or o.expires_at > now()) then o.code end)
                order by o.created_at desc)
              from offers o where o.member_id = m.id), '[]'::json));
end $$;

-- ---------- 2. Guard: an owner can never save a prize list that would break the game ----------
create or replace function public._daily_guard() returns trigger
language plpgsql set search_path = public as $$
declare e jsonb; tot numeric := 0;
begin
  if jsonb_typeof(new.daily_prizes) is distinct from 'array' then raise exception 'Prizes must be a list'; end if;
  if jsonb_array_length(new.daily_prizes) > 12 then raise exception 'At most 12 prizes'; end if;
  for e in select value from jsonb_array_elements(new.daily_prizes) loop
    if jsonb_typeof(e) is distinct from 'object'
       or jsonb_typeof(e->'text') is distinct from 'string'
       or jsonb_typeof(e->'chance') is distinct from 'number'
       or length(btrim(e->>'text')) not between 1 and 80
       or (e->>'chance')::numeric not between 0 and 100 then
      raise exception 'Each prize needs a name (up to 80 characters) and a chance from 0 to 100';
    end if;
    tot := tot + (e->>'chance')::numeric;
  end loop;
  if tot > 100.0001 then raise exception 'Prize chances add up to more than 100%%'; end if;
  return new;
end $$;
drop trigger if exists businesses_daily_guard on public.businesses;
create trigger businesses_daily_guard before insert or update of daily_prizes on public.businesses
  for each row execute function public._daily_guard();

-- ---------- 3. Game functions ----------
-- Internal: '2,4' -> {2,4}. Anything that is not 1-7 is ignored.
create or replace function public._daily_days(p text) returns int[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct d::int order by d::int), '{}'::int[])
    from unnest(string_to_array(coalesce(p, ''), ',')) d where d ~ '^[1-7]$';
$$;

-- Public (no login): is the daily scratch card switched on? Used by the first-visit intro.
create or replace function public.daily_public(p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(daily_on, false) from businesses where slug = p_slug;
$$;

-- For a signed-in customer: the card state.
-- {on, cap, days:[ISO weekdays prizes can drop on], win_day:(is today one?), wins_week, played, streak, next_at}
create or replace function public.daily_status(p_slug text) returns json
language plpgsql stable security definer set search_path = public as $$
declare b businesses; m members; today date; days int[]; wins int := 0; played boolean := false; streak int := 0;
begin
  if auth.uid() is null then
    return json_build_object('on', false, 'cap', 0, 'days', '[]'::json, 'win_day', false, 'wins_week', 0, 'played', false, 'streak', 0, 'next_at', null);
  end if;
  select * into b from businesses where slug = p_slug;
  if not found then
    return json_build_object('on', false, 'cap', 0, 'days', '[]'::json, 'win_day', false, 'wins_week', 0, 'played', false, 'streak', 0, 'next_at', null);
  end if;
  today := (now() at time zone b.tz)::date;
  days := _daily_days(b.daily_days);
  select * into m from members where business_id = b.id and user_id = auth.uid();
  if found then
    select count(*) into wins from offers
     where member_id = m.id and type = 'Daily'
       and created_at >= (date_trunc('week', today::timestamp) at time zone b.tz);
    if m.last_daily is not null then
      played := (m.last_daily at time zone b.tz)::date = today;
      if (m.last_daily at time zone b.tz)::date >= today - 1 then streak := m.daily_streak; end if;
    end if;
  end if;
  return json_build_object(
    'on', b.daily_on, 'cap', b.daily_week_cap,
    'days', to_json(days), 'win_day', extract(isodow from today)::int = any(days), 'wins_week', wins,
    'played', played, 'streak', streak,
    'next_at', case when played then ((today + 1)::timestamp at time zone b.tz) end);
end $$;

-- Scratch the card (once per day, every day). The streak grows on consecutive days.
-- A prize can only drop on one of the owner's chosen weekdays, and only while the customer has won
-- fewer than the weekly cap this Monday-Sunday week. On such a day each prize has its own chance per
-- scratch (the chances add up to at most 100, the remainder is "no win"). Otherwise a message is shown.
-- Returned: {ok, win, prize, code, note, win_day, streak, next_at} or {ok:false, error:'done'|'off'|'auth', next_at}
create or replace function public.play_daily(p_slug text) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; m members; today date; days int[]; win_day boolean; wins int; streak int;
        roll float8; acc float8 := 0; e jsonb; prize text := null; c text := null; note text := null; nxt timestamptz;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  select * into b from businesses where slug = p_slug;
  if not found or not b.daily_on then return json_build_object('ok', false, 'error', 'off', 'next_at', null); end if;
  select * into m from members where business_id = b.id and user_id = auth.uid() for update;
  if not found then return json_build_object('ok', false, 'error', 'auth'); end if;
  today := (now() at time zone b.tz)::date;
  nxt := ((today + 1)::timestamp at time zone b.tz);
  if m.last_daily is not null and (m.last_daily at time zone b.tz)::date = today then
    return json_build_object('ok', false, 'error', 'done', 'next_at', nxt);
  end if;

  if m.last_daily is not null and (m.last_daily at time zone b.tz)::date = today - 1 then
    streak := m.daily_streak + 1;
  else
    streak := 1;
  end if;
  update members set last_daily = now(), daily_streak = streak where id = m.id;

  days := _daily_days(b.daily_days);
  win_day := extract(isodow from today)::int = any(days);
  select count(*) into wins from offers
   where member_id = m.id and type = 'Daily'
     and created_at >= (date_trunc('week', today::timestamp) at time zone b.tz);

  if win_day and wins < b.daily_week_cap and jsonb_typeof(b.daily_prizes) = 'array' then
    roll := random() * 100;
    for e in select value from jsonb_array_elements(b.daily_prizes) loop
      acc := acc + coalesce((e->>'chance')::float8, 0);
      if roll < acc then prize := btrim(e->>'text'); exit; end if;
    end loop;
    if coalesce(prize, '') <> '' then
      c := _give(m.id, b.id, 'Daily', prize, b.daily_valid_days);
    else
      prize := null;
    end if;
  end if;

  if c is null then
    note := (select trim(x) from (select unnest(string_to_array(replace(b.daily_notes, E'\r', ''), E'\n')) x) t
              where trim(x) <> '' order by random() limit 1);
  end if;
  return json_build_object('ok', true, 'win', c is not null, 'prize', prize, 'code', c, 'note', note,
                           'win_day', win_day, 'streak', streak, 'next_at', nxt);
end $$;


-- Add one stamp (needs the secret scan token from the QR / NFC link). Enforces the cooldown.
create or replace function public.add_stamp(p_slug text, p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; m members; wait int; r json;
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
  r := _do_stamp(m.id);
  return json_build_object('ok', true, 'stamps', r->'stamps', 'surprise', r->'surprise', 'lost', r->'lost');
end $$;

-- Turn a full card into a Reward coupon (the code is then redeemed by staff like any other coupon).
create or replace function public.claim_reward(p_slug text) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; m members; c text; rest int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into b from businesses where slug = p_slug;
  select * into m from members where business_id = b.id and user_id = auth.uid() for update;
  if not found or m.stamps < b.need then raise exception 'Your card is not full yet'; end if;
  rest := m.stamps - b.need;
  update members set stamps = rest, redeemed = redeemed + 1,
         card_started_at = case when rest > 0 then now() else null end
   where id = m.id;
  c := _give(m.id, b.id, 'Reward', b.reward, b.exp_days);
  return json_build_object('code', c);
end $$;

-- Owner / staff redeem a coupon: type the code (and optionally the customer's phone).
-- p_confirm = false only checks it; p_confirm = true marks it used. All rules are enforced here on the server.
create or replace function public.redeem_code(p_slug text, p_code text, p_phone text, p_confirm boolean)
returns json language plpgsql security definer set search_path = public as $$
declare b businesses; x offers; m members; c text; ph text;
begin
  select * into b from businesses where slug = p_slug and owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  c := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  ph := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  if c = '' then return json_build_object('ok', false, 'error', 'nocode'); end if;
  select o.* into x from offers o join members mm on mm.id = o.member_id
   where o.business_id = b.id and o.code = c and (ph = '' or mm.phone = ph)
   order by (o.used_at is null) desc, o.created_at desc limit 1 for update of o;
  if not found then
    if ph <> '' and exists (select 1 from offers where business_id = b.id and code = c) then
      return json_build_object('ok', false, 'error', 'phone');
    end if;
    return json_build_object('ok', false, 'error', 'notfound');
  end if;
  select * into m from members where id = x.member_id;
  if x.used_at is not null then
    return json_build_object('ok', false, 'error', 'used', 'offer', json_build_object('type', x.type, 'text', x.text,
      'name', m.name, 'phone', m.phone, 'code', x.code, 'used_at', x.used_at));
  end if;
  if x.expires_at is not null and x.expires_at <= now() then
    return json_build_object('ok', false, 'error', 'expired', 'offer', json_build_object('type', x.type, 'text', x.text,
      'name', m.name, 'phone', m.phone, 'code', x.code, 'expires_at', x.expires_at));
  end if;
  if x.valid_from is not null and x.valid_from > now() then
    return json_build_object('ok', false, 'error', 'early', 'offer', json_build_object('type', x.type, 'text', x.text,
      'name', m.name, 'phone', m.phone, 'code', x.code, 'valid_from', x.valid_from));
  end if;
  if coalesce(p_confirm, false) then
    update offers set used_at = now() where id = x.id;
    x.used_at := now();
  end if;
  return json_build_object('ok', true, 'confirmed', coalesce(p_confirm, false), 'offer', json_build_object(
    'type', x.type, 'text', x.text, 'name', m.name, 'phone', m.phone, 'code', x.code,
    'valid_from', x.valid_from, 'expires_at', x.expires_at, 'used_at', x.used_at));
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

-- Owner sets a temporary password for a customer who forgot theirs (customers have no real email to reset by).
create or replace function public.reset_member_password(p_member uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
declare uid uuid;
begin
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  select m.user_id into uid from members m join businesses b on b.id = m.business_id
   where m.id = p_member and b.owner_id = auth.uid();
  if uid is null then raise exception 'Not allowed'; end if;
  if exists (select 1 from businesses where owner_id = uid) then raise exception 'Not allowed'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = uid;
end $$;

-- Owner imports customers from a CSV. p_rows: [{name, phone, bday, stamps, total, redeemed}]. Existing members are skipped.
create or replace function public.import_members(p_slug text, p_rows json) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; r json; ph text; added int := 0; skipped int := 0; bd date;
begin
  select * into b from businesses where slug = p_slug and owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  if json_array_length(p_rows) > 1000 then raise exception 'Import at most 1000 rows at a time'; end if;
  for r in select * from json_array_elements(p_rows) loop
    ph := coalesce(r->>'phone', '');
    if ph !~ '^[0-9]{10}$' or exists (select 1 from members where business_id = b.id and phone = ph) then skipped := skipped + 1; continue; end if;
    begin bd := nullif(r->>'bday', '')::date; exception when others then bd := null; end;
    insert into imports (business_id, name, phone, bday, stamps, total, redeemed)
    values (b.id, left(coalesce(r->>'name', ''), 100), ph, bd,
            least(greatest(coalesce(nullif(r->>'stamps', '')::int, 0), 0), 1000),
            least(greatest(coalesce(nullif(r->>'total', '')::int, 0), 0), 100000),
            least(greatest(coalesce(nullif(r->>'redeemed', '')::int, 0), 0), 100000))
    on conflict (business_id, phone) do update set name = excluded.name, bday = excluded.bday,
      stamps = excluded.stamps, total = excluded.total, redeemed = excluded.redeemed;
    added := added + 1;
  end loop;
  return json_build_object('added', added, 'skipped', skipped);
end $$;

-- Owner records that a customer replied STOP (or asked to hear from them again).
create or replace function public.set_wa_optout(p_member uuid, p_optout boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update members m set wa_optout = coalesce(p_optout, false),
         wa_optout_at = case when coalesce(p_optout, false) then now() end
   where m.id = p_member and exists (select 1 from businesses b where b.id = m.business_id and b.owner_id = auth.uid());
  if not found then raise exception 'Not allowed'; end if;
end $$;

-- Customer turns WhatsApp offers on or off for themselves.
create or replace function public.set_my_wa_optout(p_slug text, p_optout boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  update members m set wa_optout = coalesce(p_optout, false),
         wa_optout_at = case when coalesce(p_optout, false) then now() end
   where m.user_id = auth.uid() and m.business_id = (select id from businesses where slug = p_slug);
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
grant execute on function public.daily_public(text) to anon, authenticated;
grant execute on function public.daily_status(text) to authenticated;
grant execute on function public.play_daily(text) to authenticated;
grant execute on function public.join_business(text, text, text, date, boolean, text, text) to authenticated;
grant execute on function public.import_members(text, json) to authenticated;
grant execute on function public.my_card(text) to authenticated;
grant execute on function public.add_stamp(text, text) to authenticated;
grant execute on function public.claim_reward(text) to authenticated;
grant execute on function public.redeem_code(text, text, text, boolean) to authenticated;
grant execute on function public.delete_member(uuid) to authenticated;
grant execute on function public.delete_me() to authenticated;
grant execute on function public.reset_member_password(uuid, text) to authenticated;
grant execute on function public.set_wa_optout(uuid, boolean) to authenticated;
grant execute on function public.set_my_wa_optout(text, boolean) to authenticated;
grant execute on function public.winback_message(text, uuid) to authenticated;

-- ---------- Image storage (logos and stamp images) ----------
-- A public bucket "brand": anyone can view the images, only the business owner can write inside their own folder
-- (<business id>/<file>). Max 2 MB per image; PNG, JPG, WebP or GIF only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

drop policy if exists brand_owner_insert on storage.objects;
create policy brand_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand' and exists (
    select 1 from public.businesses b where b.owner_id = auth.uid() and b.id::text = (storage.foldername(name))[1]));
drop policy if exists brand_owner_update on storage.objects;
create policy brand_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'brand' and exists (
    select 1 from public.businesses b where b.owner_id = auth.uid() and b.id::text = (storage.foldername(name))[1]));
drop policy if exists brand_owner_delete on storage.objects;
create policy brand_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand' and exists (
    select 1 from public.businesses b where b.owner_id = auth.uid() and b.id::text = (storage.foldername(name))[1]));
