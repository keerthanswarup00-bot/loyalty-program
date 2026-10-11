# Innondu / Loyalty Program — Codebase Audit Report

**Audit date:** 11 October 2026  
**Repository:** https://github.com/keerthanswarup00-bot/loyalty-program  
**Branch reviewed:** `main`  
**Reviewed commit:** `2066cc966b6c91b22889805c23965931589b3ffc`  
**Review type:** Static repository/code review, configuration review, and inspection of recent GitHub Actions status. Not a full live penetration test.

---

## 1. Executive summary

This is a vanilla HTML/CSS/JavaScript loyalty platform branded **Innondu**, with a customer rewards app and an owner dashboard backed by Supabase. It has grown from a straightforward stamp-card product into a wider retention toolkit: coupon issuance/redemption, referrals, daily scratch rewards, win-back campaigns, WhatsApp message preparation, menu management, a public marketing site, and contact lead collection.

**Overall assessment: feature-rich prototype / early production app, with meaningful controls already in place but important release and operational risks remaining.** The server-side SQL functions and row-level security are the strongest parts of the architecture. The largest immediate concern is not a confirmed single exploitable bug; it is the complexity of keeping the production database schema, one-off migrations, documentation, and test setup aligned as features are added quickly.

### Highest-priority observations

1. **CI is not currently providing a reliable green release gate.** Recent GitHub Actions runs shown in the repository API are failing. The available API did not expose job logs/results for those runs, so the cause is not confirmed. Diagnose the newest run before assuming it is an application failure.
2. **Schema/migration drift is a genuine maintenance risk.** The full schema includes newer menu/leads features, while the separate migration files remain necessary for an existing database. The project needs an explicit migration ledger and a clean-database test to prove that a new install and an upgraded install have equivalent objects and grants.
3. **The anonymous contact form's limit is global, not per client/IP.** The SQL counts all leads across the database for the last hour, so one burst of submissions can exhaust the shared allowance for every visitor. It also lacks a robust independent abuse-control layer.
4. **Menu image validation is permissive.** The SQL accepts any URL beginning with `https://` or a matching `data:image/...` prefix; it does not prove that an external URL is a safe image or that a data URL is within a meaningful decoded-size bound. Image sources should be validated and normalized on the server.
5. **Authentication is password-based, with no phone ownership verification.** This is explicitly acknowledged in the project documentation. A user who registers a phone number first can prevent the legitimate owner of that number from claiming it. Add OTP/verification before using this as a high-trust loyalty ledger.
6. **The app bundles large imperative JavaScript files and renders via HTML templates.** This is workable at the current scale, but it raises the change-risk: customer state, permissions UX, feature logic, rendering and event handlers live in large files and need stronger automated coverage.

### What looks good

- State-changing loyalty operations are largely performed through SQL RPC functions, not unrestricted browser-side writes.
- Database tables have row-level security and direct table privileges are restricted.
- Owner-only operations check the caller against the business owner.
- Coupon redemption is two-step (check then confirm) and is validated server-side.
- Daily scratch play locks the member row before checking whether the user has already played that day, helping serialize concurrent attempts.
- Temporary passwords use `crypto.getRandomValues` with rejection sampling in the current admin code.
- The app has a CSP and other security headers configured in `vercel.json`, and CDN scripts include SRI in the current HTML files.
- JS syntax checks, Playwright smoke tests, and a dedicated redirect/hash regression test exist in the repo.

---

## 2. Product and feature inventory

