# Loyalty Kit (Phase 2: shared backend)

Customer app at `/`, owner dashboard at `/admin`. One free Supabase database serves every client. Plain HTML/CSS/JS, no build step.

```
index.html            customer app          assets/customer.js
admin/index.html      owner dashboard       assets/admin.js
assets/config.js      per-deployment settings (the only file you edit)
assets/common.js, style.css   shared
supabase/schema.sql   run once        supabase/new-client.sql   run per client
```

## One-time setup (about 10 minutes)

1. **Create a project** at supabase.com (free). Pick the region nearest your customers.
2. **Run the database:** SQL Editor -> New query -> paste `supabase/schema.sql` -> Run.
3. **Turn off email confirmation:** Authentication -> Sign In / Providers -> Email -> switch **Confirm email** off -> Save. (Customers sign in with phone + password, which is stored as an internal login address, so there is no inbox to confirm. Without this, joining fails.)
4. **Copy your keys:** Project Settings -> API -> note the Project URL and the anon / publishable key.

## Add a client

1. Authentication -> Users -> **Add user**: the owner's email + password, tick *Auto Confirm User*.
2. SQL Editor: open `supabase/new-client.sql`, change the slug, name and owner email, Run.
3. In `assets/config.js` set `supabaseUrl`, `supabaseKey` and `slug` (same slug as step 2).
4. Test locally (VS Code Live Server, open the folder root). Customer app: `/`. Owner: `/admin`.

Branding, offers, cooldown, expiry, first stamp and card length are then edited by the owner in **/admin -> Settings** and apply to everyone instantly. No redeploy needed.

## Stamps, coupons and card validity

- **Stamping:** Owner -> **QR & NFC** gives one link. Put it on a QR code or write it to NFC tags (NTAG213/215, free app "NFC Tools", URL record). Staff tap the customer's phone on the tag and a stamp is added after sign-in. One stamp per customer per cooldown period. If the link leaks, press **Regenerate code** and rewrite the tags.
- **Free first stamp:** a new member gets a stamp when they join (switch off in Settings -> Stamp card).
- **Coupon codes:** welcome, surprise and birthday offers and the full-card reward each get a unique 6-character code on the customer's card. Customers cannot use them by themselves.
- **Redeeming:** owner/staff open `/admin` -> **Redeem**, type the code (optionally the customer's phone to confirm it is theirs), press **Check coupon**, then **Confirm and mark as used**. A used code is dead for good and moves to the customer's History. The Redeem tab keeps a searchable log.
- **Full card:** the customer taps **Get my reward code**, which uses up the stamps and creates a Reward coupon. Staff redeem it the same way.
- **Birthday:** the coupon appears up to 7 days early but works only on the birthday date (business time zone), then expires.
- **Card validity:** Settings -> Stamp card -> "Each card lasts" (default 6 months from the customer's first stamp, 0 = never). An unfinished card past its end date restarts at zero and the customer is told. A full card never expires. Owners see "Card ends" per customer and get "Card ending" reminders.
- **Phone numbers:** exactly 10 digits. Spaces, dashes, `+91`, `91` and a leading `0` (including phone autofill) are cleaned automatically. Indian numbers must start with 6-9. Change `countryCode` in `config.js` for other countries.
- **Staff:** there are no separate staff logins yet. Staff use the owner login on the counter device.

**Updating an existing database:** just run `supabase/schema.sql` again. It is safe to re-run and keeps all data. Numbers saved earlier in `+91` or 12-digit form will not match the new 10-digit rule, so delete test accounts and sign up again.

## Passwords

- **Owner forgot password:** "Forgot password?" on `/admin` emails a reset link. One-time setup: Supabase -> Authentication -> URL Configuration -> set **Site URL** to the client's domain and add `https://their-domain/admin/` (and `http://127.0.0.1:5500/admin/` for local tests) to **Redirect URLs**.
- **Customer forgot password:** customers have no real email, so the owner opens **Customers -> Reset password**, types a temporary password, and tells the customer. The customer signs in and uses **Change password** on their card.

## Reminders and home screen

- `/admin` -> Overview -> **Reminders** lists birthdays in the next 7 days and offers ending within 3 days. Each row has a **WhatsApp** button that opens a ready-made message to that customer. Set `countryCode` in `config.js` (10-digit numbers get it added).
- Customers see an "Expires in N days" notice on their card, plus an **Add to home screen** card (Android button, iPhone Share steps). On iPhone the installed app keeps its own login, so they sign in once more inside it.

## Deploy (GitHub + Vercel)

```
git init
git add .
git commit -m "Phase 2"
git branch -M main
git remote add origin https://github.com/YOU/loyalty-kit.git
git push -u origin main
```
Vercel -> Add New -> Project -> import the repo -> Framework Preset **Other** -> Deploy. Update later with `git add .`, `git commit -m "what changed"`, `git push`.

**One client = one Vercel project** from the same code, each with its own `config.js` slug and its own domain (Project -> Settings -> Domains). They all share the one Supabase database. A branch per client keeps their `config.js` separate.

## Free-tier limits to know

- Supabase pauses a free project after about a week without activity. Open the dashboard to resume it. Fine for testing, not for live clients (Pro is $25/month per organisation, not per client).
- The anon key in `config.js` is public by design. The database rules in `schema.sql` are what keep each customer and owner to their own data.
- Passwords are handled by Supabase Auth (hashed, rate-limited). Supabase's built-in email sender is limited to a few emails per hour, which is plenty for owner resets.
- Reminders are manual (the owner taps WhatsApp). Automatic sending needs a paid WhatsApp/SMS service or web push, which is a later step.
- The admin table loads the first 1,000 customers.
