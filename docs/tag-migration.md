# Tag migration checklist (old address to innondu.com)

Printable checklist for moving every printed QR code and written NFC tag to the
new address. Work through it in order and tick each line.

- New address: `https://www.innondu.com/app/` (apex `innondu.com` redirects to `www`).
- Old address (kept alive): `https://royalty-prog.vercel.app`.
- Nothing already printed or written needs to stop working during the move.

## Where the links come from

The sign-up QR and the NFC stamp link are built at runtime from the address the
dashboard was opened on (`assets/admin.js`):

- Sign-up QR: `https://<address>/app/#join=<join_token>`
- NFC stamp tag: `https://<address>/app/#scan=<scan_token>`

Open the dashboard at `https://www.innondu.com/admin/` and every new link is a
new-address link automatically. Do **not** regenerate `join_token` or
`scan_token` to move addresses; that would break every existing tag.

## 1. Reprint the sign-up QR (from the new dashboard)

- [ ] Open `https://www.innondu.com/admin/` and sign in.
- [ ] Home tab: confirm the Sign-up link starts with `https://www.innondu.com/app/#join=`.
- [ ] Press **Download** to get the new sign-up QR SVG.
- [ ] Print it and put it at the counter, replacing the old one.
- [ ] Scan the printed QR with one iPhone and one Android phone; both must open the sign-up form.
- [ ] The QR & NFC card in **More → Moving to a new address** has the same Download and Copy buttons.

## 2. Rewrite every NFC stamp tag

- [ ] Open `https://www.innondu.com/admin/` → **More → Moving to a new address**.
- [ ] Press **Copy the stamp link**. It must start with `https://www.innondu.com/app/#scan=`.
- [ ] Install a free NFC app such as **NFC Tools**.
- [ ] In NFC Tools: **Write → Add a record → URL / URI**, then paste the stamp link.
- [ ] Hold the phone to the tag and tap **Write**.
- [ ] **Lock** the tag so it cannot be overwritten.
- [ ] Test the tag on **one iPhone** and **one Android phone**: tapping must add a stamp.

## 3. Keep the old address alive (at least 90 days)

- [ ] Leave `https://royalty-prog.vercel.app` serving the app (it forwards `#scan=` and `#join=` to `/app/`).
- [ ] Do not delete the old Vercel alias, and do not regenerate tokens, for at least 90 days.
- [ ] After 90 days, once no old tags remain, the old alias may be removed.

## 4. Rotate tokens (optional, only after everything above passes)

Rotating is permanent for every existing tag. Only do it once the old printed
codes and tags are gone.

- [ ] More → Stamp tag → **Regenerate code**; rewrite and retest every tag.
- [ ] Home → Sign-up QR → **Regenerate**; reprint and retest every QR.

## What customers will notice (tell the staff)

- **Signed out once.** Sessions are stored per web address, so every customer is
  signed out one time after the move. They log back in with their phone and
  password; their stamps, offers and history are all still there.
- **Home-screen app needs re-adding.** An app installed from the old address
  keeps pointing there. Ask customers to open `https://www.innondu.com/app/` and
  use **Add to Home Screen** again to get the new-address app.
- No new download, no new password, nothing to pay.

## CI secrets to update by hand

Update these GitHub repository secrets (Settings → Secrets and variables →
Actions) to point at the new address. Do not commit them.

- [ ] `SMOKE_BASE_URL` — `https://www.innondu.com`
- [ ] `SMOKE_JOIN_URL` — `https://www.innondu.com/app/#join=<join_token>`
- [ ] `SMOKE_STAMP_URL` — `https://www.innondu.com/app/#scan=<scan_token>`

The other `SMOKE_*` secrets (owner email/password, customer password, phone
prefix, daily flag, stamp count) do not change.
