-- Daily scratch "gamble" system. Safe to run more than once, whatever state the database is in.
--   * the owner picks the prizes AND the chance of each one (per scratch),
--   * the owner picks the weekdays on which a prize can drop,
--   * the owner picks the maximum prizes one customer can win per week (Monday to Sunday),
--   * every customer can still scratch every single day: other days show a message.
-- Supabase dashboard -> SQL Editor -> New query -> paste -> Run.

-- ---------- 0. Make the database match the app ----------
-- The app reads members.last_daily. Hand-run SQL from earlier today named it daily_date; carry those values over.
alter table public.members add column if not exists last_daily timestamptz;
alter table public.members add column if not exists daily_streak int not null default 0;
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'members' and column_name = 'daily_date') then
    update public.members m
       set last_daily = (m.daily_date::timestamp at time zone coalesce((select b.tz from public.businesses b where b.id = m.business_id), 'Asia/Kolkata')) + interval '12 hours'
     where m.last_daily is null and m.daily_date is not null;
  end if;
end $$;

-- ---------- 1. New settings ----------
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

grant update (daily_on, daily_offers, daily_win_pct, daily_week_cap, daily_notes, daily_prizes, daily_days, daily_valid_days)
  on public.businesses to authenticated;

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

-- ---------- 4. Who may call what ----------
revoke execute on function public._daily_days(text), public._daily_guard(),
                           public.daily_public(text), public.daily_status(text), public.play_daily(text)
  from public, anon, authenticated;
grant execute on function public.daily_public(text) to anon, authenticated;
grant execute on function public.daily_status(text) to authenticated;
grant execute on function public.play_daily(text) to authenticated;
