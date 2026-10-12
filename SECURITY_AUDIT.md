# Royalty / Loyalty Program — Security Hardening Audit

Date: 2026-10-12
Repository reviewed: `keerthanswarup00-bot/loyalty-program`
Scope of this pass: static review of the current `main` branch's README, shared browser helpers, customer/owner/platform JavaScript, Supabase schema and Vercel headers. This is not a live penetration test; findings must be validated against the deployed Supabase project and Vercel configuration.

## Immediate findings

### High priority — phone-based customer accounts have no proof of phone ownership
The README explicitly disables Supabase email confirmation because phone numbers are mapped to synthetic addresses such as `p.<phone>@members.example.com`. This means possession of a phone number is not verified by an OTP. Depending on the signup/join flow and existing data, someone may register a number they do not control or collide with an imported customer's identity. The six-character minimum password also falls below a sensible current baseline.
**Fix:** introduce real phone OTP verification (or a carefully controlled migration to Supabase Phone Auth); add account-claim safeguards for imported records; raise password policy; review recovery and account-enumeration behaviour before enabling.

### High priority — public contact endpoint has a global, easily exhausted limit
`submit_lead()` is callable by `anon` and limits all submissions together to 30 rows in the previous hour. There is no per-IP / per-session / per-contact rate limit or CAPTCHA visible in the SQL/JS. A single caller can exhaust the shared limit and block legitimate enquiries for everyone.
**Fix:** apply edge-level rate limiting (e.g. Vercel/Edge/WAF or a server-side limiter), per-source throttling, payload limits and bot protection; avoid trusting browser-only controls. Confirm the endpoint is not exposing unnecessary database error detail.

### High priority — Content Security Policy is weakened by inline execution and broad sources
`vercel.json` sets `script-src 'self' 'unsafe-inline'` and permits multiple external script CDNs, while `img-src` allows all HTTPS origins. This reduces CSP's ability to contain injected script or remote content. The policy also lacks a nonce/hash-based script strategy.
**Fix:** inventory actual resource requirements, self-host dependencies where possible, remove unused CDN origins, migrate inline handlers/scripts to external files or nonces/hashes, restrict image hosts, and add a tested CSP report-only rollout before enforcement changes.

### High priority — security-sensitive SQL must be audited by effective privileges, not just RLS
The schema uses many `SECURITY DEFINER` RPCs and correctly includes a broad function-execute revocation plus explicit grants in several places. However, PostgreSQL's default execute privileges apply to newly created functions; a revoke of “all functions” does not automatically protect functions created later in the script. The later menu, contact, analytics, and platform sections add their own grants/revokes, so the complete effective privilege set must be checked after the schema is applied. Any omitted revoke/grant pair can expose a privileged function to `PUBLIC`.
**Fix:** query `pg_proc`/`information_schema.routine_privileges` on the actual project, enumerate every SECURITY DEFINER routine, and explicitly revoke execute from `PUBLIC`/ `anon` before granting only intended roles. Keep fixed `search_path` and qualify sensitive object references in every definer function. Add a CI test that fails when a privileged function has unintended grants.

### High priority — privileged platform/support flows need adversarial tests
The platform dashboard supports cross-business customer lookup, exports, password resets, owner changes and support-as-owner. The SQL includes checks and audit logging, but these flows are high impact and should be tested with at least two ordinary business owners and a non-admin user. Verify both direct RPC calls and direct PostgREST table requests—not only the UI. Confirm no platform admin can be created through a browser-accessible RPC and that support sessions are logged even when errors occur.
**Fix:** test role escalation, cross-tenant ID substitution, owner reassignment, customer password reset, data export, support-mode access, and audit-log tampering.

## Additional hardening work

- **RLS / tenant isolation:** prove every tenant-owned table and view has RLS enabled, no permissive policy broadens access, and every RPC checks the authenticated user and business ownership. Include `imports`, `menu_items`, `menu_categories`, `messages`, `visits`, `offers`, `members`, `businesses`, platform audit/meta tables, and Storage objects.
- **Reward integrity:** test concurrent stamp requests, duplicate coupon redemption, replayed QR/NFC URLs, token regeneration, expired cards, referral caps and daily scratch limits. Confirm token secrecy assumptions are explicit: QR/NFC URLs are bearer tokens and can be copied; cooldowns alone do not prove a real physical tap.
- **Account recovery:** test password reset redirects on the production domain, expired/reused links, session invalidation after password change, account deletion and imported-customer claiming.
- **Storage uploads:** MIME allowlists and a 2 MB limit are helpful but do not prove actual file content. Test spoofed MIME, oversized payloads, SVG/HTML uploads, filename/path traversal, overwrite behaviour and owner-folder isolation. Keep public bucket contents strictly non-sensitive.
- **Public data RPCs:** review exactly what `get_business`, `get_menu`, `daily_public` and `resolve_host` return. Ensure they never return private identifiers, customer data, join/scan tokens or owner metadata.
- **Input/output safety:** audit every `innerHTML` sink and inline event handler; confirm untrusted data is escaped at every insertion point, URL schemes/hosts are allowlisted, and redirects are restricted. Verify HTML content in menu descriptions and image URLs cannot become script execution.
- **Authentication/session:** browser Supabase anon/publishable key is expected to be public; it is not a secret. Security depends on RLS and RPC checks. Never ship a service-role key. Test session persistence, logout, recovery, and stale cross-role sessions on shared devices.
- **Privacy and messaging:** confirm customer consent, WhatsApp opt-out enforcement, least-privilege CSV exports, retention/deletion rules, and that logs do not contain passwords or sensitive contact details.
- **Operational controls:** enable GitHub secret scanning and dependency alerts; pin GitHub Actions to immutable SHAs where practical; protect `main`; require CI and review; keep production and smoke-test accounts/data separate; never run destructive tests against real customer data.
- **Security headers:** retain frame denial, nosniff, referrer policy and HSTS, then verify deployed headers and add a carefully tested Permissions Policy and CSP. Consider `X-Content-Type-Options`, `Cross-Origin-Opener-Policy`, and `frame-ancestors` consistency. Do not add headers blindly if they break Supabase auth or app flows.
- **Monitoring:** create safe audit events for stamp issuance, coupon redemption, failed authorization, token regeneration, account recovery and admin actions; add alerting for unusual bursts and repeated failures.

## Verification status

- Reviewed current source files in GitHub; this was a source-level review only.
- Existing CI workflow validates JavaScript syntax. Live Playwright tests are conditional on `SMOKE_BASE_URL`; when it is absent, live tests are skipped.
- No live database queries, live deployment scans, credential tests, or end-to-end tests were performed in this pass.
- Do not treat the application as security-certified until effective Supabase grants/RLS, production headers, and full end-to-end flows have been tested.

## Recommended order

1. Verify effective database grants and tenant isolation in the actual Supabase project.
2. Add adversarial RPC/RLS tests for customer, owner, and platform-admin roles.
3. Fix phone ownership verification and account recovery.
4. Replace the global contact limit with edge-level abuse controls.
5. Tighten CSP and validate uploads/HTML sinks.
6. Run full signup → stamp → reward → redemption and daily-scratch E2E tests against a dedicated staging project.
7. Re-run production checks, document residual risks, then merge reviewed changes.
