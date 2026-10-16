import { test, expect } from '@playwright/test';

// Offline test of /connect/<shop>/ (and the ?shop= fallback): Supabase is mocked, nothing real is touched.
//   npx playwright test tests/connect-page.spec.js   (starts scripts/dev-server.js itself)
const SB = '**/*.supabase.co/**';
const BIZ = {
  name: 'Cheesora Bliss', tagline: 'Cheesecakes & coffee', color: '#7a4a2b', logo_url: '',
  ig: 'https://instagram.com/cheesorabliss', fb: 'https://facebook.com/cheesorabliss',
  wa: 'https://wa.me/919876543210', web: 'https://cheesorabliss.example'
};
async function mock(page, biz = BIZ) {
  // The page loads supabase-js from a CDN; serve the vendored copy so the test also runs offline.
  // The vendored file is not byte-identical to the CDN one, so drop the integrity check on the pages for this offline test.
  await page.route(u => u.hostname === '127.0.0.1', async r => {
    if (r.request().resourceType() !== 'document') return r.fallback();
    const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/ integrity="[^"]*"/g, '') });
  });
  await page.route('**/cdn.jsdelivr.net/**/supabase.min.js', r => r.fulfill({ path: 'assets/vendor/supabase-2.117.2.js', contentType: 'text/javascript' }));
  await page.route('**/cdnjs.cloudflare.com/**/qrcode.min.js', r => r.fulfill({ path: 'assets/vendor/qrcode-generator-1.4.4.js', contentType: 'text/javascript' }));
  await page.route(SB, r => {
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (r.request().url().includes('get_business')) return json(biz);
    return json(null);
  });
}

test('connect page: /connect/<slug> shows the shop and every link', async ({ page }) => {
  await mock(page);
  await page.goto('/connect/cheesora-bliss/');
  await expect(page).toHaveTitle('Cheesora Bliss · Connect');
  await expect(page.getByRole('heading', { name: 'Cheesora Bliss' })).toBeVisible();
  await expect(page.getByText('Cheesecakes & coffee')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join rewards' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Menu' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', BIZ.ig);
  await expect(page.getByRole('link', { name: 'Facebook' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', BIZ.wa);
  await expect(page.getByRole('link', { name: 'Website' })).toHaveAttribute('href', BIZ.web);
});

test('connect page: Join rewards and Menu point at this shop', async ({ page }) => {
  await mock(page);
  await page.goto('/connect/cheesora-bliss/');
  await expect(page.getByRole('link', { name: 'Join rewards' })).toHaveAttribute('href', '/app/cheesora-bliss/');
  await expect(page.getByRole('link', { name: 'Menu' })).toHaveAttribute('href', '/app/cheesora-bliss/#menu');
});

test('connect page: works with ?shop= fallback', async ({ page }) => {
  await mock(page);
  await page.goto('/connect/?shop=cheesora-bliss');
  await expect(page).toHaveTitle('Cheesora Bliss · Connect');
  await expect(page.getByRole('link', { name: 'Join rewards' })).toHaveAttribute('href', '/app/cheesora-bliss/');
});

test('connect page: buttons with no link are hidden', async ({ page }) => {
  await mock(page, { name: 'Bean Brew', tagline: 'Small batch', color: '#123456', logo_url: '', ig: 'https://instagram.com/beanbrew', fb: '', wa: '', web: '' });
  await page.goto('/connect/bean-brew/');
  await expect(page.getByRole('link', { name: 'Instagram' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Facebook' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Website' })).toHaveCount(0);
});

test('connect page: non-https links are not shown', async ({ page }) => {
  await mock(page, { name: 'Swaroop', tagline: 'x', color: '#123456', logo_url: '', ig: 'http://insecure.example', fb: '', wa: '', web: '' });
  await page.goto('/connect/swaroop/');
  await expect(page.getByRole('link', { name: 'Instagram' })).toHaveCount(0);
});

test('connect page: unknown shop is friendly, with no stack trace', async ({ page }) => {
  await mock(page, null);
  await page.goto('/connect/not-a-shop/');
  await expect(page.getByRole('heading', { name: /isn.t set up yet/i })).toBeVisible();
  await expect(page.locator('#app')).not.toContainText('undefined');
  await expect(page.locator('#app')).not.toContainText('get_business');
});

test('owner dashboard: Connect page link and QR use the public domain', async ({ page }) => {
  await mock(page);
  await page.goto('/admin/');
  const r = await page.evaluate(() => { biz = { slug: 'cheesora-bliss', name: 'Cheesora Bliss', scan_token: 'S', join_token: 'J' }; syncLinks(); return { url: connectUrl(), qr: qrSvg(connectUrl()) }; });
  expect(r.url).toBe('https://www.innondu.com/connect/cheesora-bliss/');
  expect(r.qr).toContain('<svg');
});

test('platform: Connect page URL uses the shop domain when it has one', async ({ page }) => {
  await mock(page);
  await page.goto('/platform/');
  const r = await page.evaluate(() => ({ plain: connectUrl({ slug: 'bean-brew', domains: [] }), own: connectUrl({ slug: 'bean-brew', domains: ['rewards.beanbrew.example'] }), qr: qrSvg(connectUrl({ slug: 'bean-brew', domains: [] })) }));
  expect(r.plain).toBe('https://www.innondu.com/connect/bean-brew/');
  expect(r.own).toBe('https://rewards.beanbrew.example/connect/bean-brew/');
  expect(r.qr).toContain('<svg');
});
