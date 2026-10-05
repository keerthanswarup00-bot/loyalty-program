# Loyalty Program — Code Audit & Handoff

**Audited:** 5 Oct 2026 · **Commit:** `398953e` · **Live:** https://royalty-prog.vercel.app

---

## 1. What this project is

A **white-label stamp-card loyalty programme** for physical small businesses (currently a cafe, *Cheesora Bliss*). One codebase serves many businesses; each business gets its own deployment.

It has two front ends over one shared backend:

| App | URL | Who uses it | Purpose |
|---|---|---|---|
| **Customer app** | `/` | Shop customers on their phones | Join the club, collect stamps by tapping an NFC tag / QR code, view coupons, claim rewards |
| **Owner dashboard** | `/admin` | The shop owner / staff on a counter device | Overview stats, redeem coupons, manage customers, QR & NFC setup, all business settings |

**Business flow:** customer signs up with phone + password → taps the stamp tag at the counter → `add_stamp` grants one stamp (rate-limited by a cooldown) → at N stamps the customer claims a reward, which becomes a 6-character coupon code → staff type that code in the admin to redeem it.

There is **no separate staff role** — staff use the owner login. There is **no SMS/OTP** — customers authenticate with a phone number and password mapped to a synthetic internal email address.

---

## 2. Tech stack

### Frontend
- **Plain HTML5 + CSS + vanilla JavaScript.** No framework, no bundler, no build step, no TypeScript.
- Rendering is **string-template + `innerHTML`** into `<main id="app">`, re-rendered wholesale by a single `render()` per app.
- Hand-inlined SVG icon set (no icon library), Google Fonts (Fraunces + Inter).
- Third-party scripts from CDN, unpinned and without Subresource Integrity:
  - `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` (customer + admin)
  - `https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js` (admin only)
- Offline-ish "app" behaviour: a runtime-generated PWA manifest + canvas-drawn icons (blob URL), plus an "Add to home screen" prompt.

### Backend
- **Supabase** (project *Loyalty program*, ref `qgechlsujyzgivwnvdwf`, region `ap-south-1`) providing:
  - **Postgres** — 4 tables, all business logic in SQL
  - **Row Level Security** — per-role read policies
  - **Auth** — email/password, used as the identity store for both owners and customers
  - **PostgREST** — the only data path; the browser talks to RPC functions and two table reads
- All mutations go through **`SECURITY DEFINER` SQL functions**. The browser has **no direct INSERT/UPDATE/DELETE** on any table.
- Client uses the **publishable (anon) key**, which is public by design; the database grants + RLS are the security boundary.

### Hosting
- **Vercel** (project `loyalty-program`) serving the repo as static files, framework preset *Other*. Alias: `royalty-prog.vercel.app`.
- Deployment Protection (Vercel Authentication) was **enabled and has now been disabled** — before that, every URL 302-redirected to `vercel.com/sso-api`.
- Repo: `github.com/keerthanswarup00-bot/loyalty-program`, branch `main`, direct CLI deploys.

---

## 3. File map

### Live application (shipped to production)

