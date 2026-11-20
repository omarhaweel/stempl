-- Approved work places per user (godkjente arbeidssteder) are back: a user may punch in/out only within
-- radius_m metres of one of their approved places. (No places = no restriction.)
-- Dagsplaner no longer carry places; the old day_plan_places table is left as it is, unused.
create table if not exists public.approved_locations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  latitude   double precision not null check (latitude between -90 and 90),
  longitude  double precision not null check (longitude between -180 and 180),
  radius_m   integer not null default 200 check (radius_m between 50 and 5000),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists approved_locations_user_idx on public.approved_locations (user_id);

-- Backend-only access (secret key bypasses RLS).
alter table public.approved_locations enable row level security;
revoke all on public.approved_locations from anon, authenticated;
