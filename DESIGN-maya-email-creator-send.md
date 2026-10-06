# Design: Maya → Email Creator → Catalyst (bulk) / Email Composer (single)

Status: **partly built (2026-10-01).** Web only.

- **Built:** Email Creator → Outreach.
  - A **Send it with Outreach** step on the preview hands a design to Catalyst (as its template) or the Email Composer.
  - It needs the **Outreach** subscription only, not Maya + Outreach as first planned (Ty's call, 2026-10-01). The master tenant is exempt.
  - Placeholders use TODD's `{{token}}` format:
    - Recipient tokens are filled per contact by Catalyst.
    - The signed-in user's own name, title and company are written in at generation.
    - `{{senderX}}` tokens are filled at handoff.
    - `{{unsubscribeUrl}}` becomes Outreach's link.
    - Any other token (`{{eventDate}}`) must be filled in by the user before handoff.
  - **Handoffs go through the backend,** not Firestore rules: `todd-backend` `emailCreatorHandoff.service.js` and `/email-creator/handoff*`.
- **Not built:** the Maya parts (`email-copy` from Maya, "Ask Maya to write it"), and the 90-day image retention (still 30).

## Goal

Stop copy-pasting between TODD products when making an email:

- Maya writes the words.
- Email Creator turns them into a designed, email-safe HTML email.
- The user sends it:
  - **in bulk** through Catalyst, or
  - **to one person** through Email Composer.

Each app keeps doing the part it owns. The receiving app always does the final step: it sends, with its own checks.

## Decisions (Ty, 2026-09-29)

| Question | Decision |
|---|---|
| Where can a designed email go? | The user chooses: **bulk → Catalyst** or **single → Email Composer**. Download stays available. |
| Image lifetime | Hosted images live **90 days** (up from 30). There are no "campaigns" to tie them to. |
| Email Creator's daily limit (10) | Designs made from a Maya handoff **count** toward it. |
| Platforms | **Web only.** There is no Email Creator iPhone app. |
| Who gets it | Tenants with **Maya and Outreach**, or the master tenant. |
| Order | Design first (this doc), build later. |

## What exists today

- **Shared handoffs.** `taliferro-ui/handoff/handoff.model.ts` defines the handoff format.
  - A producer app writes a `HandoffDraft` to `tenants/{tenantId}/handoffDrafts/{id}`, with a 24-hour expiry and `status: pending`.
  - The consumer app opens with `?draftHandoff=<id>`, checks `kind`, fills its own form, and marks the draft consumed.
  - `HANDOFF_CAPABILITIES` records which app consumes which kind.
  - The only kinds today are `email-draft` (Maya → Catalyst, a brief: contact ids plus a reason) and `move-draft`.
  - The Maya producer is in `maya-marketing/.../marketing-director-session.component.ts`. The Catalyst consumer is in `outreach/.../email-processor.component.ts`.
- **Email Creator** (`web-products/email-creator`, backend `emailCreator.service.js` / `emailCreatorRoutes.js`):
  - A chat produces a design brief, and `generate` returns the subject, preheader and HTML. Images are referenced as `todd-image:<id>`.
  - `host-image` stores images for `HOSTED_IMAGE_RETENTION_DAYS = 30`.
  - The daily limit is `EMAIL_CREATOR_DAILY_LIMIT = 10`.
  - Nothing is stored by default.
- **Catalyst** (Outreach `/email-processor`) already has a **template mode**.
  - It takes `templateHtml` and `templateSubject` containing tokens such as `{{firstName}}`.
  - For each contact in the queue, it renders the template: `generateTemplateEmailForContact` with `buildContactTokenMap`, and AI only for tokens that need it.
  - It then sends through `/send-email` with the usual pacing, daily cap, compliance footer and Signal Engine hand-off.
  - This is the natural bulk path.
- **Email Composer** (Outreach `/compose-email`, `email-create.component.ts`) sends one email to one recipient.
  - It pre-fills today only from navigation state and query parameters (campaign, sequence step, signal origin…).
  - It can't yet take a finished subject and HTML body.
- **Access:** `/account/summary` returns `writeAccess` for each product: App Store purchase or master tenant (`utils/accessControl.js`). Web apps read it through `WriteAccessService`.

## Prerequisite found while designing: handoff writes are blocked

`taliferrotech/frontend/firestore.rules` denies everything by default and has **no rule for `tenants/{tenantId}/handoffDrafts`**. So Maya's existing `setDoc` handoff to Catalyst is almost certainly rejected in production today. Fix this first:

```
match /tenants/{tenantId}/handoffDrafts/{draftId} {
  allow read, write: if hasTenantAccess(tenantId) || isTaliferroAdmin();
}
```

**Caveat:** `hasTenantAccess` only matches the tenant **owner** (`uid == tenantId`), so team members (`users/{uid}.companyId`) can't hand off. The same limitation exists for every tenant subcollection. **Better long-term:** create and consume handoffs through small backend endpoints that use the verified sign-in (see "Backend"), so rules don't matter and team members work.

## The user's experience

### Flow A: start in Maya

1. The user talks strategy with Maya: "Write the email announcing our fall offer."
2. Maya writes the **copy**: subject idea, message, call to action, audience, tone.
3. A button under Maya's reply: **Design it in Email Creator**.
4. Email Creator opens with Maya's copy already in the conversation, marked "From Maya". It skips questions the copy already answers and asks only for what's missing, usually the logo or photos. It generates the design, which counts toward today's 10.
5. On the preview: **What next?**
   - **Send in bulk (Catalyst):** the same design goes to many people, each personalized (first name, company…).
   - **Send to one person (Email Composer).**
   - **Download**, as today.

### Flow B: start in Email Creator

1. In Email Creator's chat, a button: **Ask Maya to write it.**
2. Email Creator calls Maya on the server with the user's business context (profile, offer, audience). The user doesn't leave the page.
3. Maya's copy appears in the conversation. From there it's Flow A from step 4.

### Sending in bulk (Catalyst)

- Catalyst opens in **template mode** with the design and subject loaded.
- Personalization tokens are shown ("This email uses: first name, company").
- The user picks who gets it: the stale-contact queue as today, a Lead Vault audience, or a filtered list.
- Catalyst renders each contact's copy. The user can preview a few, then starts the run.
- Sends go through `/send-email` as today: pacing, daily cap, compliance footer, and Signal Engine taking over each thread.

### Sending to one person (Email Composer)

- Composer opens with the subject and designed HTML already in the editor.
- The user picks the recipient (contact search), reviews, and sends through `/send-email` as today.

### Without Maya and Outreach

- The buttons stay visible, but lead to `/pricing`:
  - "Maya writes it for you — get the Maya app"
  - "Send it with Outreach — get the Outreach app"
- The master tenant always has access.
- Download keeps working for everyone.

## New handoff kinds (`taliferro-ui/handoff/handoff.model.ts`)

Add three kinds. Each is one payload interface plus one `HANDOFF_CAPABILITIES` entry, and the envelope stays unchanged. `HandoffAgent` also gains `'email-creator'` as a producer.

```ts
/** Maya -> Email Creator: the words, not the design. */
export interface EmailCopyPayload {
  subject: string;          // Maya's suggested subject line
  body: string;             // plain text / light markdown copy
  callToAction?: { label: string; url?: string };
  audience?: string;        // who it's for, in Maya's words
  tone?: string;            // e.g. 'warm', 'direct'
  personalization?: string[]; // tokens Maya wrote in, e.g. ['firstName']
}

/** Email Creator -> Email Composer: one finished email for one recipient. */
export interface EmailDesignPayload {
  subject: string;
  preheader?: string;
  html: string;             // hosted-image version only (never data URLs)
  imageUrls: string[];      // the hosted images it references (for retention)
  sourceEmailCreatorId?: string;
}

/** Email Creator -> Catalyst: the same design as a bulk template. */
export interface EmailTemplatePayload extends EmailDesignPayload {
  tokens: string[];         // e.g. ['firstName', 'company'] found in subject/html
}
```

| Kind | Producer | Consumer | Capability label |
|---|---|---|---|
| `email-copy` | Maya | Email Creator `/` | "Design it in Email Creator" |
| `email-design` | Email Creator | Outreach `/compose-email` | "Send to one person" |
| `email-template` | Email Creator | Outreach `/email-processor` (template mode) | "Send in bulk with Catalyst" |

## What changes where

### Email Creator (web)

- **Consumer:** on load, read `?draftHandoff=<id>`, check `kind === 'email-copy'`, and seed the conversation with the copy. Mark it consumed.
- **Flow B button:** "Ask Maya to write it" calls a new backend endpoint (below) and puts the returned copy into the conversation.
- **Personalization:** when the copy asks for it, the brief and generator keep tokens like `{{firstName}}` as literal text. The generator's HTML sanitizer must leave `{{...}}` untouched.
- **"What next?" step on the preview.** Choosing Bulk or Single will:
  1. host every attached image (the hosted-images HTML, never data URLs);
  2. write an `email-template` or `email-design` handoff;
  3. open Outreach with `?draftHandoff=<id>`.
- **Gating:** `writeAccess.maya && writeAccess.outreach`, or the master tenant, decided server-side. Signed in without both, the choices link to `/pricing`.

### Maya (web)

- **"Design it in Email Creator"** is offered on replies where Maya wrote email copy. The backend's reply marks those, for example `response.emailCopy`. It writes an `email-copy` handoff and opens `email-creator.taliferro.tech/?draftHandoff=<id>`.
- **The existing Maya → Catalyst brief (`email-draft`) stays as it is.** It's still the right path when the user wants Catalyst to write each person's email itself.

### Outreach (web)

- **Email Composer:** read `?draftHandoff=<id>` with `kind === 'email-design'`. Pre-fill the subject and body editor with the HTML, and leave the recipient empty for the user to pick.
- **Catalyst:** read `kind === 'email-template'`. Switch on `useTemplate`, and set `templateHtml` and `templateSubject`. Then show the audience picker, and the rest of the run is unchanged.

### Backend

- **Handoff endpoints** use the verified sign-in, so tenant and team membership come from the token and not the rules:
  - `POST /handoffs` with `{kind, payload}` creates the draft. The tenant comes from the token, it checks the kind's access, and it sets expiry to 24 hours.
  - `GET /handoffs/:id` returns it only to the same tenant, only while pending and not expired.
  - `POST /handoffs/:id/consume` marks it consumed.

  Maya's existing browser-side `setDoc` should move to these too.
- **Maya copy for Flow B:** `POST /email-creator/maya-copy` with `{request, context?}`. It calls Maya's marketing-director drafting with the tenant's business context and returns an `EmailCopyPayload`. It requires Maya and Outreach, or the master tenant, and uses a verified token (Phase 2 identity).
- **Image retention:** change `HOSTED_IMAGE_RETENTION_DAYS` from 30 to **90** in `emailCreator.service.js`, and update the README and the "kept for 30 days" wording in the app.
- **Daily limit:** designs generated after a handoff go through the same `reserveGeneration` (10 a day). A Flow B "Ask Maya" call doesn't count, because it isn't a design.
- **Access check:** one helper, `canChainEmailProducts(tenant, tenantId) = hasWriteAccess(maya) && hasWriteAccess(outreach)`. Master tenant passes, because `hasWriteAccess` already includes it.

## Things to get right

- **Unsubscribe and compliance:** `/send-email` appends the compliance footer (unsubscribe link, mailing address). Email Creator's generator should **not** add its own unsubscribe link, to avoid two. Tell the generator in its brief when the destination is Catalyst or Composer.
- **Size:** `/send-email` rejects oversized HTML (`MAX_EMAIL_HTML_BYTES`). Hosted-image HTML is small, but check the size on the "What next?" step before handing off.
- **Tokens:** Catalyst's template mode already fills contact tokens and asks the AI only for unknown ones. Email Creator should stick to known tokens (`firstName`, `lastName`, `company`…) and show which ones the email uses.
- **Security:**
  - Every create and send uses the verified sign-in, with the tenant always from the token.
  - A handoff can only be read by its own tenant.
  - Handoffs expire after 24 hours.
  - The receiving app still runs all its own checks (sender approval, pacing, write access).
- **Nothing stored by default still holds.** Only what the user explicitly hands off is saved: the handoff doc, plus hosted images for 90 days.

## Build order (when prioritized)

1. **Prerequisite:** the handoff endpoints (or the rule above), and move Maya's existing handoff onto them.
2. **Email Creator → Composer (single):** the `email-design` kind, the "What next?" step, Composer pre-fill, 90-day images.
3. **Email Creator → Catalyst (bulk):** the `email-template` kind, Catalyst template-mode pre-fill, and an audience picker if it's missing.
4. **Maya → Email Creator (Flow A):** the `email-copy` kind and the Maya button.
5. **Ask Maya inside Email Creator (Flow B):** `/email-creator/maya-copy`.
6. Gating and `/pricing` links throughout.

**Tests for each step:** a backend unit test (access, tenant isolation, expiry, daily-limit counting), a browser test for each consumer route (`?draftHandoff=` pre-fills correctly, and a wrong kind is rejected), and one end-to-end run against the emulators.

## Still to confirm when building

- Should Catalyst's bulk audience include Lead Vault audiences from the start, or only the stale queue and contact lists?
- Should a bulk run from an Email Creator design also be saved as a reusable Catalyst template? (Not needed for v1.)
