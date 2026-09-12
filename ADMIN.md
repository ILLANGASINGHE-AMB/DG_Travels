# DG Travels — Owner Login & Site Editor

The website has two modes.

**User View Mode** is the default and what every visitor gets. The page renders
its content, nothing is editable, and the only sign of any of this is a small
**Log In** button in the top bar.

**Admin Mode** starts when you sign in with your own account. A gold bar appears
at the top of the page and you can change the logo, the photos, the wording, the
tours, the vehicles, and which sections visitors see at all. The same bar is
where you raise a printed [quotation bill](#quotation-bills) for a customer.

Everything you save is live immediately. There is no publish step.

---

## Step 1 — Create the tables

1. Open your Supabase project → **SQL Editor → New query**.
2. Paste the whole of [`supabase/admin-schema.sql`](supabase/admin-schema.sql) and press **Run**.

That creates five tables (`admins`, `site_settings`, `site_sections`, `tours`,
`vehicles`), the storage bucket for your images, the Row Level Security that
keeps strangers out, and a copy of the wording the site currently ships with, so
the editor opens on your real content rather than an empty shell.

Running the file twice is safe — it never overwrites edits you have made.

---

## Step 2 — Create your account

**Authentication → Users → Add user**

- Email: your own address
- Password: something long
- Tick **Auto Confirm User**

Then make that account an administrator. SQL Editor → New query, with your email
in place of the example:

```sql
insert into public.admins (user_id, email)
select id, email from auth.users where email = 'you@example.com'
on conflict (user_id) do nothing;
```

Confirm it worked:

```sql
select email from public.admins;
```

> **Close the door behind you.** In **Authentication → Sign In / Providers**,
> turn **Allow new users to sign up** off. Nobody but you needs an account.
> Even with signups left on, a stranger's account can read the site content and
> nothing more — but there is no reason to allow one.

---

## Step 3 — Give the browser the anon key

The page needs your project's **anon** key to talk to Supabase. Find it under
**Project Settings → API → Project API keys → `anon` / publishable**.

Add it in Vercel → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `SUPABASE_ANON_KEY` | your `anon` key |

`SUPABASE_URL` is already there from the feedback setup.

Then **redeploy** — environment variables only take effect on a new deployment.

> The anon key is meant to be public; it is served to the page by `/api/config`.
> What it can do is decided entirely by Row Level Security: read the published
> site content, and nothing else until you sign in. Your `service_role` key is a
> different key and never leaves the server.

Reload the site. The **Log In** button appears in the top bar.

---

## Using the editor

Sign in and the admin bar appears at the top.

| Control | What it does |
|---|---|
| **Preview as visitor** | Hides all editing chrome so you see the real site. A gold pill at the bottom brings you back. |
| **Edit on page** | Outlines every editable piece of text. Click one, type, press Enter. |
| **Quotation** | Opens the quotation composer. See [Quotation bills](#quotation-bills). |
| **Editor** | Opens the side panel with the five tabs below. |
| **Log out** | Ends the session and returns the page to User View Mode. |

### Sections

A switch per section — Hero, Fleet & Booking, Popular Tours, About the Driver,
Reviews & QR. Switch one off and visitors stop seeing it, along with its link in
the navigation and the mobile drawer.

While you are logged in a switched-off section stays on screen, dimmed, with a
**Hidden from visitors** label, so you can keep working on it. Use *Preview as
visitor* to confirm what the public actually gets.

### Branding

The header logo, the big hero logo, and your portrait — **Upload** a file or
**Use a link** to point at an image you already host. Uploads go to the
`site-assets` bucket in Supabase Storage. Keep them under 6 MB; a square PNG with
a transparent background suits the logo slots.

Below the images: the brand name, the sub-line, your phone number and your
WhatsApp number. Changing the phone number here updates every *Call* button, the
footer, and the tap-to-dial links; changing the WhatsApp number updates every
chat button and the booking form's message — the wording of each message is
preserved.

### Content

Every other piece of wording on the page, grouped by section. Only the fields you
actually change are written, so two tabs open at once can never overwrite each
other.

### Tours

Add, edit, reorder, hide and delete the cards in *Popular Tours*. Highlights are
one per line. The **WhatsApp message** is what gets pre-filled when a visitor
taps *Inquire on WhatsApp* on that card; leave it blank for a sensible default.
A tour photo is optional and appears above the highlights.

### Vehicles

The same, for the fleet picker inside the booking form. Each vehicle has a name,
a type badge, an icon (or a photo, which replaces the icon), and two lines of
specs. The name is what appears in the WhatsApp booking message.

Hiding a vehicle rather than deleting it keeps its details for later — it just
stops being offered.

---

## Quotation bills

**Quotation** on the admin bar opens a form that prints an A4 quotation on your
own letterhead — logo, brand name, phone, WhatsApp and base, all taken from
whatever Branding currently holds. Change the phone number in Branding and the
next quotation carries the new one.

### Before the first one

Open Supabase → **SQL Editor → New query**, paste the whole of
[`supabase/quotations-schema.sql`](supabase/quotations-schema.sql) and press
**Run**. It needs `admin-schema.sql` to have been run first.

That creates one table, `quotations`, and the counter behind the reference
numbers. Unlike the site content, **nothing in this table is public** — a
quotation holds a customer's name, phone and email, so only an account listed in
`public.admins` can read it at all.

Running the file again is safe and is how you upgrade: it adds anything missing
and never touches a quotation you have already raised.

Numbering starts at REF-001. To carry on from a paper book instead, run
`select setval('public.quotation_ref_seq', 128);` and the next one is REF-129.

### Filling it in

The reference number and the timestamp are added for you when you press
**Create & print** — you never type either.

Everything else is yours, and only four things are actually required:

| Field | |
|---|---|
| Customer name, contact no, email | Optional. Leave all three blank and the customer block is left off the printed sheet entirely. |
| **Trip type** | One way or return. Required. |
| **Pickup location** | Required. |
| Other locations | Optional, and as many as the route needs. **Add a stop** puts another box on the end; the × removes one and the rest renumber. They print as a numbered list in the order you enter them. An empty box is simply ignored. |
| **Return location** | Appears, and is required, only for a return trip. |
| Date & time of journey | Optional. |
| Distance | Yours to fill. **Look up** appears once the route has somewhere to go, and works out the driving distance from the pickup to the last point — the return location, or the final stop. It ignores everything in between, so treat it as a starting figure and overwrite it if you disagree. |
| **No. of passengers** | Required. |
| No. of luggage | Optional. |
| **Vehicle type** | Required. The list is your fleet; *Other* lets you type in a hired vehicle. |
| Special requests | Optional. A child seat, a surfboard rack, a name board at arrivals — whatever the trip needs. |
| Driver name | Starts as your own name from the About section. |
| Fare (LKR) | Leave blank and the fare band is left off the sheet, which is what you want when the price is still being discussed. |

Every quotation also prints a fixed **Important** note under the fare, saying the
fare covers the trip only and not tolls, parking, entrance fees, night fees or
extra kilometres. It is not a field and cannot be switched off. To reword it,
edit `QUOTE_IMPORTANT` near the top of the quotation section in
[`assets/admin.js`](assets/admin.js); reprints of older quotations pick up the
new wording too.

### Printing

**Create & print** saves the quotation, then shows the finished A4 sheet.
**Print / Save as PDF** opens your browser's print dialogue — choose your printer
for paper, or *Save as PDF* to send it by WhatsApp or email. Set the paper size
to A4 and margins to none or default; the sheet carries its own margins.

The page it prints is the sheet and nothing else. The site behind it, the admin
bar and the toolbar buttons are all left off the paper.

Most quotations come out on a single sheet. A long route or a long list of
special requests will run onto a second, which is fine — it breaks between stops
rather than through one, and every page carries the same margins. What you see in
the preview is what comes out of the printer, so if you want it back to one page,
that is the screen to trim it on.

### Going back to one

Past quotations are listed at the foot of the composer, newest first. The printer
icon reopens one exactly as it was printed, so a customer who has lost their copy
can be sent another with the same reference number. The bin deletes one for good.

**If saving fails** — the table not created yet, or no connection — you are asked
whether to print anyway. Say yes and the sheet comes out with a temporary
reference number and a line saying it was not recorded, so a customer waiting at
the car still leaves with a bill.

---

## Notes

**Nothing here can break the site.** If Supabase is unreachable, the key is
missing, or a request fails, the page falls back to the copy written into
`index.html` and the Log In button stays hidden. Visitors still get a working
site and a working booking form.

**Your session lasts an hour and renews itself** while you are working. It
survives a page reload. Log out when you are done on a shared computer.

**Forgotten password**: enter your email in the login box and press *Forgot your
password?* — Supabase emails you a reset link. Or reset it yourself from
Authentication → Users.

**Where the content lives**: Supabase → Table Editor. `site_settings` holds the
text and image paths as key/value rows, `tours` and `vehicles` a row each,
`site_sections` the show/hide switches. You can edit any of it there directly if
you prefer.

**Reviews are separate.** Passenger feedback still goes through `/api/feedback`
into the `feedback` table, which the browser cannot read — see
[SETUP.md](SETUP.md). Moderate reviews from the Supabase dashboard as before.

---

## If something is not working

| Symptom | Cause |
|---|---|
| No **Log In** button | `SUPABASE_ANON_KEY` missing in Vercel, or no redeploy since you added it |
| "This account is not an administrator of this site." | The account is not in `public.admins` — run the insert in step 2 |
| "That email and password do not match." | Wrong password, or the user was never confirmed. Reset it under Authentication → Users |
| Saving says "Your session has expired" | Log out and back in |
| Uploads fail but everything else saves | The storage part of the schema did not run. Re-run the section under *7. Image storage* in `admin-schema.sql`, or create a public bucket named `site-assets` by hand |
| The editor shows "No sections found" | `admin-schema.sql` has not been run against this project |
| An edit saved but the page looks unchanged | Hard-reload once (⌘⇧R / Ctrl-F5). `/api/config` is edge-cached for five minutes |
| The quotation list says it could not load | `quotations-schema.sql` has not been run against this project |
| The printed quotation runs onto a second page | Set the paper size to A4 and the scale to 100% in the print dialogue |
