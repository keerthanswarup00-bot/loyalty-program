// Contact form: sends the message to Supabase through the submit_lead function (no library, one fetch).
(function () {
  var cfg = window.LK || {}, f = document.getElementById('cf'), msg = document.getElementById('cmsg'), btn = document.getElementById('cb');
  var wa = (window.INNONDU && window.INNONDU.WHATSAPP || '').replace(/\D/g, '');
  if (wa) {
    var a = document.getElementById('waBtn');
    if (a) {
      // Keep site.js data-site-wa logic if present; otherwise build.
      a.setAttribute('data-site-wa', 'whatsapp.number');
      a.setAttribute('data-wa-msg', 'contact');
      a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent((window.INNONDU.WHATSAPP_MESSAGE || 'Hi, I would like to know more about Innondu.'));
    }
    var card = document.getElementById('waCard'); if (card) card.hidden = false;
  }

  function say(t, ok) { msg.textContent = t; msg.className = 'form-msg' + (ok ? ' ok' : ''); }
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = f.name.value.trim(), contact = f.contact.value.trim();
    if (f.website.value) { say('Thanks. We will be in touch.', true); return; }          // honeypot: bots fill every field
    if (name.length < 2) { say('Please enter your name.'); f.name.focus(); return; }
    if (contact.length < 5) { say('Please enter a phone number or email.'); f.contact.focus(); return; }
    if (!cfg.supabaseUrl) { say('This form is not set up yet.'); return; }
    btn.disabled = true; say('Sending…');
    fetch(cfg.supabaseUrl + '/rest/v1/rpc/submit_lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseKey, Authorization: 'Bearer ' + cfg.supabaseKey },
      body: JSON.stringify({ p_name: name, p_shop: f.shop.value.trim(), p_contact: contact, p_message: f.message.value.trim() })
    }).then(function (r) {
      if (r.ok) { f.reset(); say('Thank you. We will get back to you within a day.', true); return; }
      return r.json().catch(function () { return {}; }).then(function (j) {
        var m = String(j && j.message || '');
        say(/Too many/.test(m) ? m : 'Sorry, that did not send. Please try again in a moment.');
      });
    }).catch(function () { say('No connection. Please try again.'); }).then(function () { btn.disabled = false; });
  });
})();
