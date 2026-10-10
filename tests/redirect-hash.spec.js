import { test, expect } from '@playwright/test';

// Proves that already-printed QR/NFC links keep working after the move to
// innondu.com. Two hops are involved: (1) any host-to-host hop (apex -> www),
// and (2) the landing page's own "#scan/#join -> /app/" forward.
//
// Run explicitly so it is never picked up by the smoke workflow:
//   npx playwright test tests/redirect-hash.spec.js

const CASES = [
  { name: 'old host  scan', url: 'https://royalty-prog.vercel.app/#scan=TEST', expect: 'https://royalty-prog.vercel.app/app/#scan=TEST' },
  { name: 'old host  join', url: 'https://royalty-prog.vercel.app/#join=TEST', expect: 'https://royalty-prog.vercel.app/app/#join=TEST' },
  { name: 'www       scan', url: 'https://www.innondu.com/#scan=TEST',        expect: 'https://www.innondu.com/app/#scan=TEST' },
  { name: 'www       join', url: 'https://www.innondu.com/#join=TEST',        expect: 'https://www.innondu.com/app/#join=TEST' },
  { name: 'apex hop  scan', url: 'https://innondu.com/#scan=TEST',            expect: 'https://www.innondu.com/app/#scan=TEST' },
  { name: 'apex hop  join', url: 'https://innondu.com/#join=TEST',            expect: 'https://www.innondu.com/app/#join=TEST' },
];

for (const c of CASES) {
  test(`${c.name}: ${c.url} keeps its fragment`, async ({ page }) => {
    await page.goto(c.url, { waitUntil: 'commit' });
    await page.waitForURL(/\/app\/#(scan|join)=TEST/, { timeout: 20_000 });
    expect(page.url()).toBe(c.expect);
  });
}
