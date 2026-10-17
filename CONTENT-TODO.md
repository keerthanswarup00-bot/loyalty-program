# Innondu: what is still open

Nothing on the live site shows a placeholder. Anything unset is hidden until you fill it in
`assets/site.config.js` (unless another place is named).

## Done (17 Oct)
Phone and WhatsApp (+91 63642 24230), free pilot = 1 month, setup within a day, NFC stamp and poster
included, founder story and the meaning of the name, refund policy (Terms, "Cancelling and refunds"),
interactive Connect page.

## Still needed
| # | What | Where | Notes |
|---|------|-------|-------|
| 1 | **Email address** | `founder.email` | Footer and About hide it until set. Use a real address on your own domain, not Gmail, once you have one. |
| 2 | **Photo** of you (square, 600px+) saved as `/assets/aryan.jpg` | `founder.photo` | A face builds more trust with a local shop owner than any copy. |
| 3 | **Role and city** (e.g. "Founder", "Bengaluru") | `founder.role`, `founder.city` | Hidden until set. |
| 4 | **What you do** (1 to 2 sentences) | `founder.work` | Optional. |
| 5 | **Link-preview image** 1200x630 | `defaultOgImage` | Without it, shared links on WhatsApp show no picture. |
| 6 | **A real shop with written permission** (name, area, one quote) | `proof` | Section stays hidden until you have one. Cheesora Bliss is the obvious first: ask them. |
| 7 | **Prefilled WhatsApp messages** (hero, contact, connect, floating button) | `whatsapp.messages` | Right now all use "Hi, I would like to know more about Innondu." |
| 8 | **DTS demo page**: real WhatsApp number and hours from the shop, or remove the "contact details to be confirmed" note | `/dts/index.html` | |
| 9 | **Hindi and Kannada**: pricing, pilot banner, refund policy, Connect page and FAQ answers show in English. The existing translations are machine drafts. | `assets/i18n.js` | Needs a native speaker. |
| 10 | **"We reply within a day"** on the Contact page | `/contact/` | Keep only if you will. |
| 11 | **Hardware reality check**: the NFC stamp is now promised with every plan, including the cheapest. | Pricing | Make sure the per-shop cost of the NFC stamp and poster fits inside Rs 449 to 699 a month. |

## Parked on purpose (legal, you said later)
- Lawyer review of Privacy and Terms (DPDP Act wording, courts' city, entity name once registered).
  The refund policy I wrote is a plain-language draft, so include it in that review.
- GST: "No GST is charged" is true only while unregistered. Registration is required above
  Rs 20 lakh turnover for services. Check with a CA before you get close.
- Grievance email (`legal.grievanceEmail`): Privacy and Terms point to the contact page until set.

## Domain: decision needed in Vercel, not in code
You prefer `innondu.com`. The site, sitemap, QR codes and NFC tags all use `www.innondu.com`
(`siteUrl`, `assets/config.js` `publicOrigin`, `sitemap.xml`, canonical tags). To switch safely:
in Vercel > Domains make `innondu.com` primary with `www` redirecting to it, keep the redirect
forever (printed QR codes and NFC tags still point at `www`), then update those four places.
I did not change this in code: a wrong redirect rule can lock everyone out of the site.
