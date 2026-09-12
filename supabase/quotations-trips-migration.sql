-- ============================================================
--  DG Travels — Quotations: one quotation, many trips
--  Run this once: Supabase dashboard → SQL Editor → New query → Run
--
--  Run `quotations-schema.sql` first if you have not already.
--
--  A quotation used to describe a single journey, with the route, the
--  distance and the fare sitting directly on the row. It now describes
--  one or more trips that share a vehicle and a party of passengers.
--
--  So the per-journey fields — route, distance, times, fare — move into
--  a `trips` array, while everything true of the whole booking stays on
--  the row: the customer, the passengers, the luggage, the special
--  requests, the vehicle, the driver, the allowance and the totals.
--
--  Safe to run twice: every step checks the state it is changing, and
--  quotations you have already raised are carried across, not dropped.
-- ============================================================


-- ------------------------------------------------------------
--  1. The new shape
-- ------------------------------------------------------------
alter table public.quotations add column if not exists trips             jsonb not null default '[]'::jsonb;
alter table public.quotations add column if not exists driver_allowance  numeric(12, 2);
alter table public.quotations add column if not exists total_distance_km numeric(10, 1);
alter table public.quotations add column if not exists total_fare_lkr    numeric(12, 2);


-- ------------------------------------------------------------
--  2. Carry existing quotations across
--     Each old row becomes a one-trip quotation. Guarded on the old
--     column still being there, so a second run does nothing.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quotations'
      and column_name = 'pickup_location'
  ) then
    execute $mig$
      update public.quotations set
        trips = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'trip_type',        trip_type,
          'pickup_location',  pickup_location,
          'other_locations',  coalesce(other_locations, '[]'::jsonb),
          -- A one-way trip had no destination field to fill before now.
          'destination',      null,
          'return_location',  return_location,
          'journey_date',     journey_date,
          'journey_time',     journey_time,
          -- Distance used to be free text ("168 km"); keep the digits.
          'distance_km',      nullif(regexp_replace(coalesce(distance, ''), '[^0-9.]', '', 'g'), '')::numeric,
          'fare_lkr',         fare_lkr
        ))),
        total_distance_km = coalesce(
          total_distance_km,
          nullif(regexp_replace(coalesce(distance, ''), '[^0-9.]', '', 'g'), '')::numeric),
        total_fare_lkr = coalesce(total_fare_lkr, fare_lkr)
      where jsonb_array_length(trips) = 0
    $mig$;
  end if;
end $$;


-- ------------------------------------------------------------
--  3. Retire the per-journey columns
--     Their contents are now inside `trips`, copied by step 2.
-- ------------------------------------------------------------
alter table public.quotations drop column if exists trip_type;
alter table public.quotations drop column if exists pickup_location;
alter table public.quotations drop column if exists other_locations;
alter table public.quotations drop column if exists return_location;
alter table public.quotations drop column if exists journey_date;
alter table public.quotations drop column if exists journey_time;
alter table public.quotations drop column if exists distance;
alter table public.quotations drop column if exists fare_lkr;

-- passengers, luggage and special_requests stay: one party travels every
-- trip on a quotation, so they describe the booking, not a journey.


-- ------------------------------------------------------------
--  3b. Recovering from an earlier version of this file
--      That version moved the passenger fields into each trip and
--      dropped them from the row. Put them back, take the values from
--      the first trip, and clear the stale copies out of the array.
-- ------------------------------------------------------------
alter table public.quotations add column if not exists passengers       int;
alter table public.quotations add column if not exists luggage          int;
alter table public.quotations add column if not exists special_requests text;

update public.quotations set
  passengers       = coalesce(passengers,       (trips -> 0 ->> 'passengers')::int),
  luggage          = coalesce(luggage,          (trips -> 0 ->> 'luggage')::int),
  special_requests = coalesce(special_requests,  trips -> 0 ->> 'special_requests')
where jsonb_array_length(trips) > 0
  and (passengers is null or luggage is null or special_requests is null);

update public.quotations set
  trips = (
    select coalesce(jsonb_agg(e.value - 'passengers' - 'luggage' - 'special_requests'
                              order by e.ordinality), '[]'::jsonb)
    from jsonb_array_elements(trips) with ordinality as e
  )
where exists (
  select 1 from jsonb_array_elements(trips) as e
  where e.value ? 'passengers' or e.value ? 'luggage' or e.value ? 'special_requests'
);


-- ------------------------------------------------------------
--  4. What a trips array is allowed to contain
--     A check constraint cannot hold a subquery, so the rule lives in
--     an immutable function the constraint calls.
-- ------------------------------------------------------------
create or replace function public.quotation_trips_valid(t jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(t) = 'array'
     and jsonb_array_length(t) between 1 and 20
     and not exists (
       select 1
       from jsonb_array_elements(t) as e
       where jsonb_typeof(e.value) <> 'object'
          or coalesce(btrim(e.value ->> 'pickup_location'), '') = ''
          or (e.value ->> 'trip_type') not in ('one_way', 'return')
          or jsonb_typeof(coalesce(e.value -> 'other_locations', '[]'::jsonb)) <> 'array'
     );
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quotations'::regclass
      and conname  = 'quotations_trips_shape'
  ) then
    alter table public.quotations
      add constraint quotations_trips_shape check (public.quotation_trips_valid(trips));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quotations'::regclass
      and conname  = 'quotations_allowance_range'
  ) then
    alter table public.quotations
      add constraint quotations_allowance_range
      check (driver_allowance is null or driver_allowance between 0 and 99999999);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quotations'::regclass
      and conname  = 'quotations_total_range'
  ) then
    alter table public.quotations
      add constraint quotations_total_range
      check (total_fare_lkr is null or total_fare_lkr between 0 and 99999999);
  end if;
end $$;


-- ------------------------------------------------------------
--  5. Constraints that described the old columns
--     Dropping a column takes its own checks with it, but these two
--     were written against columns that have moved into `trips`.
-- ------------------------------------------------------------
alter table public.quotations drop constraint if exists quotations_return_location;
alter table public.quotations drop constraint if exists quotations_stops_arr;


-- ============================================================
--  Check it worked:
--
--    select ref_no, jsonb_array_length(trips) as trips, passengers,
--           total_distance_km, total_fare_lkr
--    from public.quotations
--    order by issued_at desc;
-- ============================================================
