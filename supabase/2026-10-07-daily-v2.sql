-- Daily scratch card v2: weekly wins cap, play streaks and a no-win message list.
-- Idempotent: safe to re-run. Builds on the daily_* columns/functions from the first
-- daily scratch release (daily_on, daily_win_pct, daily_offers, daily_status, play_daily, daily_public).
-- The win chance is still rolled against daily_win_pct; the owner page now edits the weekly cap instead.

-- Weekly cap of surprise offers per customer (0 = never win, they only ever see messages).
alter table public.businesses add column if not exists daily_week_cap int not null default 2 check (daily_week_cap between 0 and 7);
-- One no-win message per line, picked at random when the customer does not win.
alter table public.businesses add column if not exists daily_notes text not null default '';

-- Per-member daily scratch state (played today is derived from last_daily in the business timezone).
alter table public.members add column if not exists last_daily timestamptz;
alter table public.members add column if not exists daily_streak int not null default 0;

-- Public (no login): is the daily scratch card switched on? Used by the first-visit intro.
drop function if exists public.daily_public(text);
create or replace function public.daily_public(p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(daily_on, false) from businesses where slug = p_slug;
$$;

-- For a signed-in customer: card state + today's status. {on, cap, played, streak, next_at}
drop function if exists public.daily_status(text);
create or replace function public.daily_status(p_slug text) returns json
language plpgsql stable security definer set search_path = public as $$
declare b businesses; m members; today date;
begin
  if auth.uid() is null then
    return json_build_object('on', false, 'cap', 0, 'played', false, 'streak', 0, 'next_at', null);
  end if;
  select * into b from businesses where slug = p_slug;
  if not found then
    return json_build_object('on', false, 'cap', 0, 'played', false, 'streak', 0, 'next_at', null);
  end if;
  today := (now() at time zone b.tz)::date;
  select * into m from members where business_id = b.id and user_id = auth.uid();
  if not found then
    return json_build_object('on', b.daily_on, 'cap', b.daily_week_cap, 'played', false, 'streak', 0, 'next_at', null);
  end if;
  return json_build_object(
    'on', b.daily_on, 'cap', b.daily_week_cap,
    'played', m.last_daily is not null and (m.last_daily at time zone b.tz)::date = today,
    'streak', m.daily_streak,
    'next_at', case when m.last_daily is not null and (m.last_daily at time zone b.tz)::date = today
                    then ((today + 1)::timestamp at time zone b.tz) end);
end $$;

-- Scratch the card once per day. The streak grows on consecutive days played. A win hands over one
-- prize from daily_offers as a 'Daily' coupon (valid 7 days); otherwise a message from daily_notes.
-- Returned: {ok, win, prize, code, note, streak, next_at} or {ok:false, error:'done'|'off', next_at}
drop function if exists public.play_daily(text);
create or replace function public.play_daily(p_slug text) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; m members; today date; streak int; wins int; prize text; note text; c text; nxt timestamptz;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'auth'); end if;
  select * into b from businesses where slug = p_slug;
  if not found or not b.daily_on then return json_build_object('ok', false, 'error', 'off', 'next_at', null); end if;
  select * into m from members where business_id = b.id and user_id = auth.uid() for update;
  if not found then return json_build_object('ok', false, 'error', 'auth'); end if;
  today := (now() at time zone b.tz)::date;
  if m.last_daily is not null and (m.last_daily at time zone b.tz)::date = today then
    nxt := ((today + 1)::timestamp at time zone b.tz);
    return json_build_object('ok', false, 'error', 'done', 'next_at', nxt);
  end if;
  -- Streak: +1 when yesterday was played, otherwise a fresh streak of 1.
  if m.last_daily is not null and (m.last_daily at time zone b.tz)::date = today - 1 then
    streak := m.daily_streak + 1;
  else
    streak := 1;
  end if;
  update members set last_daily = now(), daily_streak = streak where id = m.id;

  wins := (select count(*) from offers where member_id = m.id and type = 'Daily' and created_at > now() - interval '7 days');
  prize := null; note := null; c := null;
  if wins < b.daily_week_cap and b.daily_win_pct > 0 and random() * 100 < b.daily_win_pct then
    prize := (select trim(x) from (select unnest(string_to_array(b.daily_offers, E'\n')) x) t where trim(x) <> '' order by random() limit 1);
    if prize is not null then c := _give(m.id, b.id, 'Daily', prize, 7); end if;
  end if;
  if c is null then
    note := (select trim(x) from (select unnest(string_to_array(b.daily_notes, E'\n')) x) t where trim(x) <> '' order by random() limit 1);
    note := coalesce(note, 'Better luck tomorrow!');
  end if;
  nxt := ((today + 1)::timestamp at time zone b.tz);
  return json_build_object('ok', true, 'win', c is not null, 'prize', prize, 'code', c, 'note', note, 'streak', streak, 'next_at', nxt);
end $$;

-- Who may call what (and the owner needs update on the new daily columns).
revoke all on function public.daily_public(text), public.daily_status(text), public.play_daily(text) from public, anon, authenticated;
grant execute on function public.daily_public(text) to anon, authenticated;
grant execute on function public.daily_status(text) to authenticated;
grant execute on function public.play_daily(text) to authenticated;
grant update (daily_on, daily_win_pct, daily_offers, daily_week_cap, daily_notes) on public.businesses to authenticated;