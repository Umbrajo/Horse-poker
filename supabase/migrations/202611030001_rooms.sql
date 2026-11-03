create table public.poker_rooms (
 code text primary key,
 state jsonb not null,
 version integer not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.poker_rooms enable row level security;
revoke all on public.poker_rooms from anon, authenticated;
-- Only the authenticated Edge Function, using its server-side service role, accesses this table.
