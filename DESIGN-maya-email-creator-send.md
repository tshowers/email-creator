# Design: Maya → Email Creator → Catalyst (bulk) / Email Composer (single)

Status: **built (2026-10-14), not yet deployed.** Web only.

Maya writes the words, Email Creator designs the email, and Outreach sends it: in bulk through Catalyst, or to one person through Email Composer. Each app keeps doing the part it owns, and the receiving app always does the final step with its own checks.

This replaces the 2026-09-29 plan. That plan had generic `/handoffs` endpoints and new `taliferro-ui` handoff kinds, but the build went a simpler way: each flow got its own small backend endpoints. The shared `?draftHandoff=` mechanism (`taliferro-ui/handoff`) isn't used by any of these flows.

## The four flows

| Flow | Where it starts | How it works | Access |
|---|---|---|---|
| **Maya designs an email** | Maya's chat or work page | A `send_email` chat action starts a Maya job. Its `email.create` tool (`todd-backend/functions/maya/tools.js`) runs Email Creator's generator in-process, swaps in permanent library image URLs, and saves the email to Docs (`type: "email"`). It's previewed on Maya's work page. See `maya-marketing/MAYA-ORCHESTRATION-DESIGN.md`. | Maya |
| **Send it with Outreach** | Email Creator preview, or Maya's work page | `POST /email-creator/handoff/check`, then `POST /email-creator/handoff`. This writes `tenants/{t}/handoffDrafts/{id}` server-side and returns an Outreach link with `?emailCreatorHandoff=<id>`. Outreach reads it once with `GET /email-creator/handoff/:id`; it expires after 24 hours. | Outreach |
| **Ask Maya to write it** | Email Creator composer | The user types what the email is for and presses **Ask Maya to write it**. `POST /email-creator/maya-copy` has Maya write the copy, using the business profile and active marketing plan (`maya/context.js`). The copy appears in the chat as Maya's. Email Creator's own chat turn then designs it, as with any other message. | Maya |
| **Edit in Email Creator** | Maya's work page, on each finished email | The link opens `emails.taliferro.tech/?mayaEmail=<documentId>`. `GET /email-creator/maya-email/:documentId` returns the email with its library images as attachments. The design becomes the chat's current email, so the next message revises it. | Signed in (it's the workspace's own Docs) |

## Placeholders

Everything uses TODD's `{{token}}` format:

- **Recipient tokens** (`{{firstName}}`, `{{companyName}}`…) are filled per contact by Catalyst. For Email Composer, the user fills them in before handoff.
- **Sender tokens** (`{{senderName}}`…) are written in at generation from the signed-in user's profile, or filled at handoff.
- **`{{unsubscribeUrl}}`** becomes Outreach's own unsubscribe link.
- **Any other token** (`{{eventDate}}`) is a fact only the user knows. They must fill it in before handoff, so Catalyst's AI never invents it.

Maya's copy follows the same rules: no invented facts, and placeholders where a fact is missing.

## Backend (`taliferrotech/todd-backend/functions`)

| File | What it does |
|---|---|
| `emailCreatorRoutes.js` | All `/email-creator/*` routes. They require a verified Firebase ID token. `GET /usage` now also returns `canAskMaya`. |
| `emailCreatorHandoff.service.js` | Outreach handoff: tokens, fill-ins, the sender profile, and creating and taking handoffs. |
| `emailCreatorMaya.service.js` | `writeCopy` (Ask Maya), `loadMayaEmail` (Edit in Email Creator), `canAskMaya`. |

**Ask Maya:**

- **Access:** needs Maya write access (`hasWriteAccess(tenant, tenantId, "maya")`; the master tenant passes). Otherwise it returns a 403 `APP_PURCHASE_REQUIRED`.
- **Cost:** it doesn't use one of the day's 10 emails, because it isn't a design. It runs on TODD's shared, budget-capped AI client (`wrapOpenAIClient`, `MAYA_FAST_MODEL`, override with `EMAIL_CREATOR_MAYA_MODEL`). The design that follows counts as usual.

**Edit in Email Creator:**

- **Why the images need converting:** Email Creator's generator removes every `<img>` that isn't a `todd-image:<id>` placeholder. Maya's saved emails use library URLs, so `loadMayaEmail` turns them back into attachments (`m1`, `m2`…) as data URLs.
- **Which images it reads:** only files in TODD's bucket (`taliferrotech.appspot.com`) under the signed-in workspace's own `<tenantId>/` folder, read directly from Storage. It never makes an HTTP fetch, so it can't be pointed at another workspace or an outside URL.
- **Limits:** up to 12 images, 10 MB each, PNG/JPEG/WebP/GIF only.
- **Images it can't load** stay as URLs. The page warns that the next revision will leave them out.

## Email Creator (web)

- **Composer:** **Ask Maya to write it** sits next to "Logo or images". Without Maya, it links to `maya.taliferro.tech/pricing`.
- **Opening a Maya email:** `?mayaEmail=` is read once after sign-in, and then removed from the address bar. Sign-in now keeps the query string, so the link works for a signed-out user too.
- **Code:** helpers are in `src/app/utils/maya.ts`. The flows are `askMaya()` and `openMayaEmailFromLink()` in `creator.component.ts`.

## Maya (web)

- **Work page:** each finished email has **Edit in Email Creator** next to Preview and Download HTML (`emailCreatorEditUrl` in `features/work/work.component.ts`).

## Tests

- **Backend:** `__tests__/emailCreatorMaya.service.test.js` covers access, business context, malformed copy, the image path allowlist (other workspaces, other buckets, outside hosts, `..`), placeholder swapping, and skipped images. `emailCreatorHandoff.service.test.js` covers the Outreach handoff.
- **Email Creator:** `creator.component.spec.ts` covers:
  - Ask Maya: the copy shows as Maya's and is designed; it needs typed text; no access shows the pricing link; a 403 is handled.
  - Edit in Email Creator: it opens with images and clears the link; a revision sends the current HTML and its images; skipped images get a warning; errors are shown.

  `email-creator-api.service.spec.ts` and `utils/maya.spec.ts` cover the calls and helpers.
- **Maya:** `features/work/work.component.spec.ts` covers the edit link.

## Not done

- **Deploy and try it live:** backend functions first, then Email Creator and Maya. Test on the master tenant first.
- **Hosted images are still kept 30 days.** The 90-day plan wasn't built. Maya's emails don't need it, because they use permanent library URLs.
- **The Firestore rules have no `handoffDrafts` rule.** It isn't needed: only the backend reads and writes there. Maya no longer writes handoffs from the browser.
- **Still to decide:** whether Catalyst's bulk audience should include Lead Vault audiences, and whether a bulk run should be saved as a reusable Catalyst template.