| File | Lines | Role |
|---|---:|---|
| `index.html` | 21 | Customer app shell. Loads `assets/style.css`, `config.js`, `common.js`, `customer.js`. |
| `admin/index.html` | 24 | Owner dashboard shell. Same, plus `qrcode-generator` CDN. Has `<meta name="robots" content="noindex">`. |
| `assets/config.js` | 10 | **The only per-client file.** Supabase URL, publishable key, `slug`, `emailDomain`, `countryCode`. Also holds the seeded Cheesora Bliss branding. |
| `assets/common.js` | 64 | Shared runtime: DOM helpers (`$`, `v`, `esc`), SVG icons, `mkClient` (separate auth storage keys per app), `rpc`, `toast`, date helpers, `normPhone`, `waLink`, password field widget, `nice()` error humaniser, `brand()` theming, `mark()`/`head()`/`socials()`, `notReady()`/`setupMsg`. |
| `assets/customer.js` | 228 | Customer app logic: signup, login, forgot-password view, change password, delete account, card render, offers, reward claim, NFC/QR scan handling, A2HS prompt, runtime PWA manifest. |
| `assets/admin.js` | 290 | Owner app logic: login, forgot/reset password, 5 tabs (Overview, Redeem, Customers, QR & NFC, Settings), coupon redeem flow, reminders + WhatsApp deep links, CSV export, QR SVG generation, image upload, settings save. |
| `assets/style.css` | 59 | All styling. CSS custom properties, dark mode via `prefers-color-scheme`, responsive grid for the stamp card and stat tiles. |
| `supabase/schema.sql` | 400 | Full database definition. Idempotent — safe to re-run. Tables, indexes, RLS policies, grants, 12 functions. |
| `supabase/new-client.sql` | 14 | Per-client onboarding insert (slug, name, owner email). Currently pre-filled for Cheesora Bliss. |
| `supabase/2026-10-05-stamp-image.sql` | 25 | The one-off migration that added `stamp_url`. Applied to the live DB on 5 Oct 2026. |
| `README.md` | 73 | Operator documentation: setup, adding a client, stamping, coupons, passwords, deploy, free-tier limits. Accurate and current. |

### Dead code — deployed but never loaded

| File | Lines | Why it matters |
|---|---:|---|
| `app.js` | 118 | **Phase 1 app.** Entirely self-contained; runs off `window.CLIENT` in `localStorage`. Not referenced by either HTML file. Contains a client-side demo PIN (`pin: '1234'` in `config.js`) and its own auth. Confusing and a latent risk if anyone ever wires it up. |
| `config.js` | 22 | **Phase 1 config** (`window.CLIENT`). Superseded by `assets/config.js`. |
| `style.css` | 56 | **Phase 1 stylesheet.** An older fork of `assets/style.css`. |

### Repo hygiene problems

| Path | Issue |
|---|---|
| `loyalty-kit 2/` | Untracked **full duplicate** of the project at an older commit (229-line `admin.js`, 196-line `customer.js`, missing the stamp/logo work). Not ignored by `.gitignore`. High confusion risk. |
| `.DS_Store` | **Committed to git** and repeatedly modified. |
| `supabase/.temp/` | Untracked CLI artefact. |
| `.vercel/` | Correctly gitignored. |

`.gitignore` covers `.DS_Store`, `node_modules/`, `.vercel/`, `.env` — but `.DS_Store` was committed before the rule existed.

---

## 4. Runtime architecture

```
 Customer phone                          Owner device
 ┌────────────────────┐                 ┌────────────────────┐
 │ /  index.html      │                 │ /admin/index.html  │
 │  customer.js       │                 │  admin.js          │
 └─────────┬──────────┘                 └─────────┬──────────┘
           │  Supabase JS client (publishable key)│
           │  separate auth storageKey:           │
           │    lk-customer  /  lk-admin          │
           └───────────────┬───────────────────────┘
                           ▼
        ┌──────────────────────────────────┐
        │  Supabase                        │
        │  ├─ Auth  (email+password)       │
        │  ├─ PostgREST                    │
        │  │    RPC  → 9 granted funcs     │
        │  │    read → businesses (owner)  │
        │  │           members+offers      │
        │  └─ Postgres + RLS              │
        └──────────────────────────────────┘
```

**Two table reads happen directly; everything else is an RPC:**

1. `get_business(slug)` — branding for the login screen, callable by `anon`.
2. `businesses.select('*')` where `slug = …` — owner dashboard load, RLS-restricted to `owner_id = auth.uid()`.
3. `members.select('*, offers(...)')` — owner dashboard customer list, RLS-restricted to the owner's business.

Direct writes are impossible: `members`, `offers` and `visits` have **no INSERT/UPDATE/DELETE grants at all**, and `businesses` grants `UPDATE` on a 20-column allow-list only.

---

## 5. Data model

