# Supabase database migrations

## Source of truth

- **Canonical migration history:** `supabase/migrations/`
- **Local Supabase configuration:** `supabase/config.toml`
- **Compatibility snapshot:** `supabase/schema.sql`
- **Legacy hand-run SQL:** the dated `supabase/*.sql` files outside `migrations/`. These document earlier manual deployments. Do not run them as a second migration stream.

The initial migration, `20261011000000_initial_schema.sql`, captures the current schema snapshot so a fresh database can be rebuilt from version control. Every schema change after this baseline must be a new, timestamped migration in `supabase/migrations/`; never edit a migration that has already been applied to a shared database.

## New project

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Review the target project and CLI output before applying changes. The baseline is intended to be idempotent, but first-time provisioning should still be done against a new project before using this process for production.

## Existing production project (important)

The production database may have been provisioned by pasting SQL into the Supabase SQL Editor. In that case, its migration-history table may not contain this baseline even if the schema already exists. **Do not blindly run `supabase db push` against production.**

1. Take a fresh database backup/snapshot and confirm you can restore it.
2. Link the CLI to the intended project: `supabase link --project-ref YOUR_PROJECT_REF`.
3. Inspect migration history: `supabase migration list --linked`.
4. Compare the live schema with the baseline and review every difference. Check tables, columns, indexes, RLS policies, grants, triggers, and function definitions—not just table names.
5. Only if the live database is verified to match the baseline, record the baseline as already applied:

   ```sh
   supabase migration repair --status applied 20261011000000 --linked
   supabase migration list --linked
   ```

6. If the live schema differs, do not mark the baseline applied and do not push it blindly. Create a reviewed reconciliation migration (or safely restore the missing schema) first, then verify the result against a backup/staging copy.

This repository-only change cannot verify or alter the live production database because it does not have a database connection or credentials. The production reconciliation step must be run by an authorized operator with access to the correct Supabase project.

## Day-to-day workflow

1. Create a new migration: `supabase migration new descriptive_change`.
2. Put only the incremental SQL change in the generated file under `supabase/migrations/`.
3. Test locally: `supabase start` then `supabase db reset`. This rebuilds a clean local database from the complete migration history.
4. Review the SQL, especially destructive statements, RLS/policies, grants, and security-definer functions.
5. Open a PR. The Database migrations GitHub Actions workflow starts a local Supabase instance, applies all migrations to a fresh database, and runs the database linter.
6. After review and backup, apply pending migrations to the intended linked environment with `supabase db push`. Never use the production database as the first test environment.

## Existing dated SQL files

The dated SQL files directly under `supabase/` are retained for audit/history and compatibility with earlier manual setup instructions. Do not add new files there. After production is reconciled to the baseline, all subsequent changes must live only under `supabase/migrations/`.
