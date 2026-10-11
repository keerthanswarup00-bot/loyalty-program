# Contact form rate limiting

The public contact form must call the Supabase Edge Function `submit-lead`, not the database RPC directly. The Edge Function reads the request IP at the platform edge, HMACs it with a server-only secret, and calls the database function using the service-role key. The raw IP is not stored.

## Deploy

1. Apply `supabase/2026-10-11-lead-rate-limit.sql` in the correct Supabase project's SQL Editor. Back up the project first.
2. Install/upgrade the Supabase CLI and link this repository to the intended project.
3. Generate a strong random secret (at least 32 characters) and store it only as an Edge Function secret. Example from a terminal:

   ```sh
   openssl rand -hex 32
   supabase secrets set LEAD_RATE_LIMIT_SECRET=PASTE_GENERATED_VALUE
   supabase functions deploy submit-lead
   ```

   The platform supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never put the service-role key or HMAC secret in `assets/config.js`, frontend JavaScript, or Git.
4. Deploy the updated static site so `assets/contact.js` calls `/functions/v1/submit-lead`.
5. Test one successful submission, invalid fields, six submissions from the same IP within 15 minutes (the sixth should return HTTP 429), and confirm direct browser RPC calls to the old four-argument `submit_lead` function fail.

## Limits

- 5 attempts per IP per 15-minute bucket.
- 20 attempts per IP per hour.
- 200 attempts total per hour as a global emergency ceiling.

Rate-limit keys are HMAC-SHA256 values; raw IPs are not persisted. Counters older than two days can be deleted safely. For privacy, update the site's privacy notice if it describes contact-form processing and retention.

## Operational notes

The global ceiling protects against large bursts but is intentionally conservative; raise it if normal traffic approaches 200 submissions/hour. The SQL migration is designed for the existing hand-managed schema. After the canonical migration workflow is adopted, move this SQL into the timestamped `supabase/migrations/` history after reconciling the production baseline.
