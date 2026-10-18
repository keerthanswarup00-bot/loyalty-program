// Pure logic for the Connect page, shared by the public page, the editor preview and the offline tests.
//  - Opening hours: validate, format, and work out "Open now / Closing soon / Closed" in the SHOP's time zone.
//  - Primary button: which single action a shop type leads with, falling back to what the shop has actually filled in.
// Hours are stored as {"mon":[["09:00","21:00"]], "tue":[], ...}. A missing day or [] means closed. A close time at or
// before the open time runs past midnight into the next day (e.g. ["18:00","02:00"]). No days at all = hours not set.
(function (root) {
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const NAME = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const WEEK = 7 * 1440, SOON = 60, TIME = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;
  const mins = t => { const [h, m] = String(t).split(':'); return (+h) * 60 + (+m) };

  // Keep only well-formed intervals. Returns null when nothing is set, so "not set" is one thing, not many.
  function clean(h) {
    if (!h || typeof h != 'object' || Array.isArray(h)) return null;
    const out = {}; let any = false;
    for (const d of DAYS) {
      const list = (Array.isArray(h[d]) ? h[d] : []).filter(x => Array.isArray(x) && TIME.test(x[0]) && TIME.test(x[1]) && x[0] != '24:00' && x[0] != x[1]).map(x => [x[0], x[1]]);
      out[d] = list; if (list.length) any = true;
    }
    return any ? out : null;
  }

  // "9 am", "9:30 pm", "midnight". Always the 12-hour clock customers read.
  function fmt(t) {
    const m = mins(t); if (m == 0 || m == 1440) return 'midnight';
    const h = Math.floor(m / 60) % 24, mm = m % 60, ap = h < 12 ? 'am' : 'pm';
    return ((h % 12) || 12) + (mm ? ':' + String(mm).padStart(2, '0') : '') + ' ' + ap;
  }

  // Day of week (0 = Monday) and minutes since midnight right now in the shop's time zone.
  function nowIn(tz, date) {
    const d = date || new Date();
    for (const zone of [tz, 'Asia/Kolkata']) {
      try {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone || undefined, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
        const get = k => (parts.find(p => p.type == k) || {}).value;
        const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
        if (day >= 0) return { day, mins: (+get('hour')) * 60 + (+get('minute')) };
      } catch (e) { }
    }
    return { day: (d.getUTCDay() + 6) % 7, mins: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }

  // { state: 'open' | 'soon' | 'closed', text } or null when the shop has not set its hours.
  function status(hours, tz, date) {
    const h = clean(hours); if (!h) return null;
    const n = nowIn(tz, date), t = n.day * 1440 + n.mins;
    let raw = [];
    DAYS.forEach((d, i) => h[d].forEach(([a, b]) => {
      const s = i * 1440 + mins(a); let e = i * 1440 + mins(b); if (e <= s) e += 1440;
      raw.push([s, e, b], [s + WEEK, e + WEEK, b]);          // second copy lets a shift run from Sunday into Monday
    }));
    // Back-to-back shifts (e.g. open all day, every day) are one stretch, so the shop is not "closing" at midnight.
    raw.sort((x, y) => x[0] - y[0]);
    const spans = [];
    for (const sp of raw) { const last = spans[spans.length - 1]; if (last && sp[0] <= last[1]) { if (sp[1] > last[1]) { last[1] = sp[1]; last[2] = sp[2] } } else spans.push(sp.slice()) }
    for (const [s, e, b] of spans) {
      if (e - s >= WEEK) return { state: 'open', text: 'Open 24 hours' };
      for (const tt of [t, t + WEEK]) if (s <= tt && tt < e) {
        const left = e - tt;
        return left <= SOON ? { state: 'soon', text: 'Closing soon · ' + fmt(b) } : { state: 'open', text: 'Open now · until ' + fmt(b) };
      }
    }
    let best = null;
    for (const [s] of spans) { const diff = s - t; if (diff > 0 && (best === null || diff < best.diff)) best = { diff, s } }
    if (!best) return { state: 'closed', text: 'Closed' };
    const ahead = Math.floor((n.mins + best.diff) / 1440), day = (n.day + ahead) % 7;
    const at = fmt(String(Math.floor((best.s % 1440) / 60)).padStart(2, '0') + ':' + String(best.s % 60).padStart(2, '0'));
    const when = ahead == 0 ? '' : ahead == 1 ? ' tomorrow' : ' ' + NAME[DAYS[day]].slice(0, 3);
    return { state: 'closed', text: 'Closed · opens' + when + ' ' + at };
  }

  // Seven rows for the weekly list: [{ key, label, text, today }]. `today` marks the shop's current day.
  function week(hours, tz, date) {
    const h = clean(hours); if (!h) return [];
    const n = nowIn(tz, date);
    return DAYS.map((d, i) => ({ key: d, label: NAME[d], today: i == n.day, text: h[d].length ? h[d].map(x => fmt(x[0]) + ' – ' + fmt(x[1])).join(', ') : 'Closed' }));
  }

  // The one big button a shop type leads with: 'wa' | 'call' | 'dir' | 'col'. Falls back to whatever is available.
  function primary(preferred, avail) {
    return [preferred, 'wa', 'call', 'dir', 'col'].find(k => k && avail && avail[k]) || null;
  }

  const api = { DAYS, NAME, clean, fmt, nowIn, status, week, primary };
  if (typeof module != 'undefined' && module.exports) module.exports = api; else root.ConnectCore = api;
})(typeof window != 'undefined' ? window : globalThis);
