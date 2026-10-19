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
    if (r.request().url().includes('get_menu')) return json(biz && biz.menu ? biz.menu : null);
    return json(null);
  });
}

test('connect page: /connect/<slug> shows the shop and every link', async ({ page }) => {
  await mock(page);
  await page.goto('/connect/cheesora-bliss/');
  await expect(page).toHaveTitle('Cheesora Bliss · Connect');
  await expect(page.getByRole('heading', { name: 'Cheesora Bliss' })).toBeVisible();
  await expect(page.getByText('Cheesecakes & coffee')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join the loyalty card' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', BIZ.ig);
  await expect(page.getByRole('link', { name: 'Facebook' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa\.me\/919876543210/);
  await expect(page.getByRole('link', { name: 'Website' })).toHaveAttribute('href', BIZ.web);
});

test('connect page: loyalty link and collection route point at this shop', async ({ page }) => {
  await mock(page, { ...BIZ, menu: { categories: [], items: [{ id: 'cake', title: 'Cake', price: '₹100', image_url: '', available: true }] } });
  await page.goto('/connect/cheesora-bliss/');
  await expect(page.getByRole('link', { name: 'Join the loyalty card' })).toHaveAttribute('href', '/app/cheesora-bliss/');
  await expect(page.getByRole('link', { name: 'View collection' })).toHaveAttribute('href', '/connect/cheesora-bliss/collection/');
});

test('connect page: works with ?shop= fallback', async ({ page }) => {
  await mock(page);
  await page.goto('/connect/?shop=cheesora-bliss');
  await expect(page).toHaveTitle('Cheesora Bliss · Connect');
  await expect(page.getByRole('link', { name: 'Join the loyalty card' })).toHaveAttribute('href', '/app/cheesora-bliss/');
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

test('Aroma Scripts Connect: shows saved featured products, offer and gallery', async ({ page }) => {
  const aroma = {
    slug: 'aroma-scripts', name: 'Aroma Scripts', tagline: 'Every Scent Has a Story.',
    color: '#48233d', logo_url: '', about: 'A fragrance story.', hero_url: '',
    wa_phone: '9876543210', ig: 'https://instagram.com/aromascripts',
    web: 'https://aromascripts.example', gallery: ['https://images.example/gallery-1.jpg'],
    connect_offer: { title: 'Discover your signature scent', text: 'Ask us about a fragrance pairing.', label: 'Ask us', url: '' },
    menu: { categories: [{ id: 'perfumes', name: 'Perfumes' }], items: [
      { id: 'vanilla-cloud', title: 'Vanilla Cloud', price: '₹799', description: 'Warm and soft.', image_url: 'https://images.example/vanilla.jpg', category_id: 'perfumes', available: true },
      { id: 'his-muse', title: 'His Muse', price: '₹899', description: 'A bold scent.', image_url: 'https://images.example/muse.jpg', category_id: 'perfumes', available: true },
      { id: 'draft-item', title: 'Draft item', image_url: 'https://images.example/draft.jpg', available: false }
    ] }
  };
  await page.route('https://images.example/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#ddd"/></svg>' }));
  await mock(page, aroma);
  await page.goto('/connect/aroma-scripts/');
  await expect(page.getByRole('heading', { name: 'Featured fragrances' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Vanilla Cloud' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View His Muse' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Draft item' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Discover your signature scent' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ask us/ })).toHaveAttribute('href', /wa\.me/);
  await expect(page.locator('.cn-gal-aroma img')).toHaveCount(1);
  await page.getByRole('button', { name: 'View Vanilla Cloud' }).click();
  await expect(page.getByRole('dialog', { name: 'Product details' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vanilla Cloud' })).toBeVisible();
});

test('other Connect shops do not show Aroma-only featured sections', async ({ page }) => {
  await mock(page);
  await page.goto('/connect/cheesora-bliss/');
  await expect(page.locator('.cn-featured-aroma')).toHaveCount(0);
  await expect(page.locator('.cn-offer-aroma')).toHaveCount(0);
});


test('Connect handles long shop names and empty optional sections without overflow', async ({ page }) => {
  const longName = 'Aroma Scripts — Bespoke Fragrance Atelier and Perfume Studio';
  await mock(page, {
    name: longName, tagline: 'A long tagline for testing narrow viewports and graceful wrapping.',
    color: '#48233d', logo_url: '', about: '', phone: '', wa_phone: '',
    address: '', maps_url: '', ig: '', fb: '', yt: '', web: '', links: [], gallery: [],
    menu: { categories: [], items: [] }
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/connect/aroma-scripts/');
  await expect(page.getByRole('heading', { name: longName })).toBeVisible();
  await expect(page.locator('.cn-offer-aroma')).toHaveCount(0);
  await expect(page.locator('.cn-gal-aroma')).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('Connect product cards gracefully handle missing images and long product names', async ({ page }) => {
  const aroma = {
    slug: 'aroma-scripts', name: 'Aroma Scripts', tagline: 'Every Scent Has a Story.',
    color: '#48233d', logo_url: '', about: '', hero_url: '',
    wa_phone: '', ig: '', web: '', gallery: [],
    menu: { categories: [], items: [
      { id: 'long', title: 'A Very Long Fragrance Name That Should Wrap Without Breaking The Layout', price: '₹1,299', description: 'A description.', image_url: '', available: true },
      { id: 'bad-image', title: 'Broken Image', price: '', description: '', image_url: 'javascript:alert(1)', available: true }
    ] }
  };
  await mock(page, aroma);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/connect/aroma-scripts/');
  await expect(page.getByRole('button', { name: /View A Very Long Fragrance Name/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Broken Image' })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('Connect slug resolution stays scoped to the requested shop', async ({ page }) => {
  const shops = {
    'aroma-scripts': { ...BIZ, slug: 'aroma-scripts', name: 'Aroma Scripts', color: '#48233d', menu: { categories: [], items: [] } },
    'bean-brew': { ...BIZ, slug: 'bean-brew', name: 'Bean Brew', color: '#123456', menu: { categories: [], items: [] } }
  };
  await page.route(SB, route => {
    const url = new URL(route.request().url());
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (url.href.includes('get_business')) {
      const body = JSON.parse(route.request().postData() || '{}');
      const slug = body.p_slug || new URLSearchParams(url.search).get('p_slug');
      return json(shops[slug] || null);
    }
    if (url.href.includes('get_menu')) return json({ categories: [], items: [] });
    return json(null);
  });
  await page.goto('/connect/aroma-scripts/');
  await expect(page.getByRole('heading', { name: 'Aroma Scripts', exact: true })).toBeVisible();
  await page.goto('/connect/bean-brew/');
  await expect(page.getByRole('heading', { name: 'Bean Brew', exact: true })).toBeVisible();
  await expect(page.locator('.cn-featured-aroma')).toHaveCount(0);
  await expect(page.locator('.cn-offer-aroma')).toHaveCount(0);
});

test('Connect remains usable on a small mobile viewport', async ({ page }) => {
  await mock(page, {
    ...BIZ, slug: 'aroma-scripts', name: 'Aroma Scripts', color: '#48233d',
    about: 'A fragrance studio.', wa_phone: '9876543210',
    gallery: ['https://images.example/gallery-1.jpg'],
    menu: { categories: [], items: [
      { id: 'perfume', title: 'Vanilla Cloud', price: '₹799', description: 'Soft vanilla notes.', image_url: 'https://images.example/vanilla.jpg', available: true }
    ] }
  });
  await page.route('https://images.example/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#ddd"/></svg>' }));
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/connect/aroma-scripts/');
  await expect(page.getByRole('heading', { name: 'Aroma Scripts', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Vanilla Cloud' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('Aroma Scripts: scent line, one collection link, single-line enquiry, collection rows, sticky bar, bespoke card, Back', async ({ page }) => {
  const aroma = {
    slug: 'aroma-scripts', name: 'Aroma Scripts', tagline: 'Every Scent Has a Story.', color: '#48233d', logo_url: '', about: '', hero_url: '',
    wa_phone: '9876543210', bespoke_text: 'Tell us the notes you love and we will blend a scent just for you.',
    menu: { categories: [], items: [
      { id: 'vanilla-cloud', title: 'Vanilla Cloud', price: '₹799', description: 'Warm and soft.', scent_notes: 'Warm · sweet · vanilla', image_url: 'https://images.example/vanilla.jpg', available: true },
      { id: 'his-muse', title: 'His Muse', price: '₹899', description: 'A bold scent.', image_url: 'https://images.example/muse.jpg', available: true }
    ] }
  };
  await page.route('https://images.example/**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#ddd"/></svg>' }));
  await mock(page, aroma);
  await page.goto('/connect/aroma-scripts/');
  await expect(page.locator('.cn-featured-card .cn-scent')).toHaveText('Warm · sweet · vanilla');
  await expect(page.locator('.cn-featured-plus')).toHaveCount(0);
  await expect(page.locator('a[href$="/collection/"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Enquire on WhatsApp' }).first()).toHaveAttribute('href', /wa\.me\/919876543210\?text=.*interested%20in%20Vanilla%20Cloud/);
  await page.goto('/connect/aroma-scripts/collection/');
  await expect(page.getByRole('heading', { name: 'The collection', exact: true })).toBeVisible();
  await expect(page.locator('.cn-row-enquire')).toHaveCount(3);          // two products + the bespoke card
  await expect(page.locator('.cn-sticky-wa a')).toBeVisible();
  await expect(page.locator('.cn-bespoke-aroma')).toBeVisible();
  await page.getByRole('button', { name: 'View Vanilla Cloud' }).click();
  await expect(page.getByRole('dialog', { name: 'Product details' })).toBeVisible();
  await page.goBack();                                                   // browser Back closes the sheet first
  await expect(page.getByRole('dialog', { name: 'Product details' })).toBeHidden();
  await expect(page).toHaveURL(/\/collection\/$/);
});
