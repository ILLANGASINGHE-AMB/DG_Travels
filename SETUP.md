# DG Travels — Setup Guide

The website is plain HTML/CSS/JS. Feedback is stored in **Supabase** and you get an
**email** whenever someone submits a review. Hosting is **Vercel**.

```
index.html          Main website (reads reviews from /api/reviews)
feedback.html       The page the QR code opens — name, email, feedback, rating
api/feedback.js     POST — validates, saves to Supabase, emails you
api/reviews.js      GET  — public review feed (never returns email addresses)
api/config.js       GET  — public runtime config (Maps browser key)
api/distance.js     POST — driving distance for the booking form
api/_supabase.js    Supabase REST helper
api/_notify.js      Resend email helper
supabase/schema.sql The table to create
vercel.json         Clean URLs + security headers
```

There are **no npm dependencies** — everything uses built-in `fetch`.

---

## Step 1 — Create the Supabase table

1. Go to [supabase.com](https://supabase.com) → create a project (free tier is fine).
2. Open **SQL Editor → New query**.
3. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and press **Run**.

This creates a `feedback` table and turns on Row Level Security with no policies,
so the table can only be reached by your server code — never from a browser.

Then collect two values from **Project Settings → API**:

| Value | Where |
|---|---|
| Project URL | `https://xxxxx.supabase.co` |
| `service_role` key | Under "Project API keys" — click reveal |

> **The `service_role` key is a master key.** Never paste it into HTML, never commit
> it. It only ever goes in Vercel's Environment Variables.

---

## Step 2 — Create a Resend account (for the email alerts)

1. Sign up at [resend.com](https://resend.com) (free tier: 100 emails/day).
2. Go to **API Keys → Create API Key**, copy it (starts with `re_`).

You can start immediately using the shared sender `onboarding@resend.dev`, but it
**only delivers to the email address that owns the Resend account**. To send to any
address, add your domain under **Domains** and verify it, then set
`NOTIFY_EMAIL_FROM` to something like `DG Travels <feedback@yourdomain.com>`.

---

## Step 3 — Google Maps (booking form)

The booking form suggests addresses as you type and works out the driving
distance for the WhatsApp message. Both need Google Maps Platform.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project
   and enable billing (Maps has a monthly free allowance).
2. Enable these APIs: **Maps JavaScript API**, **Places API**, and **Routes API**
   (or **Distance Matrix API** — the code tries Routes first and falls back).
3. Create **two** keys under *APIs & Services → Credentials*:

| Key | Restrict it to | Used by |
|---|---|---|
| Browser key | HTTP referrers = your Vercel domain; APIs = Maps JavaScript + Places | The address autocomplete on the page |
| Server key | APIs = Routes API (+ Distance Matrix) | `/api/distance` only, never sent to the browser |

The browser key is necessarily public — any in-page Maps integration exposes one.
The referrer restriction is what stops someone else spending your quota, so do not
skip it. The server key never leaves Vercel.

> **This step is optional.** With no keys set, the address fields stay plain text
> boxes and the WhatsApp message says `Distance: To be confirmed`. Everything
> else works exactly the same.

---

## Step 4 — Deploy to Vercel

1. Put this folder in a GitHub repository.
2. At [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. Framework preset: **Other**. No build command, no output directory.
4. Before deploying, open **Environment Variables** and add these:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | your `service_role` key |
| `RESEND_API_KEY` | `re_...` |
| `NOTIFY_EMAIL_TO` | the address that should receive alerts |
| `GOOGLE_MAPS_BROWSER_KEY` | the referrer-restricted browser key (optional) |
| `GOOGLE_MAPS_SERVER_KEY` | the server key for distance lookups (optional) |

Optionally add `NOTIFY_EMAIL_FROM` once you have verified a domain in Resend.

5. **Deploy.**

> Changing an environment variable later requires a **redeploy** before it takes effect.

---

## Step 5 — Point the QR code at your live site

The QR code is generated in the browser, so it currently encodes whatever address the
page is open at. Before you **print** a standee, pin it to the real domain:

Open `index.html`, find this line near the QR section (search for `SITE_URL`):

```js
const SITE_URL = ''; // e.g. 'https://dgtravels.vercel.app'
```

Set it to your deployed domain:

```js
const SITE_URL = 'https://dgtravels.vercel.app';
```

Redeploy, then reload the site and use **Full Screen QR** to display or screenshot the
code for printing. Scanning it opens `https://your-domain/feedback` — the feedback
screen only, exactly as intended.

If you later connect a custom domain, update `SITE_URL` and **reprint the QR code**.

---

## How it works

```
Passenger scans QR
        ↓
  /feedback  (feedback.html)
        ↓  POST /api/feedback
   validate → save to Supabase → email you via Resend
        ↓
  "Thank you" screen
        ↓
Review appears on the homepage via GET /api/reviews
```

- **Reviews go live immediately.** Every submitted review shows on the homepage as soon
  as it is saved.
- **Email addresses are never published.** `/api/reviews` selects only
  `id, name, message, rating, created_at`.
- **If the email fails**, the feedback is still saved — you will find it in Supabase.
- **A honeypot field** silently discards basic bot submissions.

---

## Moderating reviews

Since reviews publish immediately, you may occasionally want to remove one.

Supabase dashboard → **Table Editor → feedback** → select the row → **Delete**.

Or use SQL Editor:

```sql
select created_at, rating, name, email, message
  from public.feedback order by created_at desc;

delete from public.feedback where id = 'paste-the-uuid';
```

It disappears from the website within a minute (the review feed is edge-cached for 60
seconds).

---

## Testing locally

Opening `index.html` directly from the file system works, but the review feed and the
feedback form need the `/api` routes, so use the Vercel CLI:

```bash
npm i -g vercel
vercel dev
```

Create a `.env.local` from `.env.example` first (see that file for the variable names).
`vercel dev` serves the site at `http://localhost:3000` with the API routes running.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "The feedback service is not configured yet" | `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` missing in Vercel — add them and redeploy |
| "Could not save your feedback right now" | Table not created, or the key is the `anon` key rather than `service_role` |
| Reviews say "temporarily unavailable" | Same as above — check the function logs in Vercel → Deployments → Functions |
| Feedback saves but no email arrives | Check spam; confirm `RESEND_API_KEY` and `NOTIFY_EMAIL_TO`. With the default sender, delivery only works to the Resend account owner's address |
| QR opens the wrong address | `SITE_URL` in `index.html` is unset or stale — update it and reprint |
| No address suggestions while typing | `GOOGLE_MAPS_BROWSER_KEY` missing, or the key's referrer restriction does not include your domain |
| Message says "Distance: To be confirmed" | No Maps key set, or Routes API / Distance Matrix API is not enabled on it — check the function logs |
| Maps billing warnings | Add the referrer restriction to the browser key and the API restriction to the server key |
