-- NFC tag can now also be the join token: a brand-new customer signs up by tapping the stamp tag,
-- and their tap becomes the free first stamp (join_stamp) instead of a second one.
-- Base for this file: the LIVE definition of public.join_business (not schema.sql, which has drifted).
-- Only the token check changed: accept the scan token (NFC tag) as well as the sign-up QR token.
-- Safe to run before the frontend is deployed (old callers still pass the join token and behave as before).
create or replace function public.join_business(p_slug text, p_name text, p_phone text, p_bday date, p_consent boolean, p_join_token text default null, p_ref text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare b businesses; m uuid; im imports; claimed boolean := false; rf uuid := null; rc text := upper(trim(coalesce(p_ref, '')));
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not coalesce(p_consent, false) then raise exception 'Consent is required to join'; end if;
  select * into b from businesses where slug = p_slug;
  if not found then raise exception 'Unknown business'; end if;
  if coalesce(p_join_token, '') = '' or p_join_token not in (b.join_token, b.scan_token) then
    raise exception 'Please scan the sign-up QR code at the counter to join';
  end if;
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
end
$function$;
