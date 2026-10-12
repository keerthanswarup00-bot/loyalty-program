-- Owner analytics (read-only). Safe to re-run. Also included at the end of schema.sql.
-- One function returns everything the Insights tab draws, computed in the business's own time zone.
-- Only the business owner can call it (same check as every other owner function).

create or replace function public.analytics(p_slug text, p_days int default 90) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  b businesses; d int; since timestamptz;
  daily json; weekly json; hours json; ret json; cohorts json; coupons json; wb json; tot json;
begin
  select * into b from businesses where slug = p_slug and owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  d := greatest(7, least(coalesce(p_days, 90), 365));
  since := now() - make_interval(days => d);

  -- Stamps per local day and per local week (weeks start on Monday).
  select coalesce(json_agg(json_build_object('d', k, 'n', n) order by k), '[]'::json) into daily
    from (select to_char(created_at at time zone b.tz, 'YYYY-MM-DD') k, count(*) n
            from visits where business_id = b.id and created_at >= since group by 1) x;
  select coalesce(json_agg(json_build_object('d', k, 'n', n) order by k), '[]'::json) into weekly
    from (select to_char(date_trunc('week', created_at at time zone b.tz), 'YYYY-MM-DD') k, count(*) n
            from visits where business_id = b.id and created_at >= since group by 1) x;

  -- Busiest times: weekday (1 = Monday ... 7 = Sunday) x hour (0-23), local time.
  select coalesce(json_agg(json_build_array(dow, hr, n)), '[]'::json) into hours
    from (select extract(isodow from created_at at time zone b.tz)::int dow,
                 extract(hour from created_at at time zone b.tz)::int hr, count(*) n
            from visits where business_id = b.id and created_at >= since group by 1, 2) x;

  -- Retention. "Came back" = a stamp more than an hour after joining (so the sign-up stamp does not count),
  -- within 30 days of joining. Only members who joined 30+ days ago are counted, so nobody is judged too early.
  select json_build_object(
           'members', (select count(*) from members where business_id = b.id),
           'mature', count(*),
           'back30', count(*) filter (where back30),
           'repeat', (select count(*) from members where business_id = b.id and total >= 2),
           'active30', (select count(*) from members where business_id = b.id and last_stamp >= now() - interval '30 days'))
    into ret
    from (select exists (select 1 from visits v where v.member_id = m.id
                          and v.created_at > m.joined + interval '1 hour'
                          and v.created_at <= m.joined + interval '30 days') back30
            from members m where m.business_id = b.id and m.joined <= now() - interval '30 days') x;

  -- Join-month cohorts (last 6 months): how many joined, how many of them came back within 30 days.
  select coalesce(json_agg(json_build_object('m', k, 'joined', n, 'back', back, 'mature', mature) order by k), '[]'::json) into cohorts
    from (select to_char(date_trunc('month', m.joined at time zone b.tz), 'YYYY-MM') k, count(*) n,
                 count(*) filter (where exists (select 1 from visits v where v.member_id = m.id
                          and v.created_at > m.joined + interval '1 hour'
                          and v.created_at <= m.joined + interval '30 days')) back,
                 bool_and(m.joined <= now() - interval '30 days') mature
            from members m
           where m.business_id = b.id and m.joined >= date_trunc('month', now() - interval '5 months')
           group by 1) x;

  -- Coupons by type, for coupons created in the window: issued, redeemed, expired unused, still open.
  select coalesce(json_agg(json_build_object('type', type, 'issued', n, 'redeemed', used, 'expired', exp, 'open', n - used - exp) order by n desc), '[]'::json) into coupons
    from (select type, count(*) n, count(*) filter (where used_at is not null) used,
                 count(*) filter (where used_at is null and expires_at is not null and expires_at < now()) exp
            from offers where business_id = b.id and created_at >= since group by type) x;

  -- Win-back: messages made in the window, how many customers stamped within 30 days afterwards,
  -- and how many of the win-back coupons were actually redeemed.
  select json_build_object(
           'sent', count(*),
           'returned', count(*) filter (where m.returned_at is not null),
           'redeemed', count(*) filter (where o.used_at is not null))
    into wb
    from messages m left join offers o on o.id = m.offer_id
   where m.business_id = b.id and m.kind = 'winback' and m.created_at >= since;

  select json_build_object(
           'stamps', count(*),
           'people', count(distinct member_id))
    into tot from visits where business_id = b.id and created_at >= since;

  return json_build_object('days', d, 'tz', b.tz, 'daily', daily, 'weekly', weekly, 'hours', hours,
                           'retention', ret, 'cohorts', cohorts, 'coupons', coupons, 'winback', wb, 'totals', tot);
end $$;

revoke execute on function public.analytics(text, int) from public, anon, authenticated;
grant execute on function public.analytics(text, int) to authenticated;
