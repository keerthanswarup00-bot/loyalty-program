-- Add a client (run once per client).
-- 1) Supabase -> Authentication -> Users -> Add user: the owner's email + password, tick "Auto Confirm User".
-- 2) Edit the values below (slug = lowercase letters, numbers, hyphens; owner email must match step 1) and Run.
--    If it says "0 rows inserted", the owner email did not match.
-- Branding and offers can be changed later by the owner in /admin -> Settings.

insert into public.businesses
  (slug, name, tagline, color, owner_id, need, reward, cooldown_min,
   sur_stamps, sur_offer, welcome_offer, bday_offer, exp_days)
select
  'cheesora-bliss', 'Cheesora Bliss', 'Every cup counts.', '#8a4b2a', id, 8, 'Free coffee of your choice', 240,
  '3', '20% off your next order', '10% off your next visit', 'Free dessert on your birthday', 30
from auth.users
where email = 'keerthanswarup00@gmail.com';