### `businesses` — one row per client
`id` uuid PK · `slug` text unique (`^[a-z0-9-]+$`) · `owner_id` → `auth.users` · `name` · `tagline` · `color` · `logo_url` · `stamp_url` · `ig` `fb` `wa` `web` · `need` int 2–20 (default 8) · `reward` · `cooldown_min` int ≥0 · `sur_stamps` (e.g. `3,6`) · `sur_offer` · `welcome_offer` · `bday_offer` · `exp_days` · `join_stamp` bool · `card_months` int (0 = never) · `tz` (default `Asia/Kolkata`) · `scan_token` 12 chars · `created_at`

### `members` — one row per customer per business
`id` · `business_id` → businesses · `user_id` → auth.users · `name` · `phone` (10 digits) · `bday` date · `stamps` · `total` (lifetime) · `redeemed` · `last_stamp` · `card_started_at` · `bday_year` · `consent` bool · `joined`
Uniques: `(business_id, user_id)` and `(business_id, phone)`. Index on `business_id`.

### `offers` — coupons
`id` · `member_id` · `business_id` · `type` (`Welcome`/`Birthday`/`Surprise`/`Reward`) · `text` · `code` 6 chars · `valid_from` · `expires_at` · `used_at` · `created_at`
Indexes on `member_id` and `(business_id, code)`.

### `visits` — stamp audit trail
`id` bigint identity · `member_id` · `business_id` · `created_at`. Index on `(business_id, created_at)`. **Append-only, never read by the UI** — currently a write-only table.

---

## 6. Security model

**RLS policies (all `for select` only, to `authenticated`):**

| Table | Policy | Rule |
|---|---|---|
| `businesses` | `biz_owner_select` | `owner_id = auth.uid()` |
| `businesses` | `biz_owner_update` | `using` and `with check` both `owner_id = auth.uid()` |
| `members` | `member_self_select` | `user_id = auth.uid()` |
| `members` | `member_owner_select` | business belongs to `auth.uid()` |
| `offers` | `offer_self_select` | member belongs to `auth.uid()` |
| `offers` | `offer_owner_select` | business belongs to `auth.uid()` |
| `visits` | `visit_owner_select` | business belongs to `auth.uid()` |

**Privileges:** `revoke all` on all four tables from `anon`/`authenticated`, then `grant select` on all four to `authenticated`, and `grant update` on the 20-column allow-list for `businesses`. No insert/delete anywhere.

**Function privileges:** `revoke execute on all functions in schema public from public, anon, authenticated`, then grant exactly nine. The five internal helpers (`_code`, `_give`, `_next_bday`, `_expire_card`, `_do_stamp`) stay unreachable from the client.

**`SECURITY DEFINER` functions that reach into `auth.users`** — the highest-privilege code in the system:

| Function | Guard |
|---|---|
| `reset_member_password(uuid, text)` | Caller must own the member's business; target user must not own any business; password ≥6 chars; writes `crypt(p, gen_salt('bf'))` directly |
| `delete_member(uuid)` | Same ownership guard; deletes the `auth.users` row (cascades to `members`/`offers`/`visits`) |
| `delete_me()` | Self-delete; refuses if the caller owns a business |

**Coupon secrecy:** `my_card` returns `code` as `null` unless the coupon is unused, past `valid_from` and before `expires_at`. An expired or not-yet-valid coupon's code is never sent to the customer's device.

**Escaping:** every interpolation goes through `esc()` (`& < > " '`). `target="_blank"` links carry `rel="noopener"`.

---

## 7. RPC catalogue

| Function | Caller | Returns | Notes |
|---|---|---|---|
| `get_business(slug)` | anon + authenticated | json | Branding incl. `stamp_url`, `tz`. Never returns `scan_token` or `owner_id`. |
| `join_business(slug, name, phone, bday, consent)` | customer | void | Requires auth + consent. Validates name ≥2 chars and `^[0-9]{10}$` phone. Issues welcome coupon, optionally first free stamp. |
| `my_card(slug)` | customer | json | Member stats, `card_ends_at`, live/used offers, `granted` flag, `lost` count. Also runs card expiry and reserves the birthday coupon. |
| `add_stamp(slug, token)` | customer | json | Requires the secret `scan_token`. Row-locks the member, enforces cooldown, returns `{ok, stamps, surprise, lost}` or `{ok:false, error:'cooldown'\|'invalid'\|'nomember', wait}`. |
| `claim_reward(slug)` | customer | json `{code}` | Requires `stamps >= need`. Spends the stamps, carries the remainder into a fresh card, issues a `Reward` coupon. |
| `redeem_code(slug, code, phone, confirm)` | owner | json | `confirm=false` is a dry check; `confirm=true` marks used. Rejects used/expired/not-yet-valid/wrong-phone. |
| `delete_member(uuid)` | owner | void | Deletes login + all data. |
| `reset_member_password(uuid, password)` | owner | void | Direct bcrypt write. |
| `delete_me()` | customer | void | Self-delete. |

