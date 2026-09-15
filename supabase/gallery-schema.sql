-- ============================================================
--  DG Travels — Photo Gallery
--  Run this once: Supabase dashboard → SQL Editor → New query → Run
--
--  Requires `admin-schema.sql` to have been run first: the policies
--  below reuse public.is_admin(), the updated_at trigger reuses
--  public.touch_updated_at(), and the photos themselves are uploaded
--  into its `site-assets` storage bucket.
--
--  Like the tours and vehicles, every row here is published on the
--  website, so anyone may read it. Only a listed admin may add, change
--  or delete a photo.
--
--  Safe to run twice: nothing below overwrites what already exists.
-- ============================================================


-- ------------------------------------------------------------
--  1. The photos
-- ------------------------------------------------------------
create table if not exists public.gallery_photos (
  id          uuid primary key default gen_random_uuid(),
  image_url   text not null,
  caption     text not null,
  -- The day the photo was taken, printed under its caption. Not the
  -- upload time: a photo from last season's tour can be added today.
  photo_date  date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint gallery_photos_caption_len check (char_length(btrim(caption)) between 1 and 200),
  constraint gallery_photos_url_len     check (char_length(image_url) between 1 and 2000)
);

-- Newest first is the only order the site ever asks for.
create index if not exists gallery_photos_newest_idx
  on public.gallery_photos (photo_date desc, created_at desc);

grant select on public.gallery_photos to anon, authenticated;
grant insert, update, delete on public.gallery_photos to authenticated;

alter table public.gallery_photos enable row level security;

drop policy if exists "gallery is public" on public.gallery_photos;
create policy "gallery is public"
  on public.gallery_photos for select
  to anon, authenticated
  using (true);

drop policy if exists "admins write gallery" on public.gallery_photos;
create policy "admins write gallery"
  on public.gallery_photos for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists gallery_photos_touch on public.gallery_photos;
create trigger gallery_photos_touch before update on public.gallery_photos
  for each row execute function public.touch_updated_at();


-- ------------------------------------------------------------
--  2. The section switch and its heading
--     Sort order 35 puts it between Popular Tours (30) and
--     About the Driver (40) in the editor's Sections tab.
-- ------------------------------------------------------------
insert into public.site_sections (key, label, visible, sort_order) values
  ('gallery', 'Gallery', true, 35)
on conflict (key) do nothing;

insert into public.site_settings (key, value) values
  ('gallery.eyebrow',  'Moments on the Road'),
  ('gallery.title',    'Gallery'),
  ('gallery.subtitle', 'Snapshots from the tours, transfers and places we visit across Sri Lanka.')
on conflict (key) do nothing;
