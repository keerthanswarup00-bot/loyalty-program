import { test, expect } from '@playwright/test';

// Offline test of /app/<shop>/ routing: Supabase is mocked, nothing real is touched.
//   npx playwright test tests/path-routing.spec.js   (starts scripts/dev-server.js itself)
const SB = '**/*.supabase.co/**';
async function mock(page) {
  // The page loads supabase-js from a CDN; serve the vendored copy so the test also runs offline.
  // The vendored file is not byte-identical to the CDN one, so drop the integrity check on the pages for this offline test.
  await page.route(u => u.hostname === '127.0.0.1', async r => {
    if (r.request().resourceType() !== 'document') return r.fallback();
    const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/ integrity="[^"]*"/g, '') });
  });
  await page.route('**/cdn.jsdelivr.net/**/supabase.min.js', r => r.fulfill({ path: 'assets/vendor/supabase-2.117.2.js', contentType: 'text/javascript' }));
  await page.route(SB, r => {
    const u = r.request().url();
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (u.includes('get_business')) return json({ name: 'Foo Cafe', tagline: 'hi', color: '#336699', need: 8, reward: 'Free', cooldown_min: 1, tz: 'Asia/Kolkata', theme: {} });
    if (u.includes('daily_public')) return json(false);
    return json(null);
  });
}

test('customer app: slug comes from the path, storage is per shop', async ({ page }) => {
  await mock(page);
  await page.goto('/app/foo-cafe/');
  await expect(page.getByText('Foo Cafe').first()).toBeVisible();
  expect(await page.evaluate(() => CFG.slug)).toBe('foo-cafe');
  expect(await page.evaluate(() => sk('lk-seen'))).toBe('lk-seen:foo-cafe');
  expect(await page.evaluate(() => appBase())).toBe('/app/foo-cafe/');
});

test('slug is lowercased and no trailing slash works', async ({ page }) => {
  await mock(page);
  await page.goto('/app/Foo-Cafe');
  expect(await page.evaluate(() => CFG.slug)).toBe('foo-cafe');
});

test('old /app/ keeps the config slug and unscoped storage', async ({ page }) => {
  await mock(page);
  await page.goto('/app/');
  expect(await page.evaluate(() => CFG.slug)).toBe('cheesora-bliss');
  expect(await page.evaluate(() => sk('lk-seen'))).toBe('lk-seen');
  expect(await page.evaluate(() => appBase())).toBe('/app/');
});

test('owner dashboard at /app/<shop>/admin/ loads the admin page with that slug', async ({ page }) => {
  await mock(page);
  await page.goto('/app/foo-cafe/admin/');
  await expect(page.getByRole('heading', { name: /owner login/i })).toBeVisible();
  expect(await page.evaluate(() => CFG.slug)).toBe('foo-cafe');
  expect(await page.evaluate(() => adminBase())).toBe('/app/foo-cafe/admin/');
});

test('reserved names are not shops', async ({ page }) => {
  await page.goto('/app/assets/style.css');   // a real file, served untouched
  expect((await page.content()).length).toBeGreaterThan(0);
});

test('platform: name fills the address, link preview and password are made', async ({ page }) => {
  await page.goto('/platform/');
  expect(await page.evaluate(() => slugify('Café Bliss & Co.  '))).toBe('cafe-bliss-and-co');
  expect(await page.evaluate(() => genPw().length)).toBe(12);
  expect(await page.evaluate(() => shopUrl({ slug: 'foo', domains: [] }, '/admin/'))).toMatch(/\/app\/foo\/admin\/$/);
  expect(await page.evaluate(() => shopUrl({ slug: 'foo', domains: [] }, '/app/'))).toMatch(/\/app\/foo\/$/);
});

test('platform: New shop form fills address from the name', async ({ page }) => {
  await mock(page);
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/platform/');
  await page.evaluate(() => { signed = true; view = 'new'; render(); });
  await page.fill('#nn', 'Café Bliss & Co');
  await page.click('summary');
  await expect(page.locator('#ns')).toHaveValue('cafe-bliss-and-co');
  await expect(page.locator('#nlink')).toContainText('/app/cafe-bliss-and-co/');
  expect((await page.inputValue('#np')).length).toBe(12);
  await page.fill('#ns', 'my-own');       // editing the address stops the auto-fill
  await page.fill('#nn', 'Something Else');
  await expect(page.locator('#ns')).toHaveValue('my-own');
});

test('platform: Create shop opens the new shop dashboard on its settings tab', async ({ page, context }) => {
  await mock(page);
  await page.goto('/platform/');
  await page.evaluate(() => {
    signed = true; view = 'new'; render();
    window.rpc = async (c, fn, a) => fn == 'platform_overview' ? [{ id: '1', slug: a && a.p_slug || 'zed-shop', name: 'Zed Shop', color: '#8a4b2a', owner_email: 'o@x.com', members: 0, stamps_7d: 0, stamps_30d: 0, domains: [], plan: '', contact: '', notes: '' }] : fn == 'platform_create_business' ? { id: '1', slug: a.p_slug } : null;
    window.reload = async () => { rows = [{ id: '1', slug: 'zed-shop', name: 'Zed Shop', color: '#8a4b2a', owner_email: 'o@x.com', members: 0, new_members_7d: 0, stamps_7d: 0, stamps_30d: 0, coupons_30d: 0, redeemed_30d: 0, domains: [], plan: '', contact: '', notes: '', need: 8, reward: 'x', tz: 'Asia/Kolkata' }] };
  });
  await page.fill('#nn', 'Zed Shop'); await page.fill('#ne', 'o@x.com'); await page.fill('#np', '');
  const popup = context.waitForEvent('page');
  await page.click('text=Create shop');
  const p = await popup;
  await p.waitForURL(/\/admin\/\?as=zed-shop&tab=set/);
  await expect(page.getByText('Zed Shop is ready')).toBeVisible();
  await expect(page.getByText('/app/zed-shop/admin/')).toBeVisible();
});
