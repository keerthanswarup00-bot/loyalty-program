-- Win-back: lapsed-customer list, one-tap WhatsApp message with a unique coupon, return tracking.
-- Safe to run more than once.


-- Settings
alter table public.businesses add column if not exists lapsed_days int not null default 10 check (lapsed_days between 1 and 365);
alter table public.businesses add column if not exists winback_offer text not null default '';
alter table public.businesses add column if not exists winback_valid_days int not null default 7 check (winback_valid_days between 0 and 90);


-- Owners may edit only these business columns (new ones added to the list).
revoke update on public.businesses from anon, authenticated;
grant update (name, tagline, color, logo_url, stamp_url, ig, fb, wa, web, need, reward, cooldown_min,
              sur_stamps, sur_offer, welcome_offer, bday_offer, exp_days, join_stamp, card_months, scan_token,
              lapsed_days, winback_offer, winback_valid_days)
  on public.businesses to authenticated;


-- Log of messages sent to customers
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


alter table public.messages enable row level security;
drop policy if exists message_owner_select on public.messages;
create policy message_owner_select on public.messages for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;


-- Stamping now also marks a recent win-back message as "came back".
create or replace function public._do_stamp(p_member uuid) returns json
language plpgsql security definer set search_path = public as $$
declare b businesses; m members; pos int; surprise text := null; lost int;
begin
  select * into m from members where id = p_member;
  select * into b from businesses where id = m.business_id;
  lost := _expire_card(m.id);
  update members set stamps = stamps + 1, total = total + 1, last_stamp = now(),
         card_started_at = coalesce(card_started_at, now())
   where id = m.id returning * into m;
  insert into visits (member_id, business_id) values (m.id, b.id);
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


revoke execute on function public.winback_message(text, uuid) from public, anon, authenticated;
grant execute on function public.winback_message(text, uuid) to authenticated;