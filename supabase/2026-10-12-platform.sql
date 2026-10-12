-- Multi-business platform: one deployment, many shops.
-- Safe to re-run. Also included at the end of schema.sql.
--
-- 1) Run this file.
-- 2) Make yourself the platform admin (once, after you have an account at /platform/ or in Authentication -> Users):
--      insert into public.platform_admins (user_id) select id from auth.users where email = 'YOU@example.com';
-- Platform admins can create shops, change who owns a shop and attach domains. They cannot read a shop's customers:
-- shop data stays visible only to the shop's owner (the existing row rules are unchanged).

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

-- A web address (custom domain or subdomain) that opens a particular shop.
create table if not exists public.business_domains (
  host text primary key check (length(host) <= 253 and host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists business_domains_biz_idx on public.business_domains (business_id);
alter table public.business_domains enable row level security;
revoke all on public.business_domains from anon, authenticated;

create or replace function public._is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- Public: which shop does this web address belong to? (null = unknown). The address-to-shop link is public by nature.
create or replace function public.resolve_host(p_host text) returns text
language sql stable security definer set search_path = public as $$
  select b.slug from business_domains d join businesses b on b.id = d.business_id where d.host = lower(btrim(p_host));
$$;

create or replace function public.platform_overview() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not _is_platform_admin() then raise exception 'Not allowed'; end if;
  return (select coalesce(json_agg(json_build_object(
      'id', b.id, 'slug', b.slug, 'name', b.name, 'color', b.color, 'created_at', b.created_at,
      'owner_email', u.email,
      'members', (select count(*) from members m where m.business_id = b.id),
      'stamps_30d', (select count(*) from visits v where v.business_id = b.id and v.created_at > now() - interval '30 days'),
      'last_stamp', (select max(v.created_at) from visits v where v.business_id = b.id),
      'domains', coalesce((select json_agg(d.host order by d.host) from business_domains d where d.business_id = b.id), '[]'::json)
    ) order by b.created_at desc), '[]'::json)
    from businesses b left join auth.users u on u.id = b.owner_id);
end $$;

create or replace function public.platform_create_business(p_slug text, p_name text, p_owner_email text,
  p_tagline text default '', p_color text default '#8a4b2a') returns json
language plpgsql security definer set search_path = public as $$
declare s text := lower(btrim(coalesce(p_slug, ''))); uid uuid; bid uuid; col text := coalesce(p_color, '');
begin
  if not _is_platform_admin() then raise exception 'Not allowed'; end if;
  if s !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'The shop address must be 3 to 40 letters, numbers or hyphens'; end if;
  if s in ('www', 'app', 'admin', 'api', 'platform', 'mail', 'static', 'assets', 'about', 'contact', 'docs', 'support', 'status') then
    raise exception 'That address is reserved'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Enter the shop name'; end if;
  if col !~ '^#[0-9a-fA-F]{6}$' then col := '#8a4b2a'; end if;
  if exists (select 1 from businesses where slug = s) then raise exception 'That address is already taken'; end if;
  select id into uid from auth.users where email = lower(btrim(coalesce(p_owner_email, '')));
  if uid is null then raise exception 'No account exists for that owner email yet'; end if;
  insert into businesses (slug, name, tagline, color, owner_id)
    values (s, left(btrim(p_name), 80), left(coalesce(p_tagline, ''), 120), col, uid) returning id into bid;
  return json_build_object('id', bid, 'slug', s);
end $$;

create or replace function public.platform_set_owner(p_slug text, p_owner_email text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not _is_platform_admin() then raise exception 'Not allowed'; end if;
  select id into uid from auth.users where email = lower(btrim(coalesce(p_owner_email, '')));
  if uid is null then raise exception 'No account exists for that owner email yet'; end if;
  update businesses set owner_id = uid where slug = p_slug;
  if not found then raise exception 'Shop not found'; end if;
end $$;

create or replace function public.platform_set_domain(p_slug text, p_host text) returns void
language plpgsql security definer set search_path = public as $$
declare h text := lower(btrim(coalesce(p_host, ''))); bid uuid;
begin
  if not _is_platform_admin() then raise exception 'Not allowed'; end if;
  if h !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' or length(h) > 253 then
    raise exception 'Enter just the domain, like rewards.myshop.com (no https:// and no slash)'; end if;
  select id into bid from businesses where slug = p_slug;
  if bid is null then raise exception 'Shop not found'; end if;
  if exists (select 1 from business_domains where host = h and business_id <> bid) then
    raise exception 'That domain already belongs to another shop'; end if;
  insert into business_domains (host, business_id) values (h, bid) on conflict (host) do nothing;
end $$;

create or replace function public.platform_remove_domain(p_host text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not _is_platform_admin() then raise exception 'Not allowed'; end if;
  delete from business_domains where host = lower(btrim(coalesce(p_host, '')));
end $$;

revoke execute on function public.resolve_host(text), public.platform_overview(),
  public.platform_create_business(text, text, text, text, text), public.platform_set_owner(text, text),
  public.platform_set_domain(text, text), public.platform_remove_domain(text) from public, anon, authenticated;
revoke execute on function public._is_platform_admin() from public, anon;
grant execute on function public._is_platform_admin() to authenticated;
grant execute on function public.resolve_host(text) to anon, authenticated;
grant execute on function public.platform_overview() to authenticated;
grant execute on function public.platform_create_business(text, text, text, text, text) to authenticated;
grant execute on function public.platform_set_owner(text, text) to authenticated;
grant execute on function public.platform_set_domain(text, text) to authenticated;
grant execute on function public.platform_remove_domain(text) to authenticated;
