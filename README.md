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
- **10 emails per user per day**, reset at midnight Pacific time.

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
```

The generated HTML refers to attached images as `src="todd-image:<id>"`; the
browser swaps those for data URLs (preview, single file), `images/…` paths
(zip), or hosted URLs.

Backend code: `taliferrotech/todd-backend/functions/emailCreator.service.js`,
`emailCreatorRoutes.js`, and `scheduledEmailCreatorRetention.js` (daily
cleanup of hosted images older than 30 days). Requests are authenticated
with a verified Firebase ID token. Firestore holds only a per-user daily
counter (`emailCreatorUsage/{uid}`).

Backend env vars (all optional):

| Variable | Default | |
|---|---|---|
| `EMAIL_CREATOR_DAILY_LIMIT` | `10` | Emails per user per Pacific day |
| `EMAIL_CREATOR_HOSTED_IMAGE_DAILY_LIMIT` | `40` | Hosted image uploads per user per day |
| `EMAIL_CREATOR_HTML_MODEL` | `gpt-5` | Model that designs the HTML |
| `EMAIL_CREATOR_CHAT_MODEL` | `gpt-4o-mini` | Model for the conversation |

## Development

```bash
npm install
npm start          # http://localhost:4200 - sign-in returns here via client email-creator-web-local
npm run build      # production build → dist/email-creator/browser
```

Local dev calls the production API (`api.taliferro.tech`), so the backend
changes must be deployed before chat/generate work locally. Port 4200 is
shared with the image creator; run one at a time.

## Deploy

```bash
npm run build
firebase deploy --only hosting:email-creator
```

One-time setup:
1. Create the Firebase Hosting site `todd-email-creator` in the `taliferrotech` project.
2. Connect the custom domain `emails.taliferro.tech` to it.
3. Deploy the backend (`firebase deploy --only functions:api,functions:emailCreatorRetention` from `todd-backend`).