| Area | Implemented behaviour | Main code |
|---|---|---|
| Public marketing site | Home, About, Contact, product demo and shop enquiry form | `index.html`, `about/index.html`, `contact/index.html`, `assets/home.js`, `assets/site.js`, `assets/contact.js` |
| Customer app | Join/sign-in, stamp card, offers, rewards, profile/password changes, delete account, WhatsApp opt-out, install-to-home-screen behaviour | `app/index.html`, `assets/customer.js`, `assets/common.js` |
| Stamp collection | Sign-up QR token, later NFC stamp token, server-side cooldown, visit history | `assets/customer.js`, `assets/admin.js`, `supabase/schema.sql` |
| Rewards and coupon system | Welcome, birthday, surprise, daily, referral, win-back and full-card rewards; server-side validity and redemption | `assets/customer.js`, `assets/admin.js`, SQL RPC functions |
| Owner dashboard | Overview/statistics, customer search/sort/select, import/export CSV, redemption, offer/settings editors, brand settings | `admin/index.html`, `assets/admin.js`, `assets/admin.css` |
| Daily scratch card | Daily play limit, streak, configured prize chances, allowed weekdays, weekly win cap, coupon expiry | `assets/customer.js`, `supabase/2026-10-08-daily-gamble.sql`, `supabase/schema.sql` |
| Referrals | Customer code, friend sign-up attribution and delayed referrer reward after a real visit | `assets/customer.js`, `assets/admin.js`, `supabase/schema.sql` |
| Win-back | Find lapsed customers, create a one-time coupon and log message/return | `assets/admin.js`, `supabase/2026-10-08-winback.sql`, `supabase/schema.sql` |
| WhatsApp workflow | Pre-filled one-to-one message queue, groups, contact export, manual opt-out | `assets/admin.js`, `assets/common.js` |
| Menu | Owner CRUD and photo upload; customer list and item detail | `assets/admin.js`, `assets/customer.js`, `supabase/2026-10-11-menu-leads.sql`, `supabase/schema.sql` |
| Contact leads | Anonymous public form stores enquiries for the operator to review in Supabase | `assets/contact.js`, `supabase/2026-10-11-menu-leads.sql`, `supabase/schema.sql` |
| Branding/media | Business colour, logo, stamp image, menu images and public Storage bucket | `assets/admin.js`, `supabase/schema.sql` |
| Deployment/security | Static Vercel config, security headers/CSP, SRI, GitHub Actions | `vercel.json`, `.vercelignore`, `.github/workflows/smoke.yml` |

### Main business flow

1. A customer arrives through the join QR or NFC link, creates a phone-derived email/password account, and consents to join.
2. The database validates the join token and creates their business-specific member record; the optional first stamp and welcome offer are assigned.
3. A later NFC tap sends the stamp token to a server-side function, which checks membership and cooldown before recording the visit and applying surprise/referral logic.
4. The customer claims a reward when eligible. The server creates a coupon and updates the stamp balance.
5. Owner/staff verify a coupon in the dashboard, then confirm redemption.
6. Owners use customer segments and prepared WhatsApp messages for retention; customers can opt out.

---

## 3. Architecture and code map

### Runtime architecture

```text
Browser — public site       Browser — customer app       Browser — owner dashboard
 /, /about, /contact         /app/                        /admin/
       |                        |                             |
       +--------- static HTML/CSS/JS + Supabase JS ---------+
                                 |
                         Supabase Auth + PostgREST RPC
                                 |
                    PostgreSQL tables + RLS + SQL functions
                                 |
                  Supabase Storage (public brand media bucket)
```

There is no framework, compiler or bundler. Vercel serves static files; the browser talks directly to Supabase using a public publishable key. That key is not secret by design: database permissions, RLS and careful RPC authorisation are the security boundary.

### Active files

- `index.html`: marketing landing page and compatibility forwarding for legacy QR/NFC fragment URLs.
- `app/index.html`: customer-app document shell and dependency loading.
- `admin/index.html`: owner dashboard shell and dependency loading.
- `about/index.html`, `contact/index.html`: marketing pages.
- `assets/config.js`: per-deployment Supabase URL/key, business slug, synthetic login email domain and country calling code.
- `assets/common.js`: Supabase client setup, safe text escaping, shared form/icon helpers, phone normalization, messages and branding.
- `assets/customer.js`: customer authentication, join recovery, card/offer UI, stamping, daily scratch, menu/profile/opt-out and PWA behaviour.
- `assets/admin.js`: owner auth and dashboard, customer management, import/export, coupons, settings, campaign messages, menu and images.
- `assets/style.css`, `assets/admin.css`, `assets/site.css`, `assets/home.css`: application and marketing styles.
- `assets/contact.js`, `assets/site.js`, `assets/home.js`: contact submit, scroll reveal and interactive landing-page demos.
- `assets/vendor/`: vendored Supabase JS and QR generator are present, although the current app HTML loads SRI-pinned libraries from CDNs.
- `supabase/schema.sql`: consolidated, intended-to-be-rerunnable database setup and function definitions.
- `supabase/*.sql`: specific dated migrations/fixes; these must be treated as upgrade steps, not just documentation.
- `tests/`, `scripts/`, `.github/workflows/smoke.yml`: syntax checks, Playwright smoke tests and workflow.
- `archive/`: legacy/duplicate implementations; should stay excluded from the deployed site.

