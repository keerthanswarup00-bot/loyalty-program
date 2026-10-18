import { test, expect } from '@playwright/test';

const SB = '**/*.supabase.co/**';
const BIZ = {
  id: 'biz-1',
  slug: 'sample-shop',
  name: 'Sample Shop',
  tagline: 'Made with care',
  color: '#7a4a2b',
  logo_url: '',
  wa_phone: '9876543210',
  gallery: [],
  vertical: 'generic',
  connect_loyalty: false
};
const ITEMS = {
  categories: [{ id: 'cat-1', name: 'Featured' }],
  items: [
    { id: 'product-1', title: 'Handmade Mug', description: 'A handmade ceramic mug.', price: '₹450', image_url: 'https://images.example/mug.jpg', category_id: 'cat-1' },
    { id: 'product-2', title: 'Gift Box', description: 'A gift box for special occasions.', price: '', image_url: '', category_id: null }
  ]
};

async function mock(page) {
  await page.route(u => u.hostname === '127.0.0.1', async r => {
    if (r.request().resourceType() !== 'document') return r.fallback();
    const res = await r.fetch();
    r.fulfill({ response: res, body: (await res.text()).replace(/ integrity="[^"]*"/g, '') });
  });
  await page.route('**/cdn.jsdelivr.net/**/supabase.min.js', r => r.fulfill({ path: 'assets/vendor/supabase-2.117.2.js', contentType: 'text/javascript' }));
  await page.route('**/cdnjs.cloudflare.com/**/qrcode.min.js', r => r.fulfill({ path: 'assets/vendor/qrcode-generator-1.4.4.js', contentType: 'text/javascript' }));
  await page.route(SB, r => {
    const json = b => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (r.request().url().includes('get_business')) return json(BIZ);
    if (r.request().url().includes('get_menu')) return json(ITEMS);
    return json(null);
  });
}

test('main Connect page links to a separate collection and does not list all products', async ({ page }) => {
  await mock(page);
  await page.goto('/connect/sample-shop/');
  await expect(page.getByRole('link', { name: /view collection/i })).toHaveAttribute('href', '/connect/sample-shop/collection/');
  await expect(page.getByText('Handmade Mug')).toHaveCount(0);
});

test('collection products expand inline and enquiry pre-fills WhatsApp message', async ({ page }) => {
  await mock(page);
  await page.goto('/connect/sample-shop/collection/');
  await expect(page).toHaveTitle('Sample Shop · Collection');
  await expect(page.getByRole('heading', { name: /Sample Shop Collection/i })).toBeVisible();
  const product = page.getByRole('button', { name: /Handmade Mug/ });
  await expect(product).toBeVisible();
  await product.click();
  await expect(page.getByText('A handmade ceramic mug.')).toBeVisible();
  await expect(page.getByRole('link', { name: /ask for more details/i })).toHaveAttribute('href', /wa\.me\/919876543210\?text=.*I%20want%20more%20details%20about%20Handmade%20Mug/);
});
