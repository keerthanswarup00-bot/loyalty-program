# Loyalty Kit (Phase 1)

Static digital stamp-card site: customer card, owner dashboard, offers (welcome, birthday, surprise), QR/NFC link.
No build step. Plain HTML, CSS and JavaScript.

## Files
| File | What it does | Edit it to... |
|---|---|---|
| `config.js` | Per-client branding and rules | change name, colour, logo, links, stamps, offers |
| `index.html` | Page shell | rarely |
| `style.css` | Look and feel | change design |
| `app.js` | All the logic | change features |

## Run locally (VS Code)
Open the folder in VS Code, install the "Live Server" extension, right-click `index.html` -> Open with Live Server.
Owner dashboard PIN: `1234` (change it in `config.js`).

## Put it on GitHub
1. Create an empty repo on github.com (e.g. `loyalty-kit`).
2. In the project folder:
```
git init
git add .
git commit -m "Phase 1"
git branch -M main
git remote add origin https://github.com/YOUR-USER/loyalty-kit.git
git push -u origin main
```

## Deploy on Vercel
1. vercel.com -> Add New -> Project -> import the GitHub repo.
2. Framework Preset: **Other**. Leave Build Command and Output Directory empty. Click Deploy.
3. Custom domain: Project -> Settings -> Domains -> add `cafe.yourdomain.com`, then add the CNAME record Vercel shows at your DNS provider.

## Update workflow
Edit files -> `git add .` -> `git commit -m "what changed"` -> `git push`. Vercel redeploys automatically in under a minute.
After editing `config.js`, raise `version` by 1, otherwise browsers that already visited keep the old settings.
Use a separate branch for experiments: Vercel gives every branch its own preview link.

## One client = one project
Copy the repo (or use one branch per client), edit `config.js` and add `logo.png`, deploy as a separate Vercel project with its own subdomain.

## Known limits (Phase 1)
- **Data is stored in each visitor's own browser.** The owner will NOT see customers who signed up on other phones. This is a demo/trial build. Phase 2 adds a database.
- The owner PIN and passwords are checked in the browser only. Do not collect real customer data with this version.
- Set `DEMO=false` at the top of `app.js` to hide the "Test scan" button.