### Data model

The core entities are:

- `businesses`: owner, slug, branding, program rules, tokens and feature settings.
- `members`: customer per business, phone, birthday, stamps, counters, preferences, referral and daily-play state.
- `offers`: reward coupons and their validity/redemption lifecycle.
- `visits`: append-only stamp/visit audit trail.
- `messages`: win-back send/return tracking.
- `imports`: imported legacy stamp-card data waiting for a matching phone to join.
- `menu_items`: owner-managed public menu catalogue.
- `leads`: public website enquiries.

The SQL schema exposes tightly controlled reads and routes sensitive writes via `SECURITY DEFINER` functions. This is a good fit for a static client, but makes the correctness and privilege grants of each RPC especially important.

---

## 4. Findings by severity

Severity expresses business impact and urgency, not exploitability certainty. Static findings should be validated against a staging Supabase instance before a production migration is made.

### P1 — Fix before wider rollout

#### P1-01 — CI has repeated failures and the latest code has no visible green smoke result
**Evidence:** GitHub Actions metadata lists the recent push runs (including the reviewed commit) as `failure`; the available job endpoint returned no job details, so the specific failing step is unknown.

**Risk:** Broken syntax, test setup drift or a functional regression can merge/deploy without a dependable automated stop.

**Action:** Open the latest run in GitHub Actions and inspect the raw logs. Reproduce `npm ci`, `npm run check:js`, and the Playwright suite locally with a dedicated smoke business. Do not mark the release healthy based on a static read alone.

**Acceptance test:** Latest `main` commit has a green syntax job and a green smoke job; the smoke secrets refer only to a dedicated disposable test business.

#### P1-02 — Database bootstrap and migration state need a single verified source of truth
**Evidence:** `schema.sql` contains the newer menu/leads tables/functions and the current daily/win-back logic, while dated files separately change `join_business`, `_do_stamp`, daily rewards and messaging logic. The NFC join migration itself says it is based on the live function because the schema had drifted; the stamp fix states a stamping failure came from a reference to a missing `messages` table.

**Risk:** A clean database and an existing upgraded database can behave differently. The schema file can look current while production still has an older function, missing grants, or a different function body.

**Action:** Establish an explicit migration order/ledger. For every database change, use a forward migration in version control, apply it to staging, verify grants and signatures, then test production after backup. Generate or compare a schema dump to ensure `schema.sql` and the migration chain converge.

**Acceptance test:** A clean Supabase database built from the documented procedure and an upgraded copy from the current production schema have the same tables, constraints, RLS policies, functions, function definitions and grants.

#### P1-03 — Public contact lead endpoint is vulnerable to shared quota exhaustion
**Evidence:** `submit_lead` allows anonymous execution and limits submissions with a count of all rows from the last hour. It does not scope the throttle to a client, authenticated identity or IP/rate-limiter key.

**Risk:** An automated burst can consume the shared quota and block valid enquiries. The honeypot is client-side-only and cannot stop a direct call to the RPC.

**Action:** Put a server-side rate-limit/WAF or edge endpoint in front of it; apply independent limits and bot controls. If business-per-client isolation is intended, persist a tenant/source identifier and apply limits per tenant. Add retention/deletion rules for enquiry data.

**Acceptance test:** Automated bursts from one source do not block a legitimate enquiry from another source; malformed/spam submissions are throttled; ordinary form submission works.

#### P1-04 — Phone number ownership is not verified
**Evidence:** The sign-up flow uses a phone-derived synthetic email account; the SQL validates the number format and uniqueness, not possession of the number. Project docs already call out the lack of OTP.

**Risk:** Someone can claim another person's phone number first, causing account confusion or denial of legitimate membership. A phone is also used to match imported legacy customer records.

**Action:** Add OTP verification before finalizing a member record or allowing imported stamps to be claimed. Until then, clearly treat phone as an unverified identifier, not proof of identity.

