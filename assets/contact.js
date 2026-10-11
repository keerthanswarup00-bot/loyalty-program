// Contact form: submits to the server-side Supabase Edge Function.
// Rate limiting and validation are enforced by Postgres; browser checks are only UX.
(function () {
  var cfg = window.LK || {}, f = document.getElementById('cf'), msg = document.getElementById('cmsg'), btn = document.getElementById('cb');
  var wa = (window.INNONDU && window.INNONDU.WHATSAPP || '').replace(/\D/g, '');
  if (wa) { var a = document.getElementById('waBtn'); a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hi, I would like to know more about Innondu.'); document.getElementById('waCard').hidden = false; }

  function say(t, ok) { msg.textContent = t; msg.className = 'form-msg' + (ok ? ' ok' : ''); }
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = f.name.value.trim(), shop = f.shop.value.trim(), contact = f.contact.value.trim(), message = f.message.value.trim();
    if (f.website.value) { say('Thanks. We will be in touch.', true); return; } // honeypot: bots fill every field
    if (name.length < 2 || name.length > 80) { say('Please enter your name (2–80 characters).'); f.name.focus(); return; }
    if (shop.length > 80 || message.length > 1000) { say('Please shorten your message and try again.'); return; }
    if (contact.length < 5 || contact.length > 120) { say('Please enter a phone number or email.'); f.contact.focus(); return; }
    if (!cfg.supabaseUrl || !cfg.supabaseKey) { say('This form is not set up yet.'); return; }
    btn.disabled = true; say('Sending…');
    fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/functions/v1/submit-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseKey, Authorization: 'Bearer ' + cfg.supabaseKey },
      body: JSON.stringify({ p_name: name, p_shop: shop, p_contact: contact, p_message: message })
    }).then(function (r) {
      if (r.ok) { f.reset(); say('Thank you. We will get back to you within a day.', true); return; }
      return r.json().catch(function () { return {}; }).then(function (j) {
        var m = String(j && j.error || '');
        say(r.status === 429 ? m : (m || 'Sorry, that did not send. Please try again in a moment.'));
      });
    }).catch(function () { say('No connection. Please try again.'); }).then(function () { btn.disabled = false; });
  });
})();
