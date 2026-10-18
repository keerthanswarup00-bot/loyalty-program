// Offline checks for assets/connect-core.js (opening hours, primary button) and the shop-type config in assets/verticals.js.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const C = require('../assets/connect-core.js');

const ist = (day, hh, mm) => new Date(Date.UTC(2026, 9, day, hh, mm) - 5.5 * 3600e3);   // 19 Oct 2026 is a Monday
const H = { mon: [['09:00', '21:00']], tue: [['09:00', '21:00']], wed: [], thu: [['18:00', '02:00']], sun: [['10:00', '14:00']] };
const st = (d, hh, mm, tz = 'Asia/Kolkata', h = H) => C.status(h, tz, ist(d, hh, mm));

assert.deepStrictEqual(st(19, 12, 0), { state: 'open', text: 'Open now · until 9 pm' });
assert.strictEqual(st(19, 20, 30).state, 'soon');
assert.strictEqual(st(19, 21, 0).text, 'Closed · opens tomorrow 9 am', 'closing minute is closed');
assert.strictEqual(st(19, 8, 0).text, 'Closed · opens 9 am', 'same-day opening has no day word');
assert.strictEqual(st(20, 22, 0).text, 'Closed · opens Thu 6 pm', 'skips closed days');
assert.strictEqual(st(22, 19, 0).text, 'Open now · until 2 am', 'overnight shift');
assert.strictEqual(st(23, 1, 0).state, 'soon', 'after midnight still inside Thursday shift');
assert.strictEqual(st(23, 3, 0).text, 'Closed · opens Sun 10 am');
assert.strictEqual(st(25, 15, 0).text, 'Closed · opens tomorrow 9 am', 'Sunday after close wraps to Monday');
// Sunday overnight spilling into Monday
assert.strictEqual(C.status({ sun: [['20:00', '03:00']] }, 'Asia/Kolkata', ist(19, 1, 0)).state, 'open');
// Uses the shop's zone, not the visitor's: 12:00 IST is 02:30 in New York (closed there with the same hours)
assert.strictEqual(st(19, 12, 0, 'America/New_York').state, 'closed');
assert.strictEqual(st(19, 12, 0, 'Not/AZone').state, 'open', 'bad zone falls back to India time');
// Not set
assert.strictEqual(C.status({}, 'Asia/Kolkata'), null); assert.strictEqual(C.status(null), null);
assert.strictEqual(C.status({ mon: [['9:00', '21:00']] }, 'Asia/Kolkata'), null, 'malformed times are ignored');
assert.strictEqual(C.clean({ mon: [['09:00', '09:00']] }), null);
// Back-to-back shifts merge: open every day all day is "Open 24 hours", not "closing soon" each night
const ALL = {}; C.DAYS.forEach(d => { ALL[d] = [['00:00', '24:00']] });
assert.strictEqual(C.status(ALL, 'Asia/Kolkata', ist(19, 23, 30)).text, 'Open 24 hours');
const SPLIT = { mon: [['09:00', '24:00']], tue: [['00:00', '02:00'], ['09:00', '21:00']] };
assert.strictEqual(C.status(SPLIT, 'Asia/Kolkata', ist(19, 23, 30)).text, 'Open now · until 2 am', 'midnight handover is one stretch');
// Closes at midnight
assert.strictEqual(C.status({ mon: [['09:00', '24:00']] }, 'Asia/Kolkata', ist(19, 12, 0)).text, 'Open now · until midnight');

assert.strictEqual(C.fmt('09:00'), '9 am'); assert.strictEqual(C.fmt('12:30'), '12:30 pm');
assert.strictEqual(C.fmt('00:00'), 'midnight'); assert.strictEqual(C.fmt('21:05'), '9:05 pm');
const wk = C.week(H, 'Asia/Kolkata', ist(21, 12, 0));
assert.strictEqual(wk.length, 7); assert.strictEqual(wk.filter(r => r.today).length, 1); assert.strictEqual(wk[2].today, true);
assert.strictEqual(wk[2].text, 'Closed'); assert.strictEqual(wk[0].text, '9 am – 9 pm'); assert.strictEqual(wk[3].text, '6 pm – 2 am');
assert.deepStrictEqual(C.week({}, 'Asia/Kolkata'), []);

// Primary button
assert.strictEqual(C.primary('call', { wa: true, call: true }), 'call');
assert.strictEqual(C.primary('call', { wa: true }), 'wa', 'falls back to WhatsApp');
assert.strictEqual(C.primary('col', { dir: true }), 'dir');
assert.strictEqual(C.primary('wa', {}), null);

// Shop types
const win = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/verticals.js'), 'utf8'), { window: win });
for (const [k, v] of Object.entries(win.VERTICALS)) {
  assert.ok(['wa', 'call', 'dir', 'col'].includes(v.primary), k + ' primary');
  assert.ok(/^Hi /.test(v.intro('Shop')) && v.intro('Shop').includes('Shop'), k + ' intro');
  assert.ok(v.orderText('Shop', 'Thing').includes('Thing'), k + ' orderText');
}
console.log('connect core checks passed');