**Acceptance test:** A number cannot be claimed or used to take over an imported balance without completing an ownership challenge.

#### P1-05 — Database privilege correctness is critical and not fully established by this static audit
**Evidence:** The architecture intentionally grants functions to roles and revokes other RPC execution. The full schema includes menu functions and a security-definer trigger; several one-off migrations alter grants or replace function definitions.

**Risk:** Missing grants can silently break features; excess `EXECUTE` grants on a security-definer function can bypass expected policy boundaries.

**Action:** In staging, enumerate `pg_proc.prosecdef`, function owners, `proconfig` search_path, execute grants, table grants and RLS policies. For every security-definer function, require a fixed safe `search_path`, explicit caller/tenant validation and tests for anonymous, customer A, customer B and owner calls.

**Acceptance test:** Permission test matrix passes for all public RPCs, all tenant-bound customer RPCs, and all owner-only RPCs. No customer can read/write another customer's records or act on another business.

### P2 — Important hardening and correctness work

#### P2-01 — Menu image validation permits arbitrary HTTPS links and large data URLs
**Evidence:** `save_menu_item` accepts images based on string prefix. The schema allows `image_url` values up to 600,000 characters. This does not confirm the remote content type or decoded size.

**Risk:** Broken/external tracking images, slow loads, oversized database rows and inconsistent image rendering. URL acceptance also makes image behaviour dependent on a third-party host.

**Action:** Prefer Storage object paths only. Enforce MIME and byte size through Storage; for data URL fallback, reject anything above a small size, validate base64 syntax, and only accept permitted raster MIME types. Avoid allowing arbitrary remote sources unless needed.

**Acceptance test:** Invalid URLs, unsupported MIME types and oversized images are rejected server-side; menu item thumbnails load reliably and are cacheable.

#### P2-02 — Customer-facing data relies on client-side template hygiene
**Evidence:** Rendering is performed using string templates and `innerHTML`. A shared `esc()` helper is present and many interpolations use it, but a single missed interpolation can become stored or reflected XSS.

**Risk:** An unsafe business field, menu text, coupon message or external content can inject markup/script in a privileged or customer session.

**Action:** Audit every `innerHTML` and HTML template interpolation, distinguish trusted constant markup from dynamic values, and use `textContent`/DOM APIs for new features where possible. Add security tests for quotes, angle brackets, event-handler payloads and `javascript:` URLs.

**Acceptance test:** Fuzz all user-controlled text fields and verify they render as text with no active element/event execution in both customer and owner contexts.

#### P2-03 — WhatsApp opt-out is implemented but still operationally manual
**Evidence:** The dashboard supports marking opt-outs and customers can turn offers off; the campaign builder excludes opted-out members. README says staff must manually mark people who reply STOP.

**Risk:** An inbound STOP message is not automatically ingested from WhatsApp. Staff can forget to update the record, and the interface cannot independently verify consent or that a queued message was actually sent.

**Action:** Until a provider integration exists, record the opt-out policy and train operators to update the dashboard immediately. Add audit events for consent changes and campaign preparation. Consider an official WhatsApp Business API integration if volume justifies it.

**Acceptance test:** Every opted-out customer is excluded from every segment, custom selection, queue, export and reminder workflow; re-opt-in is deliberate and recorded.

#### P2-04 — The “shared backend / one deployment per client” model is easy to misconfigure
**Evidence:** `assets/config.js` controls the business slug and Supabase connection; documentation recommends separate Vercel projects/branches per client. The database itself is multi-tenant.

**Risk:** A wrong slug can show the wrong brand; shared database errors can cross business boundaries if any RPC authorises only by slug without also scoping the signed-in user/member/owner.

**Action:** Move deployment settings into a validated manifest or build-time/deployment configuration, add startup checks for slug/project mismatch, and keep explicit tenant authorization inside every function. For future scale, consider a single app with server-resolved tenant configuration rather than many long-lived branches.

**Acceptance test:** Run tests for two businesses and two customer accounts; cross-business reads, stamping, claims, redemption, menu edits, image writes and exports all fail cleanly.

#### P2-05 — Manual WhatsApp sending and reminder records can be confused with delivery
**Evidence:** Message preparation uses `wa.me` links and client-generated text; win-back creates a coupon and logs a prepared message before the operator sends the WhatsApp message.