**Internal (not client-callable):** `_code` (6-char unambiguous code from a 57-char alphabet), `_give` (insert offer), `_next_bday` (29 Feb → 28 Feb in non-leap years), `_expire_card` (wipes an unfinished card past `card_months`; a **full card never expires**), `_do_stamp` (the single write path for a stamp: increments, logs a visit, starts the card clock, evaluates surprise positions).

**Business rules worth knowing:**
- Stamps cycle modulo `need`, so a 9th stamp on an 8-stamp card is "stamp 1" of the next card.
- Cooldown is enforced server-side in `add_stamp` and returns the exact remaining seconds.
- `cooldown_min = 0` means no cooldown at all.
- Birthday coupons are reserved up to 7 days ahead, valid only 00:00–23:59 on the date in the business time zone, and only once per year (`bday_year`).
- Every coupon carries its own expiry (`exp_days`, or 0 = never for birthdays).

---

## 8. Frontend breakdown

### `assets/common.js`
Two Supabase clients are created with **different `storageKey`s** (`lk-customer`, `lk-admin`) so an owner and a customer can be signed in on the same browser simultaneously. `normPhone` strips spaces, dashes, `+91`, a leading `91` and leading zeros, then requires exactly 10 digits starting 6–9 for India. `mark()` renders the logo `<img>` when `logo_url` starts with `http` or `data:`, otherwise falls back to the business initial.

### `assets/customer.js`
Views: `auth` (tabs New member / Login / Forgot), `home`, `pw`. The customer identity is `${phone}.${slug}@${emailDomain}` — a real Auth login that never receives mail. `ensureCard()` repairs a signup that was interrupted before `join_business` completed, using `user_metadata`. The scan token arrives in the URL **fragment** (`/#scan=…`, so it is never sent to a server in the request line) and is cleared from the URL after use. `pwa()` builds the manifest and icons at runtime from the business name, colour and first letter, injected as a blob URL.

### `assets/admin.js`
Five tabs. **Overview:** 8 stat tiles, a reminders engine (birthdays ≤7 days, cards ending ≤14 days, offers expiring ≤3 days) each with a one-tap WhatsApp deep link, and the 5 latest sign-ups. **Redeem:** two-step check-then-confirm coupon redemption plus a searchable redemption log (last 50). **Customers:** live-searchable table, CSV export (with `=+-@` formula-injection escaping), reset password, delete. **QR & NFC:** the scan link, generated QR SVG, copy link, regenerate token, and NTAG213/215 instructions. **Settings:** business name, tagline, **logo upload**, brand colour, four social links, **stamp image upload**, stamps needed, cooldown (minutes/hours), reward text, join-stamp toggle, card length, and four offer fields.

Image upload (added most recently): `readImg()` validates MIME against `png|jpeg|webp|gif` and caps at 300 KB, then `FileReader` produces a data URL. `pvImg()`/`rmImg()` drive a preview box and a hidden remove flag. `sv()` preserves the currently stored image unless a new file is chosen or Remove is pressed.

---

## 9. Branding & multi-client model

`assets/config.js` is the only file that differs per client:

```js
window.LK = {
  supabaseUrl: 'https://qgechlsujyzgivwnvdwf.supabase.co',
  supabaseKey: 'sb_publishable_…',      // public by design
  slug: 'cheesora-bliss',                // must match businesses.slug
  emailDomain: 'members.example.com',    // synthetic login domain, never receives mail
  countryCode: '91'                      // WhatsApp link prefix
}
```

