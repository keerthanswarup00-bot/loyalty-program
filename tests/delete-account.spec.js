import { test, expect } from '@playwright/test';

// End-to-end proof for "Delete my account": a customer signs up, deletes themselves
// from the profile screen, and is then unable to log in again (their auth user is gone).
// Runs against a real business, so it is skipped unless the smoke env vars are provided.
const BASE = (process.env.SMOKE_BASE_URL || '').replace(/\/$/, '');
const JOIN_URL = process.env.SMOKE_JOIN_URL;
const CUSTOMER_PASSWORD = process.env.SMOKE_CUSTOMER_PASSWORD || 'SmokeTest!2026';
const CUSTOMER_NAME = process.env.SMOKE_CUSTOMER_NAME || 'Delete Test Customer';
const PHONE_PREFIX = process.env.SMOKE_PHONE_PREFIX || '60001';

function randomPhone() {
  return PHONE_PREFIX + String(Date.now()).slice(-5);
}

test.describe('customer deletes their account', () => {
  test.skip(!BASE || !JOIN_URL, 'Set SMOKE_BASE_URL and SMOKE_JOIN_URL to run this test.');

  test('account is really deleted and the session is cleared', async ({ page }) => {
    const phone = randomPhone();

    await page.goto(JOIN_URL);
    await expect(page.getByRole('heading', { name: /join the rewards club/i })).toBeVisible();
    await page.getByLabel(/full name/i).fill(CUSTOMER_NAME);
    await page.getByLabel(/phone number/i).fill(phone);
    await page.getByLabel(/^password/i).fill(CUSTOMER_PASSWORD);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /^join$/i }).click();

    await expect(page.getByText(/stamps/i).first()).toBeVisible();

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /profile/i }).click();
    await page.getByRole('link', { name: /delete my account/i }).click();

    await expect(page.locator('.toast')).toContainText(/account was deleted/i);

    // The app returns to the signup screen and forgets the remembered number.
    await expect(page.getByRole('heading', { name: /join the rewards club/i })).toBeVisible();
    const stored = await page.evaluate(() => {
      try { return localStorage.getItem('lk-phone'); } catch (e) { return 'unreadable'; }
    });
    expect(stored).toBeFalsy();

    // The deleted account can no longer log in.
    await page.getByRole('button', { name: /login/i }).first().click();
    await page.getByLabel(/phone number/i).fill(phone);
    await page.getByLabel(/^password$/i).fill(CUSTOMER_PASSWORD);
    await page.getByRole('button', { name: /^login$/i }).last().click();
    await expect(page.locator('.toast')).toContainText(/incorrect phone number or password|no account found/i);
  });
});
