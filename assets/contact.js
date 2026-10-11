// Contact form: sends the message to Supabase through the submit_lead function (no library, one fetch).
(function () {
  var cfg = window.LK || {}, f = document.getElementById('cf'), msg = document.getElementById('cmsg'), btn = document.getElementById('cb');
  if (!f || !msg || !btn) return;
  var wa = (window.INNONDU && window.INNONDU.WHATSAPP || '').replace(/\D/g, '');
  if (wa) { var a = document.getElementById('waBtn'), card = document.getElementById('waCard'); if (a && card) { a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hi, I would like to know more about Innondu.'); card.hidden = false; } }

  function say(t, ok) { msg.textContent = t; msg.className = 'form-msg' + (ok ? ' ok' : ''); }
  function field(name) { return f.elements.namedItem(name); }
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var nameField = field('name'), contactField = field('contact'), websiteField = field('website');
    var shopField = field('shop'), messageField = field('message');
    if (!nameField || !contactField || !websiteField || !shopField || !messageField) { say('This form is not available right now.'); return; }
    var name = String(nameField.value || '').trim(), contact = String(contactField.value || '').trim();
    if (websiteField.value) { say('Thanks. We will be in touch.', true); return; }          // honeypot: bots fill every field
    if (name.length < 2) { say('Please enter your name.'); nameField.focus(); return; }
    if (contact.length < 5) { say('Please enter a phone number or email.'); contactField.focus(); return; }
    if (!cfg.supabaseUrl) { say('This form is not set up yet.'); return; }
    btn.disabled = true; say('Sending…');
    fetch(cfg.supabaseUrl + '/rest/v1/rpc/submit_lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseKey, Authorization: 'Bearer ' + cfg.supabaseKey },
      body: JSON.stringify({ p_name: name, p_shop: shopField.value.trim(), p_contact: contact, p_message: messageField.value.trim() })
    }).then(function (r) {
      if (r.ok) { f.reset(); say('Thank you. We will get back to you within a day.', true); return; }
      return r.json().catch(function () { return {}; }).then(function (j) {
        var m = String(j && j.message || '');
        say(/Too many/.test(m) ? m : 'Sorry, that did not send. Please try again in a moment.');
      });
    }).catch(function () { say('No connection. Please try again.'); }).then(function () { btn.disabled = false; });
  });
})();
