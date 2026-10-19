-- Product scent notes (one line per product) and an optional bespoke-fragrance note for the shop.
-- Run in Supabase Dashboard -> SQL Editor. Safe to run more than once.
alter table public.menu_items add column if not exists scent_notes text not null default '' check (char_length(scent_notes) <= 80);
alter table public.businesses add column if not exists bespoke_text text not null default '' check (char_length(bespoke_text) <= 400);
grant update (bespoke_text) on public.businesses to authenticated;

create or replace function public.get_menu(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'categories', coalesce((select json_agg(json_build_object('id', c.id, 'name', c.name) order by c.sort, c.created_at)
                            from menu_categories c where c.business_id = b.id), '[]'::json),
    'items', coalesce((select json_agg(json_build_object(
                'id', i.id, 'title', i.title, 'description', i.description, 'price', i.price,
                'image_url', i.image_url, 'category_id', i.category_id, 'scent_notes', i.scent_notes) order by i.sort, i.created_at)
              from menu_items i where i.business_id = b.id and i.available), '[]'::json))
  from businesses b where b.slug = p_slug;
$$;

-- New optional argument p_scent: the old 8-argument version must go or calls become ambiguous.
drop function if exists public.save_menu_item(text, uuid, text, text, text, text, boolean, uuid);
create or replace function public.save_menu_item(
  p_slug text, p_id uuid, p_title text, p_description text, p_price text, p_image text, p_available boolean,
  p_category uuid default null, p_scent text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare b businesses; t text := trim(coalesce(p_title, '')); img text := coalesce(p_image, ''); r uuid;
begin
  select * into b from businesses where slug = p_slug and (owner_id = auth.uid() or (select public._is_platform_admin()));
  if not found then raise exception 'Not allowed'; end if;
  if char_length(t) < 1 or char_length(t) > 80 then raise exception 'Give the item a name (up to 80 characters)'; end if;
  if char_length(coalesce(p_description, '')) > 600 then raise exception 'Description is too long (600 characters max)'; end if;
  if char_length(coalesce(p_scent, '')) > 80 then raise exception 'Scent notes are too long (80 characters max)'; end if;
  if char_length(coalesce(p_price, '')) > 24 then raise exception 'Price is too long'; end if;
  if img <> '' and img !~ '^(https://|data:image/(png|jpeg|webp|gif);base64,)' then raise exception 'Invalid image'; end if;
  if p_category is not null and not exists (select 1 from menu_categories where id = p_category and business_id = b.id) then
    raise exception 'Category not found';
  end if;
  if p_id is null then
    if (select count(*) from menu_items where business_id = b.id) >= 300 then raise exception 'Menu is full (300 items)'; end if;
    insert into menu_items (business_id, title, description, price, image_url, available, sort, category_id, scent_notes)
    values (b.id, t, trim(coalesce(p_description, '')), trim(coalesce(p_price, '')), img, coalesce(p_available, true),
            coalesce((select max(sort) from menu_items where business_id = b.id), 0) + 1, p_category, trim(coalesce(p_scent, '')))
    returning id into r;
  else
    update menu_items set title = t, description = trim(coalesce(p_description, '')), price = trim(coalesce(p_price, '')),
           image_url = img, available = coalesce(p_available, true), category_id = p_category,
           scent_notes = case when p_scent is null then scent_notes else trim(p_scent) end
     where id = p_id and business_id = b.id returning id into r;
    if r is null then raise exception 'Item not found'; end if;
  end if;
  return r;
end $$;
revoke execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean, uuid, text) from public, anon, authenticated;
grant execute on function public.save_menu_item(text, uuid, text, text, text, text, boolean, uuid, text) to authenticated;
grant execute on function public.get_menu(text) to anon, authenticated;

create or replace function public.get_business(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'slug', slug,
    'name', name, 'tagline', tagline, 'color', color, 'logo_url', logo_url,
    'stamp_url', stamp_url,
    'ig', ig, 'fb', fb, 'yt', yt, 'wa', wa, 'web', web,
    'phone', phone, 'wa_phone', wa_phone, 'address', address, 'maps_url', maps_url,
    'lat', lat, 'lng', lng, 'review_url', review_url,
    'links', links, 'gallery', gallery, 'vertical', vertical,
    'hero_url', hero_url, 'about', about, 'connect_loyalty', connect_loyalty,
    'connect_offer', connect_offer, 'bespoke_text', bespoke_text,
    'need', need, 'reward', reward,
    'cooldown_min', cooldown_min, 'sur_stamps', sur_stamps, 'sur_offer', sur_offer,
    'welcome_offer', welcome_offer, 'bday_offer', bday_offer, 'exp_days', exp_days,
    'join_stamp', join_stamp, 'card_months', card_months, 'tz', tz,
    'news_text', news_text, 'news_at', news_at, 'ref_on', ref_on, 'ref_offer', ref_offer,
    'theme', theme)
  from businesses where slug = p_slug;
$$;
grant execute on function public.get_business(text) to anon, authenticated;
notify pgrst, 'reload schema';
