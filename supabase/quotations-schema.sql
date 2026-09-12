-- ============================================================
--  DG Travels — Quotation Bills
--  Run this once: Supabase dashboard → SQL Editor → New query → Run
--
--  Requires `admin-schema.sql` to have been run first: the policies
--  below reuse the public.is_admin() function it creates.
--
--  Unlike the site content tables, nothing here is public. A quotation
--  holds a customer's name, phone and email, so only a listed admin may
--  read it, write it, or even know it exists.
-- ============================================================


-- ------------------------------------------------------------
--  1. The reference-number counter
--     A sequence rather than count(*) + 1: two quotations raised in
--     the same second still get different numbers, and deleting an
--     old one never hands its number to a new one.
-- ------------------------------------------------------------
create sequence if not exists public.quotation_ref_seq;


-- ------------------------------------------------------------
--  2. The quotations themselves
-- ------------------------------------------------------------
create table if not exists public.quotations (
  id               uuid primary key default gen_random_uuid(),
  ref_no           text not null unique
                     default ('REF-' || lpad(nextval('public.quotation_ref_seq')::text, 3, '0')),
  issued_at        timestamptz not null default now(),

  customer_name    text,
  customer_phone   text,
  customer_email   text,

  trip_type        text not null default 'one_way',
  pickup_location  text not null,
  -- An ordered list of intermediate stops: ["Galle Fort", "Mirissa"].
  other_locations  jsonb not null default '[]'::jsonb,
  return_location  text,
  journey_date     date,
  journey_time     time,
  distance         text,
  passengers       int  not null,
  luggage          int,
  special_requests text,
  vehicle_type     text not null,
  driver_name      text,
  fare_lkr         numeric(12, 2),

  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint quotations_trip_type    check (trip_type in ('one_way', 'return')),
  constraint quotations_pickup_len   check (char_length(pickup_location) between 1 and 300),
  constraint quotations_vehicle_len  check (char_length(vehicle_type) between 1 and 120),
  constraint quotations_pax_range    check (passengers between 1 and 99),
  constraint quotations_bag_range    check (luggage is null or luggage between 0 and 99),
  constraint quotations_stops_arr    check (jsonb_typeof(other_locations) = 'array'),
  constraint quotations_requests_len check (special_requests is null or char_length(special_requests) <= 2000),
  constraint quotations_fare_range   check (fare_lkr is null or fare_lkr between 0 and 99999999),
  -- A return trip without a return location is not a quotation anyone can act on.
  constraint quotations_return_location check (
    trip_type <> 'return'
    or (return_location is not null and char_length(btrim(return_location)) > 0)
  )
);

create index if not exists quotations_issued_idx on public.quotations (issued_at desc);


-- ------------------------------------------------------------
--  2b. Upgrading a table created by an earlier version of this file
--      Harmless on a fresh install: everything below already exists.
-- ------------------------------------------------------------
alter table public.quotations add column if not exists other_locations  jsonb not null default '[]'::jsonb;
alter table public.quotations add column if not exists luggage          int;
alter table public.quotations add column if not exists special_requests text;

-- `add constraint` has no `if not exists`, so each one is asked for by name.
do $$
declare
  wanted text[][] := array[
    ['quotations_bag_range',    'check (luggage is null or luggage between 0 and 99)'],
    ['quotations_stops_arr',    'check (jsonb_typeof(other_locations) = ''array'')'],
    ['quotations_requests_len', 'check (special_requests is null or char_length(special_requests) <= 2000)']
  ];
  i int;
begin
  for i in 1 .. array_length(wanted, 1) loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.quotations'::regclass
        and conname  = wanted[i][1]
    ) then
      execute format('alter table public.quotations add constraint %I %s', wanted[i][1], wanted[i][2]);
    end if;
  end loop;
end $$;


-- ------------------------------------------------------------
--  3. Row Level Security — admins only, for everything
--     `for all` covers select as well, so one policy is the whole rule:
--     if you are not in public.admins, this table does not exist for you.
-- ------------------------------------------------------------
alter table public.quotations enable row level security;

drop policy if exists "admins own quotations" on public.quotations;
create policy "admins own quotations"
  on public.quotations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The default on ref_no calls nextval(), so the signed-in role needs the
-- sequence even though it never names it.
grant usage, select on sequence public.quotation_ref_seq to authenticated;


-- ------------------------------------------------------------
--  4. Where the numbering starts
--     Leave as is for REF-001. To carry on from a paper book, set the
--     counter to the last number you issued:
--
--       select setval('public.quotation_ref_seq', 128);
--
--     The next quotation is then REF-129.
-- ------------------------------------------------------------
