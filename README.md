# Loyalty Kit (Phase 2: shared backend)

Website at `/` (plus `/about/` and `/contact/`), customer app at `/app/`, owner dashboard at `/admin/`. One free Supabase database serves every client. Plain HTML/CSS/JS, no build step.

```
index.html            Innondu landing page (public site root)
app/index.html        customer app          assets/customer.js
admin/index.html      owner dashboard       assets/admin.js + assets/admin.css
assets/config.js      per-deployment settings (the only file you edit)
assets/common.js, style.css   shared
assets/vendor/        supabase-js and qrcode-generator, served from this site (no CDN)
supabase/schema.sql   run once        supabase/new-client.sql   run per client (single-shop deployments)
platform/index.html   all-shops admin       assets/platform.js
archive/              unused old code, kept for reference only (never deployed)
```

`archive/` holds the retired Phase 1 app (`app.js`, `config.js`, `style.css`) and an old
copy of the project. Nothing loads from it. `.vercelignore` keeps `archive/`, `supabase/`
and the docs out of the published site.

## One-time setup (about 10 minutes)

1. **Create a project** at supabase.com (free). Pick the region nearest your customers.
2. **Run the database:** SQL Editor -> New query -> paste `supabase/schema.sql` -> Run.
3. **Turn off email confirmation:** Authentication -> Sign In / Providers -> Email -> switch **Confirm email** off -> Save. (Customers sign in with phone + password, which is stored as an internal login address, so there is no inbox to confirm. Without this, joining fails.)
4. **Copy your keys:** Project Settings -> API -> note the Project URL and the anon / publishable key.

## Add a client

1. Authentication -> Users -> **Add user**: the owner's email + password, tick *Auto Confirm User*.
2. SQL Editor: open `supabase/new-client.sql`, change the slug, name and owner email, Run.
3. In `assets/config.js` set `supabaseUrl`, `supabaseKey` and `slug` (same slug as step 2).
4. Test locally (VS Code Live Server, open the folder root). Website: `/`, `/about/`, `/contact/`. Customer app: `/app/`. Owner: `/admin/`.
   Menu and the Contact form need one extra SQL run: `supabase/2026-10-11-menu-leads.sql` (already folded into `schema.sql` for new projects). Contact messages land in Table Editor -> `leads`. To show a WhatsApp button on the Contact page, set `WHATSAPP` in `assets/site.js`.

Branding, offers, cooldown, expiry, first stamp and card length are then edited by the owner in **/admin -> Offers and More** and apply to everyone instantly. No redeploy needed.

## Stamps, coupons and card validity

