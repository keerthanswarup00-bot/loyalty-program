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
      pilot: 'TODO_WA_MSG_PILOT',                // pilot block
      connect: 'TODO_WA_MSG_CONNECT',            // connect page
      float: 'TODO_WA_MSG_FLOAT'                 // floating button
    }
  },

  pricing: {
    software: 'TODO_PRICING_SOFTWARE',            // Is the app itself free to use?
    subscription: 'TODO_PRICING_SUBSCRIPTION',    // Monthly / yearly subscription, or none?
    perRedemption: 'TODO_PRICING_PER_REDEMPTION', // Any fee when a reward is redeemed?
    hardware: 'TODO_PRICING_HARDWARE',            // What the NFC stamp and the poster cost
    pilot: 'TODO_PRICING_PILOT',                  // Free pilot: how long, what it includes
    afterPilot: 'TODO_PRICING_AFTER_PILOT',       // What happens when the pilot ends
    included: 'TODO_PRICING_INCLUDED',            // What the price includes
    notIncluded: 'TODO_PRICING_NOT_INCLUDED'      // What it does not
  },

  // Real shops only, with written consent. While empty (or without any consent:true entry) the
  // proof section shows the free-pilot block instead. Shape: { name, area, quote, metric, photo, consent }
  proof: [],

  faq: {
    identity: 'TODO_FAQ_IDENTITY',
    abuse: 'TODO_FAQ_ABUSE',
    ownership: 'TODO_FAQ_OWNERSHIP',
    setup: 'TODO_FAQ_SETUP',
    cost: 'TODO_FAQ_COST',
    compat: 'TODO_FAQ_COMPAT',
    install: 'TODO_FAQ_INSTALL',
    exit: 'TODO_FAQ_EXIT',
    connect: 'TODO_FAQ_CONNECT',              // What is the Connect page, and how is it different from the stamp card?
    connectEdit: 'TODO_FAQ_CONNECT_EDIT',      // Who edits the Connect page, and how?
    connectNfc: 'TODO_FAQ_CONNECT_NFC'         // Does the NFC keychain cost extra, and is it included?
  },

  legal: {
    entity: 'TODO_LEGAL_ENTITY',                // business / legal entity name
    grievanceEmail: 'TODO_GRIEVANCE_EMAIL',     // grievance / data-deletion contact
    jurisdiction: 'TODO_LEGAL_JURISDICTION',    // e.g. Karnataka, India
    lastUpdated: 'TODO_LEGAL_LAST_UPDATED'      // e.g. '16 October 2026'
  },
};

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