Everything else (name, logo, colour, offers, cooldown, stamp count, card length) lives in the database and is editable in the admin with no redeploy. **One client = one Vercel project from this same repo**, which in practice means a branch per client so `config.js` stays isolated. Only Cheesora Bliss is configured today.

---

## 10. Current live state (verified 5 Oct 2026)

- `https://royalty-prog.vercel.app` → 200 on `/`, `/admin/`, `/assets/*`; Deployment Protection off.
- Deployed `admin.js` parses clean; `.pv` preview CSS is served.
- `get_business('cheesora-bliss')` returns `stamp_url` (empty) and a **60,999-character logo data URL** — the logo upload did persist; it was invisible only because `mark()` rejected `data:` URLs (fixed in `9389b78`).
- Supabase project *Loyalty program* is `ACTIVE_HEALTHY`.
- Owner account: `keerthanswarup00@gmail.com` (per `new-client.sql`).

---

## 11. Findings & risks

### High

1. **Images are stored as base64 data URLs inside Postgres text columns.** A 300 KB file becomes a ~400 KB string in the `businesses` row, which is then re-downloaded on *every* page load of *every* customer, on mobile data. There is no CDN, no image resizing, no EXIF stripping, and no de-duplication. Two files on one row means one `select *` pulls both. **Move to Supabase Storage** (public bucket, `object-fit: cover` on the client) and keep only the path in the column.
2. **`genPw()` in `admin.js` uses `Math.random()`, not `crypto.getRandomValues()`** for the temporary customer passwords it hands to staff. `Math.random` is not a CSPRNG; those passwords are predictable in principle. The file's own comment claims "secure". One-line fix — `regen()` two functions below already does it correctly.
3. **No Content-Security-Policy, and two CDN scripts pinned only to a major version** (`supabase-js@2`) with no `integrity` attribute. Any upstream compromise or surprise minor release executes with full page privileges. Add SRI and a CSP (note: the code uses inline `onclick` handlers throughout, so a strict CSP needs `script-src 'unsafe-inline'` or a refactor to event delegation).
4. **The owner dashboard loads every member and every offer into the browser in one query** (`select *`, no pagination). PostgREST's default cap is 1,000 rows, so a busy shop silently loses customers from the list and the CSV export. Needs server-side pagination/filtering.

### Medium

5. **Anyone with the QR/NFC link can stamp their own card**, bounded only by `cooldown_min`. Setting it to 0 removes even that bound. This is inherent to tap-to-stamp; if it matters, verify the tap happens at the counter (geofence/NFC tag UID) rather than trusting the URL alone.
6. **No phone verification.** `join_business` accepts any 10-digit number, and `(business_id, phone)` is unique — so anyone who knows a customer's number can register first and lock the real person out of that business forever. Consider an OTP step before this becomes a live complaint.
7. **Account creation is unthrottled at the application layer.** Supabase rate-limits Auth, but nothing limits how many member rows a determined caller can create, which bloats the owner's customer table and skews stats.
8. **`mark()` accepts any string starting with `data:`** (and any string starting with `http`). Only the owner can set it and `<img src>` cannot execute script, so the practical risk is low — but tighten to `/^https?:\/\//` or `/^data:image\//`.
9. **No staff roles.** Every staff member holds full owner rights, including editing business settings, deleting customers and resetting passwords.
10. **No logging, monitoring or error reporting.** A broken RPC surfaces only as a toast. There is no way to answer "did it break for everyone or just me".
11. **Phone number and birthday are stored in plaintext** and every owner sees them. For an Indian deployment this is personal data under the DPDP Act — worth an explicit retention/deletion policy and a privacy notice on the join form.

### Low / cleanup

