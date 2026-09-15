# DG Travels — Owner Login & Site Editor

The website has two modes.

**User View Mode** is the default and what every visitor gets. The page renders
its content, nothing is editable, and the only sign of any of this is a small
**Log In** button in the top bar.

**Admin Mode** starts when you sign in with your own account. A gold bar appears
at the top of the page and you can change the logo, the photos, the wording, the
tours, the gallery, the vehicles, and which sections visitors see at all. The same bar is
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
| **Quotations** | Raise a new quotation, or open a saved one. See [Quotation bills](#quotation-bills). |
| **Editor** | Opens the side panel with the six tabs below. |
| **Log out** | Ends the session and returns the page to User View Mode. |

### Sections

A switch per section — Hero, Fleet & Booking, Popular Tours, Gallery, About the
Driver, Reviews & QR. Switch one off and visitors stop seeing it, along with its link in
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

### Gallery

The photos in the *Gallery* section, between Popular Tours and About the Driver.

**Before the first one**, open Supabase → **SQL Editor → New query** and run
[`supabase/gallery-schema.sql`](supabase/gallery-schema.sql). It needs
`admin-schema.sql` to have been run first, and it is safe to run again.

**Add photo** takes one photo at a time, and every photo needs a **caption** and
the **date of the photo**. Visitors see both under it. The date starts as today;
change it to the day the photo was taken.

The section shows the four newest photos, newest date first. **View more photos**
underneath loads the next eight, and disappears once every photo is on screen.
Tapping a photo opens it full size with its caption and date; the arrows, the
keyboard arrow keys or a sideways swipe move between photos.

A large photo straight off a phone is resized to 2000 pixels on its long edge
before it uploads, so the page stays quick on mobile data. Uploads go to the
`gallery` folder of the `site-assets` bucket. **Edit** (pen) changes a photo's
caption, its date or the image itself; **Delete** (bin) removes it for good, and
removes the uploaded file from storage along with it.

The section and its link in the navigation are always shown. Until the first
photo is added, visitors see a short note that photos are on their way; while you
are logged in, the note tells you where to add them instead.

### Vehicles

The same, for the fleet picker inside the booking form. Each vehicle has a name,
a type badge, an icon (or a photo, which replaces the icon), and two lines of
specs. The name is what appears in the WhatsApp booking message.

Hiding a vehicle rather than deleting it keeps its details for later — it just
stops being offered.

---

## Quotation bills

**Quotations** on the admin bar opens a dialog with two tabs: **New quotation**,
which is the form below, and **Saved quotations**, which is every bill you have
ever raised. A new quotation prints on your own letterhead — logo, brand name, phone, WhatsApp and base, all taken from
whatever Branding currently holds. Change the phone number in Branding and the
next quotation carries the new one.

A quotation is **one or more trips sharing a vehicle and a party of
passengers**. Each trip has its own route, distance and fare. The passengers,
the luggage, any special request, the vehicle, the driver, the allowance and the
totals are stated once and apply to the lot.

### Before the first one

Open Supabase → **SQL Editor → New query** and run these two files in order:

1. [`supabase/quotations-schema.sql`](supabase/quotations-schema.sql) — the table,
   the reference-number counter and the access rules.
2. [`supabase/quotations-trips-migration.sql`](supabase/quotations-trips-migration.sql) —
   reshapes it to hold several trips per quotation.

Both need `admin-schema.sql` to have been run first, and both are safe to run
again: they add what is missing and carry existing quotations across rather than
dropping them. If you raised quotations before the second file existed, each one
becomes a single-trip quotation with its details intact.

Unlike the site content, **nothing in this table is public** — a quotation holds
a customer's name, phone and email, so only an account listed in `public.admins`
can read it at all.

Numbering starts at REF-001. To carry on from a paper book instead, run
`select setval('public.quotation_ref_seq', 128);` and the next one is REF-129.

### Filling it in

The reference number and the timestamp are added for you when you press
**Create & print** — you never type either.

**Customer** — name, contact no and email, all optional. Leave all three blank
and the line is left off the printed sheet entirely. When they are filled they
print as a single line, so they cost almost no space on the page.

**Trip details** — one card per trip. **Add trip** puts another card on the end
and **Remove** takes one away; the rest renumber themselves, and the last
remaining trip has no Remove button because a quotation needs at least one.

| Per trip | |
|---|---|
| **Trip type** | One way or return. Required, and it decides which of the next two boxes you get. |
| **Pickup location** | Required. |
| Other locations | Optional, and as many as the route needs. **Add a stop** puts another box on the end; the × removes one and the rest renumber. They print as a numbered list in the order you enter them, and an empty box is ignored. |
| **Destination** | Required on a one-way trip. |
| **Return location** | Required on a return trip. |
| Date & time of journey | Optional. |
| **Trip distance (km)** | Required, in kilometres, because the trips add up to the total distance. **Look up** appears once the trip has somewhere to go and measures pickup to the end of the route; it ignores the stops in between, so treat it as a starting figure and overwrite it if you disagree. |
| Trip fare (LKR) | Yours to fill. It prints beside that trip's heading. |

**Passenger details** — the same party travels every trip, so these are filled
once and apply to all of them.

| | |
|---|---|
| **No. of passengers** | Required. |
| No. of luggage | Optional. |
| Special requests | Optional. A child seat, a surfboard rack, a name board at arrivals. |

**Vehicle details** — likewise filled once and applied to every trip.

| | |
|---|---|
| **Vehicle type** | Required. The list is your fleet; *Other* lets you type in a hired vehicle. |
| Driver name | Starts as your own name from the About section. |
| Driver allowance (LKR) | Optional, and worth filling — it is added to the total. |
| **Total distance** | Worked out for you: every trip distance added up. |
| **Total fare** | Worked out for you: every trip fare plus the driver allowance. |

Both totals update as you type and cannot be edited directly, so what prints can
never disagree with the trips above it.

Every quotation also prints a fixed **Important** note under the total, saying
the fare covers the trip only and not tolls, parking, entrance fees, night fees
or extra kilometres. It is not a field and cannot be switched off. To reword it,
edit `QUOTE_IMPORTANT` near the top of the quotation section in
[`assets/admin.js`](assets/admin.js); reprints of older quotations pick up the
new wording too.

### What the printed sheet shows

Top to bottom: your letterhead, the word **Quotation**, then **Prepared for** on
the left with the customer's name and contact, and **Reference** on the right with
the number, the timestamp and a pill each for the passengers and the luggage.

Then a card per trip, each with a gold edge: the trip number and whether it is
one way or return, its fare at the top right, the route down the left, and its
distance and date down the right.

Below the trips, **Service details** — vehicle, driver, total distance, allowance,
and any special request. Then the **Total fare** band, the **Important** note, and
your signature line.

### Printing

**Create & print** saves the quotation, then shows the finished A4 sheet.
**Print / Save as PDF** opens your browser's print dialogue — choose your printer
for paper, or *Save as PDF* to send it by WhatsApp or email.

**Two settings, once.** In the print dialogue set the paper size to **A4** and
turn **Headers and footers** off. Leave them on and the browser prints today's
date and the page title across the top of your letterhead. Every browser
remembers both settings, so this is a one-time job. The preview reminds you above
the sheet.

The page it prints is the sheet and nothing else. The site behind it, the admin
bar and the toolbar buttons are all left off the paper.

The layout is built to keep the page count down: a quotation of one or two trips
normally comes out on a single sheet. Three trips or a long route will run onto a
second, which is fine — it breaks between stops
rather than through one, and every page carries the same margins. What you see in
the preview is what comes out of the printer, so if you want it back to one page,
that is the screen to trim it on.

### Saved quotations

The second tab lists every quotation you have raised, newest first. Each row
carries its reference number, the customer, the date, the vehicle and the total.

| Action | |
|---|---|
| **View** (eye) | Opens the quotation exactly as it was printed, same reference number and all. A customer who has lost their copy can be handed another. |
| **Download** (arrow) | Opens the same sheet and goes straight to your print dialogue. Choose **Save as PDF** as the destination and you get a file to send on WhatsApp or by email; choose a printer and you get paper. |
| **Delete** (bin) | Removes it for good, after asking. |

**Back**, at the top left of a quotation you have opened, returns you to the list
where you left it.

**Searching.** The box at the top matches the reference number, the customer's
name, phone or email, and the vehicle. Type a few characters and the list narrows
as you pause. It searches every quotation in the database, not only the ones on
screen. The route is inside each quotation rather than in a column of its own, so
pickup and destination are not searchable — look the trip up by customer or
reference instead.

**Older ones.** Twenty-five load at a time; **Load older** fetches the next
twenty-five, and the button disappears when you have reached the end.

**If saving fails** — the tables not created yet, or no connection — you are
asked whether to print anyway. Say yes and the sheet comes out with a temporary
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
text and image paths as key/value rows, `tours`, `vehicles` and
`gallery_photos` a row each, `site_sections` the show/hide switches. You can edit any of it there directly if
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
| The quotation list says it could not load | One of the two quotation SQL files has not been run against this project |
| The Gallery tab says it could not load, or there is no Gallery switch under Sections | `gallery-schema.sql` has not been run against this project |
| No Gallery section or nav link on the site | The Gallery switch under Sections is off, or the latest code has not been deployed |
| Visitors still see "photos are on their way" after you added photos | Hard-reload once. If it persists, `gallery-schema.sql` has not been run against the live project |
| The printed quotation runs onto a second page | Set the paper size to A4 and the scale to 100% in the print dialogue |