- **Joining:** **Home -> Sign-up QR** is the only way to join. Customers scan it, create their card and get the free first stamp. The page without the QR shows "scan the sign-up QR at the counter". The QR cannot add any later stamp, so photographing or enlarging it gains nothing.
- **Stamping:** every later stamp comes from the **NFC stamp tag** (NTAG213/215, free app "NFC Tools", URL record). Staff tap the customer's phone on the tag and a stamp is added after sign-in. One stamp per customer per cooldown period. If a tag link leaks, press **Regenerate stamp code** and rewrite the tags. Regenerate the sign-up code the same way if the QR leaks. The NFC tag can now also sign new customers up: tapping it opens the same join form, and the tap itself becomes their free first stamp. Regenerating the stamp code also disables sign-up through the tag.
- **Free first stamp:** a new member gets a stamp when they join (switch off in Offers -> Stamp card).
- **Coupon codes:** welcome, surprise and birthday offers and the full-card reward each get a unique 6-character code on the customer's card. Customers cannot use them by themselves.
- **Redeeming:** owner/staff open `/admin` -> **Redeem**, type the code (optionally the customer's phone to confirm it is theirs), press **Check coupon**, then **Confirm and mark as used**. A used code is dead for good and moves to the customer's History. The Redeem tab keeps a searchable log.
- **Full card:** the customer taps **Get my reward code**, which uses up the stamps and creates a Reward coupon. Staff redeem it the same way.
- **Birthday:** the coupon appears up to 7 days early but works only on the birthday date (business time zone), then expires.
- **Card validity:** Offers -> Stamp card -> "Each card lasts" (default 6 months from the customer's first stamp, 0 = never). An unfinished card past its end date restarts at zero and the customer is told. A full card never expires. Owners see "Card ends" per customer and get "Card ending" reminders.
- **Phone numbers:** exactly 10 digits. Spaces, dashes, `+91`, `91` and a leading `0` (including phone autofill) are cleaned automatically. Indian numbers must start with 6-9. Change `countryCode` in `config.js` for other countries.
- **Staff:** there are no separate staff logins yet. Staff use the owner login on the counter device.

**Updating an existing database:** just run `supabase/schema.sql` again. It is safe to re-run and keeps all data. Numbers saved earlier in `+91` or 12-digit form will not match the new 10-digit rule, so delete test accounts and sign up again.

## What's new and CSV import

- **What's new:** More -> What's new. A short note appears at the top of every customer's card until they press Got it. Editing it shows it again.
- **Import CSV:** Customers -> Import CSV (columns Name, Phone, Birthday, Current stamps, Total visits, Rewards redeemed; the Export CSV file works as a template). Imported customers wait until they join with that phone number through the sign-up QR, then get their stamps. Existing members are skipped.

## Refer a friend

More -> Refer a friend (off by default). Every customer gets a personal code (e.g. ASHA-4K7) on their card with a WhatsApp share button. A friend scans the sign-up QR at the counter, enters the code in "Friend's code" and gets the offer as a coupon. The customer gets the same coupon after the friend's next stamp at the NFC tag, so fake sign-ups earn nothing. Referrals never add stamps. A cap limits rewards per customer per 30 days. Customers who joined before you switched it on get a code automatically.

## Messaging customers on WhatsApp (admin -> Message)

- **Pick who:** a group (everyone, joined this week, visited this week, not visited in 30+ days, birthday this month, has an unused offer, card ending soon) or hand-pick. You can also tick customers in **Customers** and press **Message selected**.
- **Write once:** `{name}` becomes each customer's first name. Optional image link, rewards-card link and a "Reply STOP" line.
- **Opt-outs:** if someone replies STOP, press **Mark opted out** on their row in Customers. They are then left out of every group, the send queue, the contact export and the reminder buttons, and can be undone any time. Customers can also tap **Stop WhatsApp offers** at the bottom of their own card.
- **Send:** WhatsApp does not allow one web page to message many people, so **Start sending** opens each customer's chat with the message already typed. Press send in WhatsApp, come back, tap next. Nothing is sent without you pressing send.
- **One image to everyone at once:** download the contacts (.vcf), import them on your phone, create a WhatsApp **Broadcast list**, and send the image there. "Share image" and "Copy image" help when you attach a picture from your device.
- Fully automatic sending (no tapping) needs the paid WhatsApp Business Cloud API with approved templates. It is a separate integration.

## Images (logo and stamp)

Images are stored in a public Supabase Storage bucket called `brand` (one folder per business, up to 2 MB each), not inside the database. Re-run `supabase/schema.sql` once to create the bucket and its rules (only the business owner can write to their folder). Images saved earlier as inline data keep working; in **Offers -> Stamp image** (or **More -> Brand**) press **Move to storage** to convert them.

## Insights (owner analytics)

Home -> **Insights**: stamps per day and per week, a weekday-by-hour heatmap of busy times, 30-day retention and join-month cohorts, win-back results, and coupons issued against redeemed, for 30 days, 90 days or a year. Needs `supabase/2026-10-12-analytics.sql` (already in `schema.sql`). All times use the shop's own time zone.

Read the numbers honestly: "came back" counts a stamp after the sign-up day within 30 days of joining, and only people who joined 30+ days ago are counted. The win-back "stamped within 30 days" figure also includes people who would have returned anyway; the coupon-redeemed figure is the reliable one. Bulk WhatsApp sends from the Message tab are not logged, so they are not in the win-back numbers.

## Branding

More -> **Brand**: logo, colour ("Pick from logo" reads the dominant colour), corner style, heading font, header style, and a live preview. Needs `supabase/2026-10-12-branding.sql` for the look options (colour and logo work without it). Any colour stays readable: text on the colour switches between white and dark automatically, and where the colour is used as text it is darkened (light mode) or lightened (dark mode) until it reaches 4.5:1 contrast. The look is a fixed set of choices checked by the database, never free CSS, so a shop cannot inject markup into its customers' app.

## Many shops, one deployment

Instead of one Vercel project per client, one deployment can serve every shop; the database already keeps shops apart.

1. Run `supabase/2026-10-12-platform.sql` (already in `schema.sql`).
2. Make yourself platform admin, once: `insert into public.platform_admins (user_id) select id from auth.users where email = 'you@example.com';` (the account must exist: Authentication -> Users -> Add user).
3. In `assets/config.js` set `slug: ''` and `baseDomain: 'yourplatform.com'`.
4. In Vercel add the wildcard domain `*.yourplatform.com` to the project (needs the domain's nameservers on Vercel).
5. Open `/platform/`, sign in, press **Create shop**. The shop opens at `<address>.yourplatform.com` (customers at `/app/`, owner at `/admin/`).

### Path-based shops (no subdomain needed)

Every shop also opens at `/app/<slug>/` (customers) and `/app/<slug>/admin/` (owner), e.g. `innondu.com/app/cheesora-bliss`. `vercel.json` rewrites these to the same pages; the slug in the URL picks the shop. The shop named in `config.js` (`slug`) keeps its plain `/app/` and `/admin/` addresses, so printed tags, installed home-screen apps and logins keep working. Other shops keep their login and saved data separately by shop (storage keys are suffixed with the slug).

- **Supabase -> Authentication -> URL Configuration:** add `https://www.innondu.com/app/**` to Redirect URLs, otherwise setup and password-reset emails land on the Site URL.
- Turn "Confirm email" off (required by this app) and remember Supabase's built-in email sender is rate-limited.
- Local testing of `/app/<slug>` needs `vercel dev`; a plain static server does not apply rewrites (`?shop=<slug>` still works on localhost).
- Path-based shops share one browser origin, so isolation is weaker than with subdomains.
- `node scripts/check-routing.js` (npm run `check:routing`) tests the slug and path helpers.

### Adding a shop from `/platform/`

**New shop**: type the shop name and the owner's email, press **Create shop**. The address follows the name (editable), the owner account is created, and the owner gets an email to set their own password (or you set one under More options). You then see the owner link, the customer join link and its QR code to share. No SQL needed.

### Platform page (`/platform/`): running many shops

- **All shops:** search, sort (needs attention / most active / newest / name), and flags for shops that are quiet (no stamps for 14 days), have no customers, have no owner or have an overdue renewal. Search any customer by phone or name across every shop.
- **One shop:** numbers for the last 7 and 30 days, a customer list with search (WhatsApp link, reset a locked-out customer's password), CSV export of customers, every stamp and coupons (also your backup), private notes (plan, contact, renewal date), domains, owner change, and a password reset email to the owner.
- **Work as the owner:** "Open dashboard as owner" opens `/admin/?as=<shop>`. You get the full owner dashboard for that shop (offers, brand, menu, customers, Insights) using your platform login. A banner shows you are in support mode.
- **Accountability:** every support session, every change to shop settings (the field names), customer deletions, password resets, imports, exports, customer-list views and domain/owner changes are recorded. You see them in Activity log; the shop owner sees their shop's entries in More -> Support access. The log records what was done, not the customers' data.
- **Needs** the latest `supabase/schema.sql` (re-run it; it is safe). It extends every owner check to platform admins and adds the audit and notes tables.
- **Protect the platform login:** it can reach every shop's customers. Use a long unique password and turn on two-step verification for that Supabase account.

**Custom domains:** in `/platform/` add the domain to the shop, then add the same domain to the Vercel project and point the client's DNS at Vercel (CNAME `cname.vercel-dns.com`). Both steps are manual: the repo holds no Vercel token. A domain not added in `/platform/` shows "Shop not found".

Limits to know: platform admins cannot see a shop's customers, and cannot open a shop's dashboard unless they are its owner (use **Change owner** for support). There is no suspend switch: write functions do not check a paused flag, so a flag would only look like protection. Existing single-shop deployments keep working unchanged (leave `slug` set). Customer logins are keyed by shop address, so the same phone number can join several shops separately.

## Libraries

`assets/vendor/` holds supabase-js 2.117.2 and qrcode-generator 1.4.4, copied from npm, so the site loads no third-party scripts. To update one: download the new file from npm, put it in `assets/vendor/`, and change the `<script>` line in `index.html` / `admin/index.html`.

## Passwords

- **Owner forgot password:** "Forgot password?" on `/admin` emails a reset link. One-time setup: Supabase -> Authentication -> URL Configuration -> set **Site URL** to the client's domain and add `https://their-domain/admin/` (and `http://127.0.0.1:5500/admin/` for local tests) to **Redirect URLs**.
- **Customer forgot password:** customers have no real email, so the owner opens **Customers -> Reset password**, types a temporary password, and tells the customer. The customer signs in and uses **Change password** on their card.

## Reminders and home screen

- `/admin` -> Home -> **Reminders** lists birthdays in the next 7 days and offers ending within 3 days. Each row has a **WhatsApp** button that opens a ready-made message to that customer. Set `countryCode` in `config.js` (10-digit numbers get it added).
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
Vercel -> Add New -> Project -> import the repo -> Framework Preset **Other** -> Deploy. Update later with `git add index.html admin assets supabase README.md`, `git commit -m "what changed"`, `git push`.

**One client = one Vercel project** from the same code, each with its own `config.js` slug and its own domain (Project -> Settings -> Domains). They all share the one Supabase database. A branch per client keeps their `config.js` separate.

## Free-tier limits to know

- Supabase pauses a free project after about a week without activity. Open the dashboard to resume it. Fine for testing, not for live clients (Pro is $25/month per organisation, not per client).
- The anon key in `config.js` is public by design. The database rules in `schema.sql` are what keep each customer and owner to their own data.
- Passwords are handled by Supabase Auth (hashed, rate-limited). Supabase's built-in email sender is limited to a few emails per hour, which is plenty for owner resets.
- Reminders are manual (the owner taps WhatsApp). Automatic sending needs a paid WhatsApp/SMS service or web push, which is a later step.
- The admin loads all customers, 1,000 at a time.

## Daily scratch card (gamble system)
Run `supabase/2026-10-08-daily-gamble.sql` once in the Supabase SQL Editor (safe to re-run), then in the owner app go to More > Daily scratch card, set it On and press Save settings. The owner chooses the prizes and the chance of each (they add up to 100% or less; the rest is "no win"), the weekdays a prize can drop, the most prizes per customer per week (Monday to Sunday) and how long a won coupon is valid. Every customer can scratch once a day; the server picks the result.

## Win-back (come back)
Run `supabase/2026-10-08-winback.sql` once in the Supabase SQL Editor (safe to re-run) before the owner app is deployed. The **Come back** card at the top of Home lists customers who haven't visited in 10+ days (longest gone first) and shows how many were messaged in the last 30 days and how many came back. One tap on **Message** opens WhatsApp with a ready message containing a unique 6-character coupon. Three settings under More -> Win-back: *lapsed after (days)*, the *win-back offer* (blank switches the whole thing off), and *offer validity (days, 0 = never expires)*. A customer can only be messaged again after 14 days from the last win-back message. "Came back" means the customer collected a stamp after the message was sent. The coupon appears in the customer's Offers and redeems like any other code.
