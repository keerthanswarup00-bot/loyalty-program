import { test, expect } from '@playwright/test';

const required = [
  'SMOKE_BASE_URL',
  'SMOKE_ADMIN_EMAIL',
  'SMOKE_ADMIN_PASSWORD',
  'SMOKE_JOIN_URL',
  'SMOKE_STAMP_URL',
  'SMOKE_DAILY_ENABLED'
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(
      `Missing ${name}. Smoke tests must run against a dedicated test business. See README.md -> Automated smoke tests.`
    );
  }
}
if (process.env.SMOKE_DAILY_ENABLED !== '1') {
  throw new Error('SMOKE_DAILY_ENABLED must be 1. The dedicated smoke business must have Daily Scratch enabled.');
}

const BASE = process.env.SMOKE_BASE_URL.replace(/\/$/, '');
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
const JOIN_URL = process.env.SMOKE_JOIN_URL;
const STAMP_URL = process.env.SMOKE_STAMP_URL;
const CUSTOMER_PASSWORD = process.env.SMOKE_CUSTOMER_PASSWORD || 'SmokeTest!2026';
const CUSTOMER_NAME = process.env.SMOKE_CUSTOMER_NAME || 'Smoke Test Customer';
const PHONE_PREFIX = process.env.SMOKE_PHONE_PREFIX || '60000';

function randomPhone() {
  const tail = String(Date.now()).slice(-5);
  return PHONE_PREFIX + tail;
}

function urlWithHash(url, hash) {
  return url.includes('#') ? `${url}&${hash}` : `${url}#${hash}`;
}

async function loginAdmin(page) {
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: /owner dashboard/i })).toBeVisible();
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /^log in$/i }).click();
  await expect(page.getByText(/overview|customers|redeem/i).first()).toBeVisible();
}

async function loginCustomer(page, phone) {
  await page.goto(BASE + '/app/');
  await page.getByRole('button', { name: /login/i }).first().click();
  await page.getByLabel(/phone number/i).fill(phone);
  await page.getByLabel(/^password$/i).fill(CUSTOMER_PASSWORD);
  await page.getByRole('button', { name: /^login$/i }).last().click();
  await expect(page.getByText(/stamps/i).first()).toBeVisible();
}

test.describe('Royalty Program smoke tests', () => {
  test.describe.configure({ mode: 'serial' });

  test('customer signup → login → stamp → reward → redemption', async ({ page, browser }) => {
    const phone = randomPhone();

    // The join URL is the real QR/NFC-style URL and contains the join token.
    await page.goto(JOIN_URL);
    await expect(page.getByRole('heading', { name: /join the rewards club/i })).toBeVisible();

    await page.getByLabel(/full name/i).fill(CUSTOMER_NAME);
    await page.getByLabel(/phone number/i).fill(phone);
    await page.getByLabel(/^password/i).fill(CUSTOMER_PASSWORD);
    const consent = page.getByRole('checkbox');
    await consent.check();
    await page.getByRole('button', { name: /^join$/i }).click();

    await expect(page.getByText(/stamps/i).first()).toBeVisible();
    await expect(page.getByText(CUSTOMER_NAME.split(' ')[0], { exact: false })).toBeVisible();

    // Confirm a fresh login works after the signup session.
    await page.getByRole('button', { name: /profile/i }).click();
    await page.getByRole('button', { name: /sign out/i }).click();
    await loginCustomer(page, phone);

    // Stamp repeatedly until the card is full. The smoke business must have cooldown_min=0
    // and a small need value (recommended 2) so this remains fast and deterministic.
    const stampCount = Number(process.env.SMOKE_STAMP_COUNT || 2);
    for (let i = 0; i < stampCount; i++) {
      await page.goto(urlWithHash(STAMP_URL, ''));
      await expect(page.getByText(/stamp/i).first()).toBeVisible();
      await page.waitForTimeout(500);
    }

    await expect(page.getByRole('button', { name: /get my reward code/i })).toBeVisible();
    await page.getByRole('button', { name: /get my reward code/i }).click();

    const code = page.locator('.code').filter({ hasText: /^[A-Z0-9]{6}$/ }).last();
    await expect(code).toBeVisible();
    const rewardCode = (await code.innerText()).trim();
    expect(rewardCode).toMatch(/^[A-Z0-9]{6}$/);

    // Use a second browser context for the owner so customer and owner sessions are isolated.
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await loginAdmin(admin);

    await admin.getByRole('button', { name: /redeem/i }).click();
    await expect(admin.getByText(/redeem/i).first()).toBeVisible();

    // The redeem view has a single code field; locate it by its explicit label.
    const redeemInput = admin.getByLabel(/coupon code|code/i).first();
    await redeemInput.fill(rewardCode);
    await admin.getByRole('button', { name: /check coupon/i }).click();
    await expect(admin.getByText(/confirm and mark as used/i)).toBeVisible();
    await admin.getByRole('button', { name: /confirm and mark as used/i }).click();
    await expect(admin.getByText(/redeemed|marked as used/i)).toBeVisible();

    await adminContext.close();
  });

  test('daily scratch card', async ({ page }) => {

    await page.goto(JOIN_URL);
    await expect(page.getByRole('heading', { name: /join the rewards club/i })).toBeVisible();

    const phone = randomPhone();
    await page.getByLabel(/full name/i).fill(CUSTOMER_NAME);
    await page.getByLabel(/phone number/i).fill(phone);
    await page.getByLabel(/^password/i).fill(CUSTOMER_PASSWORD);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /^join$/i }).click();

    const daily = page.locator('#daily-scr');
    await expect(daily).toBeVisible();
    await expect(daily.getByRole('heading', { name: /today's scratch card/i })).toBeVisible();

    const canvas = daily.locator('canvas');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Pointer-down starts the server-side play. A few strokes reveal the card.
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.down();
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(
        box.x + box.width * (0.2 + (i % 6) * 0.13),
        box.y + box.height * (0.2 + Math.floor(i / 6) * 0.55)
      );
    }
    await page.mouse.up();

    await expect(page.locator('#daily-done, #daily-scr')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/come back tomorrow|no win today|you won|no prize today/i).first()).toBeVisible();
  });

  test('basic admin flow', async ({ page }) => {
    await loginAdmin(page);

    await page.getByRole('button', { name: /customers/i }).click();
    await expect(page.getByText(/customers/i).first()).toBeVisible();

    await page.getByRole('button', { name: /redeem/i }).click();
    await expect(page.getByText(/check coupon/i)).toBeVisible();

    await page.getByRole('button', { name: /more|settings/i }).click();
    await expect(page.getByText(/daily scratch card|stamp tag|brand/i).first()).toBeVisible();

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByRole('button', { name: /^log in$/i })).toBeVisible();
  });
});