12. Phase 1 files (`app.js`, `config.js`, `style.css`, 196 lines) are dead weight in production and contain a demo PIN.
13. `loyalty-kit 2/` — untracked duplicate of an older revision; delete or gitignore it.
14. `.DS_Store` is tracked in git.
15. `visits` is written but never read; no analytics are derived from it.
16. Owner password reset depends on Supabase's Site URL + Redirect URLs being configured for the production domain, and on Supabase's built-in email sender (a few emails/hour). Unverified for this deployment — worth confirming end to end.
17. No tests, no linter, no formatter, no CI. The syntax error in `535bc9d` shipped to production and was only caught by a user report; `node --check assets/*.js` before every push would have caught it.
18. `supabase/.temp/` is untracked and not ignored.

---

## 12. Recommended order of work

**Now (hours)**
1. Replace `Math.random()` with `crypto.getRandomValues()` in `genPw()`.
2. Add `node --check assets/*.js` to the pre-push routine.
3. Delete `app.js`, `config.js`, `style.css` from the repo root; `git rm --cached .DS_Store`; add `loyalty-kit 2/` and `supabase/.temp/` to `.gitignore`.
4. Confirm the owner's "Forgot password?" email actually returns to `/admin/` in production.

**Next (days)**
5. Move logo and stamp images to a Supabase Storage bucket; store URLs, resize client-side to ~512 px, strip EXIF.
6. Paginate the customer table server-side and fix the CSV export to stream.
7. Add SRI to both CDN scripts and a CSP.
8. Add a staff role so counter staff can redeem without owner rights.

**Later**
9. OTP verification for phone numbers.
10. Error monitoring (Sentry or equivalent) and a `visits`-based analytics view.
11. A real test suite: SQL function tests via `pgTAP` or Supabase local, plus a Playwright smoke test of signup → stamp → redeem.

---

## 13. Handoff

### Run locally
Any static server from the repo root; there is no build:
```
npx serve .          # or: python3 -m http.server 8000
```
- Customer: `http://localhost:8000/`
- Owner: `http://localhost:8000/admin/`
- Supabase CORS must allow `http://localhost:8000` (it does by default in Supabase).

### Deploy
```
git add assets supabase README.md    # explicit paths; do NOT use "git add ." (.DS_Store, loyalty-kit 2/)
git commit -m "what changed"
git push                              # GitHub main
vercel deploy --prod --yes            # or let the Vercel Git integration do it
```
Afterwards re-point the alias if you deploy manually:
```
vercel alias set <new-deployment-url> royalty-prog.vercel.app
```

### Change the database
Schema changes are **not** applied by deploying. Paste into Supabase → SQL Editor → Run:
- `supabase/schema.sql` — full idempotent definition (safe to re-run, keeps data)
- `supabase/2026-10-05-stamp-image.sql` — the pattern to copy for future migrations
- `supabase/new-client.sql` — one insert per new client

I cannot execute SQL for you: the Supabase CLI has no run-SQL command and `supabase link` needs the database password.

### Add a new client
1. Supabase → Authentication → Users → **Add user** (owner email + password, *Auto Confirm User*).
2. Authentication → Sign In / Providers → Email → **Confirm email off** (customers have no inbox).
3. Edit and run `supabase/new-client.sql`.
4. Copy the repo into a new Vercel project; set `slug`, `supabaseUrl`, `supabaseKey` in `assets/config.js`.
5. Add a custom domain; set Supabase Site URL and add `https://<domain>/admin/` to Redirect URLs.

### Where things live
| Thing | Location |
|---|---|
| Supabase project ref | `qgechlsujyzgivwnvdwf` (name *Loyalty program*, `ap-south-1`) |
| Publishable key | `assets/config.js` (public, safe to ship) |
| Service-role key | **nowhere in this repo** — deliberately |
| Vercel project / alias | `loyalty-program` / `royalty-prog.vercel.app` |
| Owner login | `keerthanswarup00@gmail.com` |
| Per-client slug | `cheesora-bliss` |

### If you are taking this over
Read in this order: `README.md` → `assets/common.js` (64 lines, the whole shared vocabulary) → `supabase/schema.sql` sections 1–2 (tables, RLS) → `assets/customer.js` → `assets/admin.js`. The single most important invariant: **customers and staff never write to a table directly — every state change is a `SECURITY DEFINER` function, and those functions are where the business rules and the security checks live.**
