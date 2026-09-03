-- ============================================================
--  DG Travels — Admin / CMS Schema
--  Run this once: Supabase dashboard → SQL Editor → New query → Run
--
--  This adds the tables the website reads to render its content, plus
--  the Row Level Security that lets ONLY a listed admin change them.
--
--  Unlike `feedback` (server-only, no browser access), these tables are
--  read straight from the browser with the public anon key. That is safe
--  because every row here is published content anyway. Writes are locked
--  to accounts listed in public.admins.
-- ============================================================


-- ------------------------------------------------------------
--  1. Who is allowed to edit the site
-- ------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- SECURITY DEFINER so the check itself is not subject to RLS —
-- without it, every policy below would recurse into this table.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- An admin may read the admin list (so the panel can confirm the role).
-- Nobody can write to it from the browser — add admins with SQL only.
drop policy if exists "admins read own row" on public.admins;
create policy "admins read own row"
  on public.admins for select
  to authenticated
  using (user_id = auth.uid());


-- ------------------------------------------------------------
--  2. Free-form site content (logos, headings, phone numbers…)
--     One row per editable field, addressed by a stable key.
-- ------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now(),

  constraint site_settings_key_len   check (char_length(key) between 1 and 120),
  constraint site_settings_value_len check (value is null or char_length(value) <= 8000)
);

alter table public.site_settings enable row level security;

drop policy if exists "settings are public" on public.site_settings;
create policy "settings are public"
  on public.site_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "admins write settings" on public.site_settings;
create policy "admins write settings"
  on public.site_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ------------------------------------------------------------
--  3. Which sections show on the public site
-- ------------------------------------------------------------
create table if not exists public.site_sections (
  key        text primary key,
  label      text    not null,
  visible    boolean not null default true,
  sort_order int     not null default 0
);

alter table public.site_sections enable row level security;

drop policy if exists "sections are public" on public.site_sections;
create policy "sections are public"
  on public.site_sections for select
  to anon, authenticated
  using (true);

drop policy if exists "admins write sections" on public.site_sections;
create policy "admins write sections"
  on public.site_sections for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ------------------------------------------------------------
--  4. Tour packages
-- ------------------------------------------------------------
create table if not exists public.tours (
  id            uuid primary key default gen_random_uuid(),
  tag           text,
  title         text not null,
  items         jsonb not null default '[]'::jsonb,
  footer_note   text,
  whatsapp_text text,
  image_url     text,
  visible       boolean not null default true,
  sort_order    int     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint tours_title_len check (char_length(title) between 1 and 160),
  constraint tours_items_arr check (jsonb_typeof(items) = 'array')
);

create index if not exists tours_sort_idx on public.tours (sort_order, created_at);

alter table public.tours enable row level security;

drop policy if exists "tours are public" on public.tours;
create policy "tours are public"
  on public.tours for select
  to anon, authenticated
  using (true);

drop policy if exists "admins write tours" on public.tours;
create policy "admins write tours"
  on public.tours for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ------------------------------------------------------------
--  5. Fleet vehicles (these also populate the booking form)
-- ------------------------------------------------------------
create table if not exists public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  badge           text,
  icon            text not null default 'fa-solid fa-car-side',
  specs_primary   text,
  specs_secondary text,
  image_url       text,
  visible         boolean not null default true,
  sort_order      int     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint vehicles_name_len check (char_length(name) between 1 and 120)
);

create index if not exists vehicles_sort_idx on public.vehicles (sort_order, created_at);

alter table public.vehicles enable row level security;

drop policy if exists "vehicles are public" on public.vehicles;
create policy "vehicles are public"
  on public.vehicles for select
  to anon, authenticated
  using (true);

drop policy if exists "admins write vehicles" on public.vehicles;
create policy "admins write vehicles"
  on public.vehicles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ------------------------------------------------------------
--  6. Keep updated_at honest
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tours_touch on public.tours;
create trigger tours_touch before update on public.tours
  for each row execute function public.touch_updated_at();

drop trigger if exists vehicles_touch on public.vehicles;
create trigger vehicles_touch before update on public.vehicles
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.site_settings;
create trigger settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();


-- ------------------------------------------------------------
--  7. Image storage — logos, the driver photo, tour/vehicle shots
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "site assets are public" on storage.objects;
create policy "site assets are public"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'site-assets');

drop policy if exists "admins upload site assets" on storage.objects;
create policy "admins upload site assets"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'site-assets' and public.is_admin());

drop policy if exists "admins update site assets" on storage.objects;
create policy "admins update site assets"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'site-assets' and public.is_admin())
  with check (bucket_id = 'site-assets' and public.is_admin());

drop policy if exists "admins delete site assets" on storage.objects;
create policy "admins delete site assets"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'site-assets' and public.is_admin());


-- ============================================================
--  8. Seed — mirrors what the page ships with, so the panel opens
--     on the real content instead of an empty shell.
--     Re-running this file never overwrites your later edits.
-- ============================================================

insert into public.site_sections (key, label, visible, sort_order) values
  ('hero',     'Hero & Intro',            true, 10),
  ('booking',  'Fleet & Booking Form',    true, 20),
  ('tours',    'Popular Tours',           true, 30),
  ('about',    'About the Driver',        true, 40),
  ('feedback', 'Reviews & QR Code',       true, 50)
on conflict (key) do nothing;

