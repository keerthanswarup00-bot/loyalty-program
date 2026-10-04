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

Branding, offers, cooldown and expiry are then edited by the owner in **/admin -> Settings** and apply to everyone instantly. No redeploy needed.

## Stamping

Owner -> **QR & NFC** gives one link. Put it on a QR code or write it to NFC tags (NTAG213/215, free app "NFC Tools", URL record). Staff tap the customer's phone on the tag, the page opens, and a stamp is added after sign-in. One stamp per customer per cooldown period. If the link leaks, press **Regenerate code** and rewrite the tags.

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
- Passwords are handled by Supabase Auth (hashed, rate-limited). There is no "forgot password" yet. An owner can delete a customer, who can then re-join; owners reset via Authentication -> Users.
- The admin table loads the first 1,000 customers.
