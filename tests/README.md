# Royalty Program smoke tests

These tests are intentionally end-to-end. They should run against a **dedicated smoke-test business**, never a real customer's production business.

## Required environment

- `SMOKE_BASE_URL` — deployed customer URL, for example `https://smoke.example.com`
- `SMOKE_ADMIN_EMAIL` — owner email for the smoke business
- `SMOKE_ADMIN_PASSWORD` — owner password
- `SMOKE_JOIN_URL` — complete signup URL copied from the owner's generated QR
- `SMOKE_STAMP_URL` — complete NFC/stamp URL
- `SMOKE_CUSTOMER_PASSWORD` — optional; defaults to `SmokeTest!2026`
- `SMOKE_PHONE_PREFIX` — optional 5-digit prefix; defaults to `60000`
- `SMOKE_STAMP_COUNT` — optional; defaults to `2`
- `SMOKE_DAILY_ENABLED` — set to `1` only when Daily Scratch is enabled for the smoke business

## Smoke-business settings

For the customer lifecycle test:

1. Set the stamp requirement to the same value as `SMOKE_STAMP_COUNT` (recommended: **2**).
2. Set stamp cooldown to **0 minutes**.
3. Keep the join QR and NFC/stamp link stable while the tests run.
4. Use a dedicated database/business/customer namespace.

For Daily Scratch:

1. Run the current Daily Scratch SQL migration first.
2. Turn Daily Scratch **On**.
3. Select every weekday, or ensure the current weekday is selected.
4. Add at least one prize with a non-zero chance.
5. Keep the weekly cap above 0.

The test creates a fresh customer on each run. Use a dedicated test business so repeated runs do not affect real customers.

## Local run

Install dependencies and browsers:

```bash
npm install
npx playwright install chromium
```

Run:

```bash
SMOKE_BASE_URL=https://smoke.example.com \
SMOKE_ADMIN_EMAIL=owner@example.com \
SMOKE_ADMIN_PASSWORD='...' \
SMOKE_JOIN_URL='https://smoke.example.com/#join=...' \
SMOKE_STAMP_URL='https://smoke.example.com/#scan=...' \
SMOKE_STAMP_COUNT=2 \
SMOKE_DAILY_ENABLED=1 \
npm run test:smoke
```

## GitHub Actions

Add the same values as repository secrets:

- `SMOKE_BASE_URL`
- `SMOKE_ADMIN_EMAIL`
- `SMOKE_ADMIN_PASSWORD`
- `SMOKE_JOIN_URL`
- `SMOKE_STAMP_URL`
- `SMOKE_CUSTOMER_PASSWORD`
- `SMOKE_PHONE_PREFIX`
- `SMOKE_DAILY_ENABLED`

The workflow runs on pushes to `main` and can also be started manually.

**Important:** do not put real production owner passwords or real customer data in the repository. Use a dedicated smoke owner/business.
