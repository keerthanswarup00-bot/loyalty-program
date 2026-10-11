-- Menu (owner adds items, customers browse) and website enquiries.
-- Safe to run more than once. Run it in the Supabase SQL editor.

-- ---------- Menu ----------
create table if not exists public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 600),
  price       text not null default '' check (char_length(price) <= 24),
  image_url   text not null default '' check (char_length(image_url) <= 600000),
  available   boolean not null default true,
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists menu_items_biz_sort on public.menu_items (business_id, sort, created_at);

alter table public.menu_items enable row level security;
revoke all on public.menu_items from anon, authenticated;
grant select on public.menu_items to authenticated;
drop policy if exists menu_owner_select on public.menu_items;
create policy menu_owner_select on public.menu_items for select to authenticated
  using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

-- What customers see: available items only, in the owner's order.
create or replace function public.get_menu(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'id', i.id, 'title', i.title, 'description', i.description,
           'price', i.price,
           'image_url', case
             when char_length(i.image_url) <= 2048
              and i.image_url ~ ('^https://[a-z0-9-]+\\.supabase\\.co/storage/v1/object/public/brand/' || b.id::text || '/menu-[a-z0-9]+\\.(png|jpg|webp)
$$;

-- Owner: add (p_id null) or change an item. Returns the item id.
create or replace function public.save_menu_item(
  p_slug text, p_id uuid, p_title text, p_description text, p_price text, p_image text, p_available boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare b businesses; t text := trim(coalesce(p_title, '')); img text := coalesce(p_image, ''); r uuid;
begin
  select * into b from businesses where slug = p_slug and owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  if char_length(t) < 1 or char_length(t) > 80 then raise exception 'Give the item a name (up to 80 characters)'; end if;
  if char_length(coalesce(p_description, '')) > 600 then raise exception 'Description is too long (600 characters max)'; end if;
  if char_length(coalesce(p_price, '')) > 24 then raise exception 'Price is too long'; end if;
  if img <> '' and (
       char_length(img) > 2048
       or img !~ ('^https://[a-z0-9-]+\\.supabase\\.co/storage/v1/object/public/brand/' || b.id::text || '/menu-[a-z0-9]+\\.(png|jpg|webp)
  if p_id is null then
    if (select count(*) from menu_items where business_id = b.id) >= 300 then raise exception 'Menu is full (300 items)'; end if;
    insert into menu_items (business_id, title, description, price, image_url, available, sort)
    values (b.id, t, trim(coalesce(p_description, '')), trim(coalesce(p_price, '')), img, coalesce(p_available, true),
            coalesce((select max(sort) from menu_items where business_id = b.id), 0) + 1)
    returning id into r;
  else
    update menu_items set title = t, description = trim(coalesce(p_description, '')), price = trim(coalesce(p_price, '')),
           image_url = img, available = coalesce(p_available, true)
     where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Item not found'; end if;
  end if;
  return r;
end $$;

create or replace function public.delete_menu_item(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from menu_items i using businesses b
   where i.id = p_id and b.id = i.business_id and b.owner_id = auth.uid();
end $$;

revoke execute on function public.get_menu(text), public.save_menu_item(text, uuid, text, text, text, text, boolean),
  public.delete_menu_item(uuid) from public, anon, authenticated;
grant execute on function public.get_menu(text) to anon, authenticated;
grant execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.delete_menu_item(uuid) to authenticated;

-- ---------- Website enquiries (Contact page) ----------
-- Read them in Table Editor -> leads. Nobody can read or write the table from the browser.
create table if not exists public.leads (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 2 and 80),
  shop       text not null default '' check (char_length(shop) <= 80),
  contact    text not null check (char_length(contact) between 5 and 120),
  message    text not null default '' check (char_length(message) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

create or replace function public.submit_lead(p_name text, p_shop text, p_contact text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Please enter your name'; end if;
  if char_length(trim(coalesce(p_contact, ''))) < 5 then raise exception 'Please enter a phone number or email'; end if;
  if (select count(*) from leads where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many messages right now. Please try again in a while.';
  end if;
  insert into leads (name, shop, contact, message)
  values (left(trim(p_name), 80), left(trim(coalesce(p_shop, '')), 80), left(trim(p_contact), 120), left(trim(coalesce(p_message, '')), 1000));
end $$;

revoke execute on function public.submit_lead(text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_lead(text, text, text, text) to anon, authenticated;
)
     ) then
    raise exception 'Invalid image. Upload a PNG, JPG or WebP menu photo to this business storage folder.';
  end if;
  if p_id is null then
    if (select count(*) from menu_items where business_id = b.id) >= 300 then raise exception 'Menu is full (300 items)'; end if;
    insert into menu_items (business_id, title, description, price, image_url, available, sort)
    values (b.id, t, trim(coalesce(p_description, '')), trim(coalesce(p_price, '')), img, coalesce(p_available, true),
            coalesce((select max(sort) from menu_items where business_id = b.id), 0) + 1)
    returning id into r;
  else
    update menu_items set title = t, description = trim(coalesce(p_description, '')), price = trim(coalesce(p_price, '')),
           image_url = img, available = coalesce(p_available, true)
     where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Item not found'; end if;
  end if;
  return r;
end $$;

create or replace function public.delete_menu_item(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from menu_items i using businesses b
   where i.id = p_id and b.id = i.business_id and b.owner_id = auth.uid();
end $$;

revoke execute on function public.get_menu(text), public.save_menu_item(text, uuid, text, text, text, text, boolean),
  public.delete_menu_item(uuid) from public, anon, authenticated;
grant execute on function public.get_menu(text) to anon, authenticated;
grant execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.delete_menu_item(uuid) to authenticated;

-- ---------- Website enquiries (Contact page) ----------
-- Read them in Table Editor -> leads. Nobody can read or write the table from the browser.
create table if not exists public.leads (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 2 and 80),
  shop       text not null default '' check (char_length(shop) <= 80),
  contact    text not null check (char_length(contact) between 5 and 120),
  message    text not null default '' check (char_length(message) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

create or replace function public.submit_lead(p_name text, p_shop text, p_contact text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Please enter your name'; end if;
  if char_length(trim(coalesce(p_contact, ''))) < 5 then raise exception 'Please enter a phone number or email'; end if;
  if (select count(*) from leads where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many messages right now. Please try again in a while.';
  end if;
  insert into leads (name, shop, contact, message)
  values (left(trim(p_name), 80), left(trim(coalesce(p_shop, '')), 80), left(trim(p_contact), 120), left(trim(coalesce(p_message, '')), 1000));
end $$;

revoke execute on function public.submit_lead(text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_lead(text, text, text, text) to anon, authenticated;
)
             then i.image_url else '' end) order by i.sort, i.created_at), '[]'::json)
  from menu_items i join businesses b on b.id = i.business_id
  where b.slug = p_slug and i.available;
$$;

-- Owner: add (p_id null) or change an item. Returns the item id.
create or replace function public.save_menu_item(
  p_slug text, p_id uuid, p_title text, p_description text, p_price text, p_image text, p_available boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare b businesses; t text := trim(coalesce(p_title, '')); img text := coalesce(p_image, ''); r uuid;
begin
  select * into b from businesses where slug = p_slug and owner_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  if char_length(t) < 1 or char_length(t) > 80 then raise exception 'Give the item a name (up to 80 characters)'; end if;
  if char_length(coalesce(p_description, '')) > 600 then raise exception 'Description is too long (600 characters max)'; end if;
  if char_length(coalesce(p_price, '')) > 24 then raise exception 'Price is too long'; end if;
  if img <> '' and (
       char_length(img) > 2048
       or img !~ ('^https://[a-z0-9-]+\\.supabase\\.co/storage/v1/object/public/brand/' || b.id::text || '/menu-[a-z0-9]+\\.(png|jpg|webp)
  if p_id is null then
    if (select count(*) from menu_items where business_id = b.id) >= 300 then raise exception 'Menu is full (300 items)'; end if;
    insert into menu_items (business_id, title, description, price, image_url, available, sort)
    values (b.id, t, trim(coalesce(p_description, '')), trim(coalesce(p_price, '')), img, coalesce(p_available, true),
            coalesce((select max(sort) from menu_items where business_id = b.id), 0) + 1)
    returning id into r;
  else
    update menu_items set title = t, description = trim(coalesce(p_description, '')), price = trim(coalesce(p_price, '')),
           image_url = img, available = coalesce(p_available, true)
     where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Item not found'; end if;
  end if;
  return r;
end $$;

create or replace function public.delete_menu_item(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from menu_items i using businesses b
   where i.id = p_id and b.id = i.business_id and b.owner_id = auth.uid();
end $$;

revoke execute on function public.get_menu(text), public.save_menu_item(text, uuid, text, text, text, text, boolean),
  public.delete_menu_item(uuid) from public, anon, authenticated;
grant execute on function public.get_menu(text) to anon, authenticated;
grant execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.delete_menu_item(uuid) to authenticated;

-- ---------- Website enquiries (Contact page) ----------
-- Read them in Table Editor -> leads. Nobody can read or write the table from the browser.
create table if not exists public.leads (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 2 and 80),
  shop       text not null default '' check (char_length(shop) <= 80),
  contact    text not null check (char_length(contact) between 5 and 120),
  message    text not null default '' check (char_length(message) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

create or replace function public.submit_lead(p_name text, p_shop text, p_contact text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Please enter your name'; end if;
  if char_length(trim(coalesce(p_contact, ''))) < 5 then raise exception 'Please enter a phone number or email'; end if;
  if (select count(*) from leads where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many messages right now. Please try again in a while.';
  end if;
  insert into leads (name, shop, contact, message)
  values (left(trim(p_name), 80), left(trim(coalesce(p_shop, '')), 80), left(trim(p_contact), 120), left(trim(coalesce(p_message, '')), 1000));
end $$;

revoke execute on function public.submit_lead(text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_lead(text, text, text, text) to anon, authenticated;
)
     ) then
    raise exception 'Invalid image. Upload a PNG, JPG or WebP menu photo to this business storage folder.';
  end if;
  if p_id is null then
    if (select count(*) from menu_items where business_id = b.id) >= 300 then raise exception 'Menu is full (300 items)'; end if;
    insert into menu_items (business_id, title, description, price, image_url, available, sort)
    values (b.id, t, trim(coalesce(p_description, '')), trim(coalesce(p_price, '')), img, coalesce(p_available, true),
            coalesce((select max(sort) from menu_items where business_id = b.id), 0) + 1)
    returning id into r;
  else
    update menu_items set title = t, description = trim(coalesce(p_description, '')), price = trim(coalesce(p_price, '')),
           image_url = img, available = coalesce(p_available, true)
     where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Item not found'; end if;
  end if;
  return r;
end $$;

create or replace function public.delete_menu_item(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from menu_items i using businesses b
   where i.id = p_id and b.id = i.business_id and b.owner_id = auth.uid();
end $$;

revoke execute on function public.get_menu(text), public.save_menu_item(text, uuid, text, text, text, text, boolean),
  public.delete_menu_item(uuid) from public, anon, authenticated;
grant execute on function public.get_menu(text) to anon, authenticated;
grant execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.delete_menu_item(uuid) to authenticated;

-- ---------- Website enquiries (Contact page) ----------
-- Read them in Table Editor -> leads. Nobody can read or write the table from the browser.
create table if not exists public.leads (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 2 and 80),
  shop       text not null default '' check (char_length(shop) <= 80),
  contact    text not null check (char_length(contact) between 5 and 120),
  message    text not null default '' check (char_length(message) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

create or replace function public.submit_lead(p_name text, p_shop text, p_contact text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Please enter your name'; end if;
  if char_length(trim(coalesce(p_contact, ''))) < 5 then raise exception 'Please enter a phone number or email'; end if;
  if (select count(*) from leads where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many messages right now. Please try again in a while.';
  end if;
  insert into leads (name, shop, contact, message)
  values (left(trim(p_name), 80), left(trim(coalesce(p_shop, '')), 80), left(trim(p_contact), 120), left(trim(coalesce(p_message, '')), 1000));
end $$;

revoke execute on function public.submit_lead(text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_lead(text, text, text, text) to anon, authenticated;
