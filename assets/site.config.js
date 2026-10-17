// Innondu marketing-site content config — the only file you edit for copy, contact details,
// pricing, proof and legal text. Read by assets/site.js on the Home, About and Contact pages.
//
// Anything left as TODO_... is a placeholder. Nothing here is invented: no testimonials, no
// numbers, no shop names, no photos. When you open a page locally (or on a preview deploy)
// with placeholders still set, the browser console prints a warning listing every one of them.
//
// See README -> "Site content config" for what each field feeds.
window.SITE = {
  siteUrl: 'https://www.innondu.com',
  siteName: 'Innondu',
  defaultOgImage: 'TODO_DEFAULT_OG_IMAGE',      // path to a 1200x630 image, e.g. '/assets/og.png'

  founder: {
    name: 'Aryan Swaroop',
    role: 'TODO_FOUNDER_ROLE',                  // e.g. Founder
    city: 'TODO_FOUNDER_CITY',
    photo: 'TODO_FOUNDER_PHOTO',                // path to the photo, e.g. '/assets/aryan.jpg'
    why: 'TODO_FOUNDER_WHY',                    // one short, honest paragraph: why Innondu exists
    work: 'TODO_FOUNDER_WORK',                  // what you do, e.g. design and creative strategy
    phone: 'TODO_FOUNDER_PHONE',                // display number, any format
    email: 'TODO_FOUNDER_EMAIL',
    whatsapp: 'TODO_FOUNDER_WHATSAPP',          // international, digits only: 919876543210
    portfolio: 'https://aryanswaroop.com'
  },

  whatsapp: {
    number: 'TODO_WHATSAPP_NUMBER',             // international, digits only: 919876543210
    message: 'Hi, I would like to know more about Innondu.',
    messages: {
      hero: 'TODO_WA_MSG_HERO',                  // hero call to action
      contact: 'TODO_WA_MSG_CONTACT',            // contact page
      connect: 'TODO_WA_MSG_CONNECT',            // connect page
      float: 'TODO_WA_MSG_FLOAT'                 // floating button
    }
  },

  pricing: {
    // perMonth is in rupees; months is the term, paid upfront. Totals and savings are calculated
    // from these two numbers, so the page cannot disagree with itself. First plan = month-to-month.
    plans: [
      { id: 'monthly', name: 'Monthly', tagline: 'Pay month to month',     perMonth: 699, months: 1 },
      { id: '1y',      name: '1 Year',  tagline: 'Best for most shops',    perMonth: 499, months: 12, recommended: true },
      { id: '2y',      name: '2 Years', tagline: 'Lowest price per month', perMonth: 449, months: 24 }
    ],
    // Optional: how long the free pilot runs, e.g. '30 days'. Leave '' until decided; never guess.
    pilotLength: ''
  },

  // Real shops only, with written consent. While empty (or without any consent:true entry) the
  // proof section shows the free-pilot block instead. Shape: { name, area, quote, metric, photo, consent }
  proof: [],

  faq: {
    ownership: 'Your shop owns its customer list. You can export it as a spreadsheet at any time and ask us to delete it. We do not sell or rent customer data.',
    setup: 'You tell us your shop name, your colour and the reward you want to give. We create your shop and send you the link, a QR code to print and your owner login. You do not install or connect anything.',
    cost: '',   // built from pricing.plans below
    install: 'No. Customers tap an NFC tag or scan your QR code and the card opens in their phone browser. They can add it to their home screen if they like, but they do not have to.',
  },

  legal: {
    entity: 'Aryan Swaroop',                // business / legal entity name
    grievanceEmail: 'TODO_GRIEVANCE_EMAIL',     // grievance / data-deletion contact
    jurisdiction: 'India',                      // governing law; add the courts city once a lawyer confirms
    lastUpdated: '17 October 2026'              // update whenever the privacy notice or terms change
  },
};

// The cost FAQ answer is built from the plans above, so it can never quote a different price.
(function (S) {
  var p = S.pricing.plans, r = function (n) { return '\u20b9' + n; };
  S.faq.cost = 'Start with a free pilot. After that: ' + r(p[0].perMonth) + ' a month, or ' + r(p[1].perMonth) +
    ' a month paid once a year, or ' + r(p[2].perMonth) + ' a month paid once every two years. No GST is charged.';
})(window.SITE);

// Dev-only warning: list every placeholder still set, but only when the page is not served
// from siteUrl (localhost, 127.0.0.1 and preview deploys count as dev).
(function () {
  var todos = [];
  (function walk(v, path) {
    if (typeof v === 'string') { if (/TODO_[A-Z0-9_]+/.test(v)) todos.push(path + ' = ' + v); return; }
    if (v && typeof v === 'object') {
      Object.keys(v).forEach(function (k) { walk(v[k], path ? path + '.' + k : k); });
    }
  })(window.SITE, '');

  var prodHost = '';
  try { prodHost = new URL(window.SITE.siteUrl).hostname; } catch (e) { }
  var onProd = prodHost && location.hostname === prodHost;
  if (!todos.length || onProd) return;

  console.warn(
    '[Innondu site.config] ' + todos.length + ' placeholder' + (todos.length === 1 ? '' : 's') +
    ' still set in assets/site.config.js:\n  ' + todos.join('\n  ')
  );
})();