**Risk:** The dashboard may show a “message”/win-back event even if the user cancels the WhatsApp window or never presses Send. Return tracking remains useful but can overstate campaign delivery.

**Action:** Label the action as “Prepare message” in UI and reporting. If delivery status matters, only mark sent after a user confirmation, or integrate the official provider and ingest delivery webhooks.

**Acceptance test:** The log distinguishes prepared, manually confirmed sent, and returned after contact. Analytics do not describe prepared messages as provider-confirmed deliveries.

#### P2-06 — Customer list loads all business members in the dashboard
**Evidence:** `pages()` correctly paginates up to 100,000 records in 1,000-row batches, but then stores all members and joined offers in browser memory; messages are capped to 1,000 and the menu list has no explicit pagination (SQL caps new menu items at 300).

**Risk:** Performance, memory use, initial dashboard load time, and incomplete campaign message/return history can degrade as the business grows. A hard 100,000-row loop limit also means very large businesses will silently stop at that ceiling.

**Action:** Add server-side searching, filtering and pagination; load only data needed for the selected tab and dates. Add visible error states instead of suppressing optional-query errors.

**Acceptance test:** Dashboard start-up stays responsive with a large seeded dataset; counts and exports clearly cover all records; messages pagination is correct.

#### P2-07 — Contact lead rate limit has race and cleanup limitations
**Evidence:** Rate limiting is implemented as `count(*)` then `insert`, without a serialized counter/atomic limit. The leads table has no deletion/retention workflow in the app.

**Risk:** Concurrent bursts can exceed the threshold, and the table can accumulate personal contact information indefinitely.

**Action:** Use an atomic rate-limit mechanism (for example, a transactionally updated bucket keyed by source) and define retention/deletion. Add administrative viewing/export/delete controls or document a safe SQL operation for operators.

**Acceptance test:** Concurrency test enforces limits without overshoot; expired leads can be purged; authorised operators can fulfil deletion requests.

#### P2-08 — The CSP still allows inline script and remote dependencies
**Evidence:** `vercel.json` has a CSP, but `script-src` allows `'unsafe-inline'` to support inline event handlers, and allows two CDN origins. HTML includes SRI-pinned versions which is a good mitigation.

**Risk:** The CSP is less restrictive if an injection bug appears. SRI protects the pinned external script bytes, but inline handlers remain executable.

**Action:** Gradually replace inline `onclick` attributes with event listeners and consider nonce/hash-based script policy. Keep dependency versions explicit and automated updates reviewed.

**Acceptance test:** CSP report-only testing shows zero violations after event binding refactor; enforced policy works on customer, owner and marketing routes.

#### P2-09 — Imported customer records need stronger validation and reconciliation
**Evidence:** The import RPC processes chunks, normalizes some values, clamps counts and leaves unclaimed entries in `imports` until the matching phone joins. CSV parsing is handwritten in the browser.

**Risk:** Invalid dates/encoding, duplicate imports, unexpected cell formats or phone mismatch can result in skipped or surprising records. Since phone numbers are unverified, an incorrect claimant may receive imported balances.

**Action:** Add a dry-run import preview, detailed per-row error report, strict header/format checks and explicit confirmation. Combine with phone verification before transferring any balance.

**Acceptance test:** Representative CSV fixtures (BOM, quoted commas/newlines, CRLF, malformed quote, duplicate phones, bad dates) produce deterministic import results and a clear report.

#### P2-10 — Daily scratch business rules should be verified with boundary/concurrency tests
**Evidence:** The SQL uses row locking and server-side randomness, weekly limits and timezone calculations, which are good foundations. The schema also includes separate legacy `daily_offers/daily_win_pct` settings next to newer `daily_prizes`/weekday configuration for compatibility.

**Risk:** Day/week/timezone boundaries, old settings being migrated incorrectly, or differences between old and new deployments can lead to incorrect chances or cap behaviour.

**Action:** Keep one canonical prize config, explicitly document migration from legacy fields, and add SQL tests around midnight, week start, timezone, zero cap, 100% chance, no-win remainder and concurrent play attempts.

