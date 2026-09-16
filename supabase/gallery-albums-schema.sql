-- ============================================================
--  DG Travels — Gallery Albums Schema & Migration
--  Run this in Supabase: SQL Editor → New query → Run
-- ============================================================

-- 1. Create gallery_albums table
create table if not exists public.gallery_albums (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint gallery_albums_title_len check (char_length(btrim(title)) between 1 and 120)
);

-- Index for ordering
create index if not exists gallery_albums_order_idx
  on public.gallery_albums (sort_order asc, created_at desc);

-- Row Level Security
alter table public.gallery_albums enable row level security;

drop policy if exists "albums are public" on public.gallery_albums;
create policy "albums are public"
  on public.gallery_albums for select
  to anon, authenticated
  using (true);

drop policy if exists "admins write albums" on public.gallery_albums;
create policy "admins write albums"
  on public.gallery_albums for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.gallery_albums to anon, authenticated;
grant insert, update, delete on public.gallery_albums to authenticated;

drop trigger if exists gallery_albums_touch on public.gallery_albums;
create trigger gallery_albums_touch before update on public.gallery_albums
  for each row execute function public.touch_updated_at();

-- 2. Add album fields to gallery_photos
alter table public.gallery_photos
  add column if not exists album_id uuid references public.gallery_albums(id) on delete set null;

alter table public.gallery_photos
  add column if not exists album_title text;
