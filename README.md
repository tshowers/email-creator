# TODD Email Creator

A single-page workspace where a signed-in TODD user chats with TODD about an
email (a marketing campaign, newsletter, invite, or a plain business email),
optionally attaches images (a logo, product photos), and gets a designed,
email-safe HTML email to preview and download.

- **Nothing is stored by default.** The conversation, uploads, and emails
  live only in the browser tab. Refreshing or leaving clears them (the page
  warns first if there are emails).
- **TODD login required.** Sign-in uses TODD's hosted login
  (`todd.taliferro.tech/login?client=email-creator-web`).
- **10 free emails per user per day**, reset at midnight Pacific time. After
  that, users can buy a 5-email credit pack (Stripe Checkout); credits don't
  expire.

## Downloads

Emails that use attached images offer three downloads:

| Option | What you get | Stored? |
|---|---|---|
| Download HTML | Image `src`s point to TODD-hosted copies. Works pasted into any email tool. | Images kept in Firebase Storage for **30 days**, then deleted |
| Download .zip | `email.html` + `images/` folder, for uploading to Mailchimp, Constant Contact, etc. | No |
| Download single file | Images embedded as data URLs. Easy to open/share; many inboxes block these images. | No |

"Copy HTML" copies the hosted-images version. Emails with no images just
download or copy the HTML.

## How it works

```
Browser ──chat──▶ todd-backend /api/email-creator/chat        (gpt-4o-mini: ask a question, or write a design brief)
        ──brief─▶ todd-backend /api/email-creator/generate    (gpt-5: brief → subject, preheader, HTML, to-do notes)
        ──image─▶ todd-backend /api/email-creator/host-image  (only for the hosted download)
        ──usage─▶ todd-backend /api/email-creator/usage       (today's count, limit, credits)
        ──send──▶ todd-backend /api/email-creator/handoff     (hand the email to Outreach / Catalyst)
        ──buy───▶ todd-backend /api/billing/checkout-credits  (Stripe Checkout for a credit pack)
```

The generated HTML refers to attached images as `src="todd-image:<id>"`; the
browser swaps those for data URLs (preview, single file), `images/…` paths
(zip), or hosted URLs.

Backend code: `taliferrotech/todd-backend/functions/emailCreator.service.js`,
`emailCreatorRoutes.js`, and `scheduledEmailCreatorRetention.js` (daily
cleanup of hosted images older than 30 days). Requests are authenticated
with a verified Firebase ID token. Firestore holds only a per-user daily
counter (`emailCreatorUsage/{uid}`).

Backend env vars (set on the `todd-backend` functions, not in this app):

| Variable | Required | Default | |
|---|---|---|---|
| `OPENAI_API_KEY` | yes | | Chat and HTML generation |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | for buying credits | | Checkout and the webhook that adds credits |
| `STRIPE_CREDITS_5_PACK_PRICE_ID` | for buying credits | | The $4.99 5-pack; the pack is only offered when this is set |
| `STRIPE_CREDITS_HOSTED_IMAGE_PRICE_ID` | no | | 200 hosted images; unset = hosted images are free-allowance only |
| `EMAIL_CREATOR_DAILY_LIMIT` | no | `10` | Emails per user per Pacific day |
| `EMAIL_CREATOR_HOSTED_IMAGE_DAILY_LIMIT` | no | `40` | Hosted image uploads per user per day |
| `EMAIL_CREATOR_HTML_MODEL` | no | `gpt-5` | Model that designs the HTML |
| `EMAIL_CREATOR_CHAT_MODEL` | no | `gpt-4o-mini` | Model for the conversation |

A tenant can override the two daily limits with `emailCreatorDailyLimit` and
`emailCreatorHostedImageDailyLimit` on its tenant record.

## Development

### Prerequisites

- **Node 22** and npm (Angular 19).
- **The `taliferro-ui` repo checked out next to `web-products/`.** The app
  depends on `"@taliferro/ui": "file:../../taliferro-ui"` (tokens, universal
  menu, Help/About template, footer), so the layout must be:

  ```
  corporate/
  ├── taliferro-ui/
  └── web-products/
      └── email-creator/
  ```

  `npm install` fails without it.
- **A TODD account** to sign in with. Chat and generate go to the production
  API, so there is no local backend to run.
- For deploys only: the Firebase CLI (`npm i -g firebase-tools`), logged in
  with access to the `taliferrotech` project.

### Configuration

There are no `.env` files. Everything the browser needs is in
`src/environments/environment*.ts` (committed):

| Key | Value | |
|---|---|---|
| `PLATFORM_URL` | `https://emails.taliferro.tech` | Public site URL |
| `backendURL` | `https://api.taliferro.tech/api` | todd-backend; used in dev too |
| `firebaseConfig` | `taliferrotech` web app | Public by design; Auth and the backend enforce access |

Sign-in goes to `todd.taliferro.tech/login` with client `email-creator-web`,
or `email-creator-web-local` when the app runs on `localhost`/`127.0.0.1`.
That local client returns to `http://localhost:4200/auth/callback`, so use
port 4200.

### Commands

```bash
npm install
npm start            # http://localhost:4200
npm run build        # production build → dist/email-creator (prerenders /, /help, /about)
npm run typecheck    # TypeScript validation
npm run test:ci      # unit tests in ChromeHeadless
npm run e2e          # Cypress smoke tests against the dev server
```

Local dev calls the production API (`api.taliferro.tech`), so backend
changes must be deployed before chat/generate work locally. Port 4200 is
shared with the image creator; run one at a time. Google Analytics is skipped
on localhost.

### Shared code

Some files are synced from `taliferro-ui` and must not be edited here
(change them in `taliferro-ui` and re-run its `sync.sh`):
`src/app/shared/product-pages/`, `src/app/shared/site-footer/`,
`src/app/shared/platform-menu/`, `src/app/shared/also-from-us/`,
`src/app/services/sound.service.ts` and `public/assets/sounds/`. The Help and
About copy lives in `taliferro-ui/platform/product-pages.model.ts`.

## SEO

`/`, `/help` and `/about` are prerendered to static HTML at build time
(`src/app/app.routes.server.ts`); every other route renders in the browser.
`public/robots.txt` and `public/sitemap.xml` list the public pages. When
adding a public page, prerender it, add it to the sitemap, and bump the
sitemap's `lastmod` dates when the pages change.

## Deploy

```bash
./deploy.sh
```

The script selects the `taliferrotech` project, builds, runs unit tests,
Cypress and the typecheck, commits any pending changes as
`Deploy Email Creator <date>`, then runs
`firebase deploy --only hosting:todd-email-creator`. Push the commit to
GitHub afterward with `git push`.

The site is the Firebase Hosting site `todd-email-creator` at
`https://emails.taliferro.tech`. Prerendered pages are served as files; any
other path falls back to `index.csr.html`.

Backend (from `todd-backend`):

```bash
firebase deploy --only functions:api,functions:emailCreatorRetention
```
