-- Platform admin: reset a shop owner's login email and/or password.
-- Safe to re-run. Run this in the Supabase SQL Editor (also fine to run after schema.sql).
--
-- Why: an owner can lose access to their login email or forget their password and not be able to
-- receive the emailed reset link. A platform admin can set a new login email and hand over a
-- temporary password. The account that is changed is signed out everywhere, because its current
-- session key (not just the password) can no longer be trusted.
--
-- One login can own several shops. Editing its email or password would affect every shop it owns, so:
--   * A login that owns ONLY this shop: its email and password are edited here, as before.
--   * A login that owns SEVERAL shops: it is never edited. If a new email is given, just this shop is
--     moved to that existing account (create the account in Supabase first). A temporary password is
--     refused unless the same call also moves the shop to that new account, so the new account's
--     password is the only one touched.
-- Only the account that actually gained a new email/password is signed out; a plain hand-over leaves
-- the previous owner's session alone (they still run their other shops).
--
-- This is an overload of the existing public.platform_set_owner(text, text) (which hands a shop to
-- an existing account). PostgREST picks the right one from the argument names, so both keep working.
-- Guard is the same one the platform page uses: public._is_platform_admin().

create or replace function public.platform_set_owner(p_business uuid, p_email text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  uid uuid;             -- the shop's owner at the start of this call
  new_uid uuid;         -- the account this shop moves to, when the owner runs several shops
  nshops int;           -- how many shops that owner runs
  cur_email text;
  em text := lower(trim(coalesce(p_email, '')));
  pw text := coalesce(p_password, '');
  reassigned boolean := false;
  reset_uid uuid;       -- the account whose sessions we drop (only one whose email/password changed)
begin
  if not public._is_platform_admin() then raise exception 'Not allowed'; end if;

  select owner_id into uid from businesses where id = p_business;
  if uid is null then raise exception 'This shop has no owner account'; end if;

  select lower(email) into cur_email from auth.users where id = uid;
  select count(*) into nshops from businesses where owner_id = uid;

  -- A login that runs more than one shop is shared: never edit it. Move just this shop instead.
  if nshops > 1 then
    if em <> '' and em <> cur_email then
      if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
      select id into new_uid from auth.users where lower(email) = em;
      if new_uid is null then
        raise exception 'No account exists for %. Create that user in Supabase (Authentication -> Users), then try again.', em;
      end if;
      update businesses set owner_id = new_uid where id = p_business;
      uid := new_uid;     -- a password supplied in the same call applies to the new owner
      reassigned := true;
    elsif pw <> '' then
      raise exception 'This login owns % shops, so its password cannot be reset here. Enter a different owner email in the same step to move this shop to another account, or reset the password in Supabase.', nshops;
    end if;
  end if;

  -- Edit the login email only when the account is not shared (or this shop was just moved).
  if em <> '' and not reassigned and nshops <= 1 then
    if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email'; end if;
    if exists (select 1 from auth.users where lower(email) = em and id <> uid) then
      raise exception 'That email is already used by another account';
    end if;
    update auth.users set email = em, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = uid;
    update auth.identities
       set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(em)), provider_id = em, updated_at = now()
     where user_id = uid and provider = 'email';
    reset_uid := uid;
  end if;

  if pw <> '' then
    if length(pw) < 8 then raise exception 'Password must be at least 8 characters'; end if;
    update auth.users set encrypted_password = crypt(pw, gen_salt('bf')), updated_at = now() where id = uid;
    reset_uid := uid;
  end if;

  -- Sign out only the account we changed — never another shop's owner.
  if reset_uid is not null then delete from auth.sessions where user_id = reset_uid; end if;

  return json_build_object('ok', true, 'reassigned', reassigned, 'shops', nshops);
end $$;

revoke execute on function public.platform_set_owner(uuid, text, text) from public, anon, authenticated;
grant execute on function public.platform_set_owner(uuid, text, text) to authenticated;
