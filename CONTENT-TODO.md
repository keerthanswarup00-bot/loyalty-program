# Innondu: content you still need to provide

Nothing on the live site shows a placeholder any more. Anything below that is unset is simply
hidden (or falls back to the contact form) until you fill it. Set values in `assets/site.config.js`
unless another place is named. Ordered by how much it affects a shop owner deciding to sign up.

## 1. Blocks sign-ups (do these first)
| # | What | Where | Why it matters |
|---|------|-------|----------------|
| 1 | **WhatsApp number** (digits only, e.g. `919876543210`) | `whatsapp.number` | Every "WhatsApp us" button, the footer link and the mobile floating button fall back to the contact form until this is set. For Indian shop owners WhatsApp is the main way to reach you. |
| 2 | **Free pilot length** (e.g. `'30 days'`) | `pricing.pilotLength` | The pilot banner says "Start with a free pilot" with no duration. An open-ended free pilot gets abused and owners will ask. |
| 3 | **Phone number and email** | `founder.phone`, `founder.email` | Footer and About hide these until set. Also the real address for `legal.grievanceEmail` below. |
| 4 | **How long setup really takes** | `faq.setup` (add one sentence) | The setup answer deliberately has no time. "Same day" or "within 24 hours" is the question owners care most about. |
| 5 | **Is the NFC stamp / poster included or extra, and what does it cost?** | Add a line under the pricing cards or in `faq.cost` | The hardware showcase was removed from the homepage, so right now there is no answer to this anywhere. |

## 2. Builds trust (founder page)
| # | What | Where |
|---|------|-------|
| 6 | **Photo** of you (square, 600px+), save as `/assets/aryan.jpg` | `founder.photo` |
| 7 | **Why Innondu exists**: 2 honest sentences, in your voice | `founder.why` (shows a section on About and replaces the one-liner on the homepage) |
| 8 | **Role and city** (e.g. "Founder", "Bengaluru") | `founder.role`, `founder.city` |
| 9 | **What you do** (1 to 2 sentences) | `founder.work` |
| 10 | **Link-preview image** (1200x630) so WhatsApp and Google show a card when someone shares the site | `defaultOgImage` |
| 11 | **Real shops** with written permission (name, area, quote). Until you have one the "from real shops" section stays hidden, which is correct. | `proof` |

## 3. Business and legal decisions
| # | What | Notes |
|---|------|-------|
| 12 | **Refund policy** for upfront plans | Not stated anywhere. A shop that pays Rs 5,988 and leaves in month 2 will ask. Add a line to Terms, section "Fees". |
| 13 | **GST** | Site says "No GST is charged". True only while you are unregistered. Services businesses must register once turnover passes Rs 20 lakh a year; plan for prices becoming GST-inclusive. Check with a CA. |
| 14 | **Lawyer review of Privacy and Terms** | I filled the operator as "Aryan Swaroop", governing law as "India" and the date as 17 October 2026, and removed the "Draft" banner. Have a lawyer confirm, especially DPDP Act wording, the courts' city, and your legal entity name if you register a business. |
| 15 | **Grievance email** | `legal.grievanceEmail`. Privacy and Terms link to the contact page until this is set. |
| 16 | **"We reply within a day"** on the Contact page | Only keep it if you will actually do it. |
| 17 | **Primary domain**: `innondu.com` or `www.innondu.com` | `siteUrl` and `sitemap.xml` assume `www`. Set a redirect in Vercel so only one is live. |

## 4. Other pages
| # | What | Where |
|---|------|-------|
| 18 | DTS demo page says "Shop contact details to be confirmed." Get the real WhatsApp number and hours from the shop, or take the note off. | `/dts/index.html` |
| 19 | **Hindi and Kannada** versions: the new pricing text, pilot banner and FAQ answers show in English. The existing Hindi and Kannada are machine drafts and need a native speaker. | `assets/i18n.js` |
| 20 | Prefilled WhatsApp messages (hero, contact, connect, floating button) use a generic message until you write specific ones | `whatsapp.messages` |
| 21 | Cheesora Bliss: confirm it is OK to show the shop name and sample page publicly | `/connect/` |
