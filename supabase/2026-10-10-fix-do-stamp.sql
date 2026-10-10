-- Remove the reference to the non-existent "messages" table. Stamps were failing for everyone.create or replace function public._do_stamp(p_member uuid) returns json
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
  need_visits := (case when b.join_stamp then 2 else 1 end);
  if b.ref_on and m.referred_by is not null and not m.ref_rewarded and m.total >= need_visits then
    update members set ref_rewarded = true where id = m.id;
    if (select count(*) from offers where member_id = m.referred_by and type = 'Referral reward' and created_at > now() - interval '30 days') < b.ref_cap then
      perform _give(m.referred_by, b.id, 'Referral reward', b.ref_offer, b.exp_days);
    end if;
  end if;
  pos := (m.stamps - 1) % b.need + 1;
  if b.sur_offer <> '' and exists (
       select 1 from unnest(string_to_array(regexp_replace(b.sur_stamps, '\s', '', 'g'), ',')) s
       where s ~ '^[0-9]+$' and s::int = pos) then
    perform _give(m.id, b.id, 'Surprise', b.sur_offer, b.exp_days);
    surprise := b.sur_offer;
  end if;
  return json_build_object('stamps', m.stamps, 'surprise', surprise, 'lost', lost);
end $$;