import { test, expect } from '@playwright/test';

// Offline tests for the Connect page (/app/<shop>/connect) and its switches. Supabase is mocked.
//   npx playwright test tests/connect-page.spec.js
const CONNECT = {
  name: 'Foo Cafe', tagline: 'Fresh daily', color: '#336699', logo_url: '', theme: {}, ig: 'https://instagram.com/foo', fb: '', wa: 'https://wa.me/910000000000',
  web: 'javascript:alert(1)', review_url: 'https://g.page/foo', title: 'Welcome to Foo', sub: 'Eat well', tz: 'Asia/Kolkata',
  locations: [{ id: 'l1', name: 'Hoskote stall', address: '1 Main Rd', maps_url: 'https://maps.app/x', status: 'temporarily_closed', hours_note: '5 to 10' }],
  promos: [{ id: 'p1', title: 'Diwali boxes', body: 'Order early', kind: 'festive', ends_on: '2030-11-01' }]
};
const MENU = { categories: [{ id: 'c1', name: 'Desserts' }], items: [{ id: 'i1', title: 'Tiramisu', description: 'Creamy', price: '200', image_url: '', category_id: 'c1' }] };

async function setup(page, connect, menu = MENU) {
  await page.route(u => u.hostname === '127.0.0.1', async r => {
    if (r.request().resourceType() !== 'document') return r.fallback();
    const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace(/ integrity="[^"]*"/g, '') });
  });
  await page.route('**/cdn.jsdelivr.net/**/supabase.min.js', r => r.fulfill({ path: 'assets/vendor/supabase-2.117.2.js', contentType: 'text/javascript' }));
  await page.route('**/*.supabase.co/**', r => {
    const u = r.request().url(), h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    const body = u.includes('get_connect') ? connect : u.includes('get_menu') ? menu : null;
    return r.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify(body) });
  });
}

test('connect page shows everything the shop switched on', async ({ page }) => {
  await setup(page, CONNECT);
  await page.goto('/app/foo-cafe/connect');
  await expect(page.getByRole('heading', { name: 'Welcome to Foo' })).toBeVisible();
  await expect(page.getByText('Join our rewards')).toBeVisible();
  await expect(page.locator('a.cn-act.pri')).toHaveAttribute('href', '/app/foo-cafe/');
  await expect(page.getByText('Message us on WhatsApp')).toBeVisible();
  await expect(page.getByText('Review us on Google')).toBeVisible();
  await expect(page.getByText('Hoskote stall')).toBeVisible();
  await expect(page.getByText('Temporarily closed')).toBeVisible();
  await expect(page.getByText('Get directions')).toBeVisible();
  await expect(page.getByText('Diwali boxes')).toBeVisible();
  await expect(page.getByText('Festive special')).toBeVisible();
  await expect(page.locator('#menu').getByText('Tiramisu')).toBeVisible();
  await expect(page.getByText('₹200')).toBeVisible();
  expect(await page.title()).toBe('Foo Cafe');
});

test('connect page: switched off shows "not available"', async ({ page }) => {
  await setup(page, null);
  await page.goto('/app/foo-cafe/connect');
  await expect(page.getByText("This page isn't available")).toBeVisible();
  await expect(page.getByText('Join our rewards')).toHaveCount(0);
});

test('connect page: hostile text is escaped and non-https links are dropped', async ({ page }) => {
  await setup(page, { ...CONNECT, name: '<img src=x onerror=window.__pwn=1>', title: '<b id=bold>x</b>', wa: 'javascript:alert(1)', review_url: 'http://insecure.example', locations: [{ id: 'l', name: '<script>window.__pwn=2</script>', address: '', maps_url: 'javascript:alert(2)', status: 'open', hours_note: '' }] }, { categories: [], items: [] });
  await page.goto('/app/foo-cafe/connect');
  await expect(page.locator('.cn-hero h1')).toBeVisible();
  expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
  expect(await page.locator('#bold').count()).toBe(0);
  expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
  await expect(page.getByText('Message us on WhatsApp')).toHaveCount(0);
  await expect(page.getByText('Review us on Google')).toHaveCount(0);
  await expect(page.getByText('Get directions')).toHaveCount(0);
});

test('owner dashboard: Connect page card, link and editors render', async ({ page }) => {
  await setup(page, null);
  await page.goto('/admin/');
  const out = await page.evaluate(() => {
    biz = { id: 'b1', slug: 'foo-cafe', name: 'Foo', connect_on: false, connect_title: '', connect_sub: '', review_url: '' }; syncLinks();
    const card = connectCard();
    CN = { locs: [{ id: 'l1', name: 'Stall', address: 'Rd', maps_url: '', status: 'open', hours_note: '', featured: false, active: true }], promos: [{ id: 'p1', title: 'Deal', body: '', kind: 'offer', ends_on: null, active: false }] };
    ov = 'cnloc'; const loc = connEditV(); ov = 'cnpro'; const pro = connEditV();
    return { card, loc, pro, url: cnUrl() };
  });
  expect(out.url).toBe('https://www.innondu.com/app/foo-cafe/connect');
  expect(out.card).toContain('Off: the link shows');
  expect(out.card).toContain('id="cnon"');
  expect(out.loc).toContain('Stall');
  expect(out.loc).toContain('Add a location');
  expect(out.pro).toContain('Deal');
  expect(out.pro).toContain('(hidden)');
});

test('owner dashboard: old database shows the one-line update note instead of breaking', async ({ page }) => {
  await setup(page, null);
  await page.goto('/admin/');
  const card = await page.evaluate(() => { biz = { id: 'b1', slug: 'foo', name: 'Foo' }; return connectCard() });
  expect(card).toContain('2026-10-15-connect.sql');
});

test('platform: Connect page switch shows state and link', async ({ page }) => {
  await setup(page, null);
  await page.goto('/platform/');
  const html = await page.evaluate(() => { const r = { slug: 'zed', name: 'Zed', connect_on: false, members: 0, new_members_7d: 0, stamps_7d: 0, stamps_30d: 0, coupons_30d: 0, redeemed_30d: 0, domains: [], plan: '', contact: '', notes: '', need: 8, reward: 'x', tz: 'Asia/Kolkata' }; return [overviewV(r), overviewV({ ...r, connect_on: true }), overviewV({ ...r, connect_on: undefined }), connectUrl(r)] });
  expect(html[3]).toMatch(/\/app\/zed\/connect$/);
  expect(html[0]).toContain('Switch on');
  expect(html[1]).toContain('Switch off');
  expect(html[1]).toContain('Open page');
  expect(html[2]).not.toContain('Connect page');
});