insert into public.site_settings (key, value) values
  ('brand.name',            'DG TRAVELS'),
  ('brand.sub',             'SRI LANKA'),
  ('brand.logo',            'LOGO/DG - 1.png'),
  ('brand.hero_logo',       'LOGO/DG_logo_Tp.png'),
  ('contact.phone',         '+94 77 826 1901'),
  ('contact.whatsapp',      '94778261901'),
  ('hero.badge',            'Premium Private Transport'),
  ('hero.title',            'Experience Sri Lanka with'),
  ('hero.title_accent',     'DG Travels'),
  ('hero.lede',             'Personalized, safe, and luxurious private transport for foreign tourists, surf travelers, and local guests. Operating from Galle across all scenic destinations in Sri Lanka.'),
  ('hero.stat1_num',        '4+'),
  ('hero.stat1_label',      'Years Experience (Est. 2022)'),
  ('hero.stat2_num',        '24/7'),
  ('hero.stat2_label',      'On-Call Island Dispatch'),
  ('hero.stat3_num',        '4 Languages'),
  ('hero.stat3_label',      'English · 日本語 · සිංහල · தமிழ்'),
  ('hero.stat4_num',        '4 Vehicles'),
  ('hero.stat4_label',      'Hatchback to 9-Seat Van'),
  ('booking.eyebrow',       'Flexible Route & Fleet'),
  ('booking.title',         'Where Are You Headed Today?'),
  ('booking.subtitle',      'Start typing a hotel, villa or airport and pick it from the Google Maps suggestions. We work out the distance for you and send it straight to WhatsApp.'),
  ('tours.eyebrow',         'Island-Wide Excursions'),
  ('tours.title',           'Popular Sri Lanka Tour Routes'),
  ('tours.subtitle',        'Tailored scenic road trips and transfers with flexible stops for photography, tea factory visits, wildlife safaris, and beach spots.'),
  ('about.photo',           'pfp_DG.jpg'),
  ('about.name',            'Isum Sejan Gunasekara'),
  ('about.role',            'Owner & Chauffeur Host'),
  ('about.location',        'Galle'),
  ('about.title',           'Personalized Island-Wide Travel with DG Travels'),
  ('about.bio',             'Hello and welcome! Founded in 2022, DG Travels is built on reliability, immaculate vehicles, and personalized attention. Based right in coastal Ahangama, Galle, I take pride in providing smooth airport pickups, flexible day trips, and comprehensive island tours across Sri Lanka. Whether you are arriving for world-class surfing, scenic hill country trekking, or cultural sightseeing, you can expect punctuality and a warm Sri Lankan welcome.'),
  ('feedback.eyebrow',      'Passenger Reviews & QR Code'),
  ('feedback.title',        'We Value Your Feedback'),
  ('feedback.subtitle',     'Finished your ride or tour with DG Travels? Scan the QR code in the vehicle, or tap the button below, to share your experience with us.'),
  ('footer.tagline',        'Ahangama, Galle · Southern Province, Sri Lanka')
on conflict (key) do nothing;

insert into public.tours (tag, title, items, footer_note, whatsapp_text, sort_order)
select * from (values
  (
    'Southern Coast & Surf',
    'Galle, Ahangama & Mirissa',
    '["Historic Galle Dutch Fort UNESCO World Heritage","Ahangama & Midigama Surf Breaks & Stilt Fishermen","Turtle Conservation Project & Madu River Boat Safari","Mirissa Coconut Tree Hill & Whale Watching Excursions"]'::jsonb,
    'Flexible Day Trips',
    'Hi Isum, I''m interested in the Galle & Southern Coast Tour.',
    10
  ),
  (
    'Hill Country & Waterfalls',
    'Ella, Nuwara Eliya & Kandy',
    '["Nine Arch Bridge & Little Adam''s Peak, Ella","Ceylon Tea Plantations & Waterfalls Scenic Drive","Temple of the Sacred Tooth Relic, Kandy","Mountain Train Coordination & Pickup"]'::jsonb,
    'Multi-Day Excursions',
    'Hi Isum, I''m interested in the Hill Country & Ella Tour.',
    20
  ),
  (
    'Cultural Triangle & Wildlife',
    'Sigiriya Fortress & Safari',
    '["Sigiriya Ancient Lion Rock Fortress & Pidurangala","Dambulla Golden Cave Temples","Minneriya / Yala National Park Elephant Safari","Authentic Sri Lankan Village Cuisine Experiences"]'::jsonb,
    'Custom Itinerary',
    'Hi Isum, I''m interested in the Sigiriya & Safari Tour.',
    30
  )
) as seed(tag, title, items, footer_note, whatsapp_text, sort_order)
where not exists (select 1 from public.tours);

insert into public.vehicles (name, badge, icon, specs_primary, specs_secondary, sort_order)
select * from (values
  ('Toyota Aqua',  'Hatchback',      'fa-solid fa-car-side',   '1–3 Pax · 2 Bags',                 'Hybrid · Full A/C',            10),
  ('Toyota Prius', 'Premium Hybrid', 'fa-solid fa-car-rear',   '1–3 Pax · 3 Bags',                 'Ultra smooth · Silent · A/C',  20),
  ('Honda Vezel',  'Compact SUV',    'fa-solid fa-car',        '1–4 Pax · 3 Bags',                 'High clearance · A/C',         30),
  ('Toyota HiAce', 'Luxury Van',     'fa-solid fa-van-shuttle','1–9 Pax · 6–8 Bags + Surfboards',  'High roof · Dual A/C',         40)
) as seed(name, badge, icon, specs_primary, specs_secondary, sort_order)
where not exists (select 1 from public.vehicles);


-- ============================================================
--  9. LAST STEP — make yourself the admin
--
--  a) Supabase dashboard → Authentication → Users → "Add user"
--     Create the account with your email and a strong password,
--     and tick "Auto Confirm User".
--
--  b) Put that same email below and run this statement:
-- ============================================================
--
-- insert into public.admins (user_id, email)
-- select id, email from auth.users where email = 'you@example.com'
-- on conflict (user_id) do nothing;
--
-- Check it worked:
--   select email from public.admins;