**Acceptance test:** 20 parallel plays yield exactly one accepted daily play per member/day; weekly cap is enforced across the intended Monday–Sunday boundary; probability totals behave as configured.

### P3 — Maintainability / product polish

#### P3-01 — Large scripts create high regression risk
The customer and owner scripts are tens of thousands of characters and mix rendering, state, side effects, data validation and event handling. Keep vanilla JS if that is a deliberate simplicity choice, but split by feature modules (auth, stamps, offers, campaigns, menu, settings) and introduce consistent boundary types/contracts.

#### P3-02 — Add static analysis and formatting
The repository has syntax checks, but no linter/formatter configuration is present. Add ESLint (or another chosen linter) and Prettier with a narrow, staged adoption rather than a full rewrite.

#### P3-03 — Dependency management is manual
The scripts are pinned and SRI protected, but updating the vendored copies or CDN copies manually can drift. Document which source is canonical and automate dependency/version/hash updates.

#### P3-04 — Archive/history is still mixed with the active project
The archive is correctly ignored for Vercel, but it is large enough to confuse code search and automated agents. Keep it for historical reference, but add a short `archive/README.md` and ensure test/syntax tooling deliberately includes or excludes it.

#### P3-05 — Operational observability is light
User-facing errors are mostly toasts and there is no clear central error tracking or alerting. Add structured, privacy-safe logging for failed RPCs, elevated error alerts and a simple health check that does not reveal secrets.

#### P3-06 — Accessibility needs full route-level testing
The code includes labels, status regions and reduced-motion checks. Still verify keyboard operation, focus management, modal focus trap, non-canvas alternatives for scratch-card play, text contrast, and mobile screen-reader use on every user route.

---

## 5. Confirmed strengths / checks already present

- **Security headers:** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS and CSP are set in `vercel.json`.
- **SRI:** current customer and admin HTML pin Supabase JS and QR code script with integrity hashes and `crossorigin`.
- **Public key handling:** the publishable key is expected to ship to browsers; do not confuse it with the Supabase service-role key. No service-role secret was observed in the inspected configuration.
- **Client data rendering:** a shared escaping helper is used frequently in the current HTML-template approach.
- **Password generation:** current `genPw()` uses `crypto.getRandomValues` and rejection sampling.
- **CSV export formula injection:** export prepends an apostrophe for cell values beginning with `=`, `+`, `-` or `@`.
- **Owner authority checks:** owner mutations such as menu writes, win-back message creation, coupon redemption, customer deletion/reset and imports check business ownership in SQL.
- **Daily play concurrency:** `play_daily` takes a row lock on the member before checking today’s play state.
- **Legacy route forwarding:** root marketing page forwards existing `#scan=` / `#join=` links into `/app/`; a dedicated Playwright spec exists for these redirect cases.

These are code/config observations, not a substitute for replaying tests against the live environment.

---

## 6. Testing status and gaps

### Existing tests/tools

- `npm run check:js`: syntax-checks tracked JavaScript via `node --check`.
- `npm run test:smoke`: Playwright tests for customer signup → login → stamp → claim reward → redeem; daily scratch; basic admin flow.
- `tests/redirect-hash.spec.js`: legacy QR/NFC fragment forwarding checks (comment says run explicitly, outside normal smoke workflow).
- `.github/workflows/smoke.yml`: push/manual workflow that runs syntax checks and the Playwright smoke suite when `SMOKE_BASE_URL` is configured.

### Immediate CI problem

Repository Actions metadata shows repeated failed runs, including the latest reviewed commit. The connector/API available during this audit did not return job details or logs, so the failing step is **unknown**. It would be inaccurate to claim the failure is definitely caused by missing secrets or by a test selector without logs.

### Recommended test suite additions

1. **RPC permission matrix:** anonymous, customer A, customer B, owner A, owner B.
2. **Stamps/rewards:** cooldown boundary, full card, carried-over stamps, expiry/reset behaviour, parallel stamp requests, concurrent double redemption.
3. **Daily scratch:** once/day in all timezones, weekly cap boundary, chance totals, disabled/off-day results, parallel requests.
4. **Join/referral/import:** invalid token, same-phone duplicate, invalid consent, referral self-credit attempts, import claiming and malformed CSV.
5. **Campaign consent:** opt-out exclusion from every channel; win-back logs distinguish preparation from sending.
6. **Media/menu/leads:** Storage upload ACLs, bad image input, oversized payloads, anonymous form abuse, retention/deletion.
7. **UI/accessibility:** mobile Safari/Chrome; keyboard-only navigation; reduced motion; screen readers; network failure/retry; PWA standalone launch.
8. **Migration:** construct a blank database and upgrade a copy using documented migrations, then compare schema/grants.

