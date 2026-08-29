-- ============================================================
--  DG Travels — Passenger Feedback Schema
--  Run this once in the Supabase dashboard: SQL Editor → New query → Run
-- ============================================================

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  email       text        not null,
  message     text        not null,
  rating      smallint    not null,
  created_at  timestamptz not null default now(),

  constraint feedback_name_len    check (char_length(name) between 1 and 80),
  constraint feedback_email_len   check (char_length(email) between 3 and 160),
  constraint feedback_message_len check (char_length(message) between 1 and 500),
  constraint feedback_rating_rng  check (rating between 1 and 5)
);

-- Newest reviews are read on every page load, so index the sort column.
create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);

-- ------------------------------------------------------------
--  Row Level Security
--
--  RLS is ON with NO policies, which denies every request made
--  with the anon or authenticated keys. That is deliberate: the
--  browser never talks to Supabase directly. Both API routes run
--  on Vercel with the service_role key, which bypasses RLS.
--
--  The effect: nobody can read passenger email addresses from the
--  client, and nobody can write rows except through /api/feedback,
--  which validates the payload first.
-- ------------------------------------------------------------
alter table public.feedback enable row level security;


-- ============================================================
--  Moderation cheat-sheet (run in the SQL Editor as needed)
-- ============================================================
-- See everything, newest first:
--   select created_at, rating, name, email, message
--     from public.feedback order by created_at desc;
--
-- Delete one unwanted review (copy its id from the query above):
--   delete from public.feedback where id = 'paste-uuid-here';
--
-- Average rating and total count:
--   select round(avg(rating)::numeric, 1) as average, count(*) as total
--     from public.feedback;
