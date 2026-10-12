# SECURITY DEFINER Audit — Royalty

Date: 2026-10-12  
Repository: `keerthanswarup00-bot/loyalty-program`  
Scope: static review of active `supabase/*.sql` definitions and a read-only SQL catalog audit intended for a target Supabase database. No production database or deployment was accessed or modified.

## Findings

### 1. EXECUTE privileges are distributed across multiple SQL sections and migration files — high priority

The canonical `supabase/schema.sql` revokes EXECUTE from `PUBLIC`, `anon`, and `authenticated` for functions defined before its first grant block. Functions defined later rely on separate per-routine revoke/grant blocks. This can be safe, but it is easy for a future function or a standalone migration to omit a revoke: PostgreSQL grants EXECUTE to `PUBLIC` by default for newly created functions.

Several migration files created or replaced SECURITY DEFINER routines and then granted intended roles without an adjacent explicit revoke. For replacements, existing ACLs are preserved; if the routine is newly created in a partial/older database, the default PUBLIC grant can survive. This change adds explicit revokes in those migrations rather than relying on prior schema history.

### 2. SECURITY DEFINER search_path — fixed in source, but depends on schema privileges

All SECURITY DEFINER function definitions in the active root `supabase/*.sql` files declare a function-level `search_path`; the NFC join migration uses `SET search_path TO 'public'`. Several functions use unqualified relation names and rely on the searched schemas being trusted. In particular, `reset_member_password` searches `public, extensions, auth`.

The source alone cannot prove that deployed roles lack CREATE privileges on those schemas. The new catalog audit checks effective schema privileges and fails if `anon` or `authenticated` can create objects in a schema on a SECURITY DEFINER function's search path.

### 3. Effective ACLs cannot be inferred conclusively from repository files — runtime check added

The new `supabase/tests/security-definer-audit.sql` enumerates SECURITY DEFINER routines from `pg_proc`, reports their owner, search_path, effective EXECUTE ACL, and whether `anon`/`authenticated` can call them. It fails for missing or dynamic/temp search paths, PUBLIC EXECUTE, untrusted CREATE privileges on searched schemas, or EXECUTE grants to `anon`/`authenticated` outside the explicit allowlist.

The SQL file is read-only; it does not alter schema or application data. It must be run against the intended database to establish deployed-state results. That was **not** done as part of this change.

### 4. Static guard added to CI

`npm run check:sql-security` scans active root Supabase SQL files and fails if a SECURITY DEFINER header has no fixed `search_path`, includes `$user`/`pg_temp`, or lacks a visible subsequent EXECUTE revoke. The runtime catalog audit complements this source-level check; neither substitutes for the other.

## Changes made

- Added explicit `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` before intended grants in affected migrations for `get_business`, daily routines, `_do_stamp`, `join_business`, and `add_stamp`.
- Added `scripts/check-sql-security.js` and wired it into the existing GitHub Actions checks.
- Added `supabase/tests/security-definer-audit.sql` as a read-only target-database audit.
- No production database, credentials, Vercel settings, or live customer data were changed.

## Verification status

- Static source guard: **passed** in GitHub Actions on the current branch head (`7457252f353ecf8c049a91453c51e560613c1451`), scanning the active root SQL files. An earlier run failed because the scanner mishandled grouped revokes; the scanner was corrected and the current-head run passed.
- JavaScript syntax check: passed in the same workflow.
- Playwright smoke tests: skipped because `SMOKE_BASE_URL` is not configured.
- Runtime SQL catalog audit: not executed; requires a deliberate connection to the target Supabase project.
- Production state: unknown from this source-only pass.