---

## 7. Recommended repo organisation

Do not reorganize or rename deployment-critical paths until tests pass. A low-risk structure for future cleanup is:

```text
/
├── index.html
├── about/
├── contact/
├── app/
├── admin/
├── assets/
│   ├── config.js
│   ├── common.js
│   ├── customer/       # proposed feature modules, gradual migration
│   ├── admin/          # proposed feature modules, gradual migration
│   ├── site/
│   └── vendor/
├── supabase/
│   ├── migrations/     # proposed ordered migration ledger
│   ├── schema.sql      # generated/verified baseline, not hand-edited separately
│   └── tests/
├── tests/
│   ├── smoke/
│   ├── security/
│   └── fixtures/
├── scripts/
├── docs/
│   ├── architecture.md
│   ├── deployment.md
│   ├── security-model.md
│   └── runbooks/
├── archive/
└── AUDIT-REPORT.md
```

Suggested rules:
- Keep the URL paths and the existing `assets/config.js` contract stable until the app can be regression-tested after the move.
- Use a sequential migration naming format such as `20261011_001_menu_and_leads.sql`, and track every applied migration.
- Never deploy SQL just because a frontend deploy succeeded; database changes need a separate staged migration and verification.
- Add CODEOWNERS/review rules for changes to `supabase/schema.sql`, security-definer functions, grants, tokens, and CSP.
- Keep production and smoke-test businesses separate; use synthetic customers and test-only credentials.

---

## 8. Prioritized execution plan

### First — release safety
- [ ] Inspect the newest failing Actions run and record its actual failing step.
- [ ] Make CI report syntax, smoke setup and Playwright results as distinct stages.
- [ ] Confirm the smoke workflow is configured with a dedicated test business, not customer production data.
- [ ] Deploy the current frontend to staging and replay signup, stamp, claim, redeem, daily play and menu functions.

### Second — database and security
- [ ] Reconcile live schema with `supabase/schema.sql` and all dated SQL changes.
- [ ] Run a role-by-role RPC/grant/RLS audit on staging and add automated permission tests.
- [ ] Add phone OTP before treating phone number as identity.
- [ ] Harden `submit_lead` abuse controls; create retention/deletion policy.
- [ ] Restrict menu images to validated Storage content and enforce size/type server-side.
- [ ] Audit every security-definer function, especially function grants and tenant scoping.

### Third — correctness and scale
- [ ] Add concurrency/boundary tests for stamp, redemption, daily play and win-back.
- [ ] Improve CSV import dry-run, validation and row-level result report.
- [ ] Load customers, offers, visits and messages on demand with search/filter pagination.
- [ ] Distinguish WhatsApp message prepared vs. sent in dashboard metrics.
- [ ] Add error monitoring and a privacy-safe operational runbook.

### Fourth — maintainability
- [ ] Gradually break large scripts into feature modules.
- [ ] Add linter/formatter and pull-request checks.
- [ ] Add route-level accessibility regression testing.
- [ ] Document client onboarding, restore/backup, migration, rollback and incident response.

---

## 9. Scope limits and confidence

**Inspected:** current main-branch tree, README, prior audit/handoff, current HTML entry points, configuration/CSP, key customer/admin JavaScript flows, schema functions and grants, recent migration files, tests and recent Actions-run metadata.

**Not performed:** live production database introspection, production RPC permission probes, browser-driven end-to-end run, dependency vulnerability scan, load test, or verification of the active Vercel deployment and production Supabase schema. Thus this report identifies code-level risks and testing priorities; it is not a certification that production is currently exploitable or that every feature is broken.

**Audit conclusion:** Keep the current architecture for now; do not start with a large framework rewrite. First make database migrations deterministic, get CI reliably green, and close the phone-verification/contact-abuse/media-validation risks. Then expand the security and business-rule test matrix before adding more features.
