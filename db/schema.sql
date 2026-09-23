-- Minimum Neon schema for Bundle 2. Two tables: one exemplar profile, and
-- the calendar events that are simultaneously income/transactions, the
-- household's recurring monthly commitments, and the calendar itself (the
-- finance engine repeats this same monthly pattern to build the 12-month
-- forecast, and nothing here is provider-specific).
-- Idempotent: safe to run against an already-migrated database.

create table if not exists profiles (
  id text primary key,
  name text not null,
  city text not null,
  currency text not null default 'AED',
  month text not null,
  month_label text not null,
  as_of_day integer not null,
  projected_payday integer not null,
  opening_balance numeric not null,
  buffer_target numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists calendar_events (
  profile_id text not null references profiles(id) on delete cascade,
  id text not null,
  label text not null,
  amount numeric not null,
  day integer not null,
  kind text not null check (kind in ('income', 'commitment', 'goal')),
  payment_type text not null,
  status text not null check (status in ('actual', 'forecasted', 'pending', 'overdue')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  amount_type text not null check (amount_type in ('fixed', 'variable', 'range')),
  account_name text not null,
  reviewed boolean not null default false,
  note text,
  -- Whether the finance engine repeats this event in future months when
  -- building the 12-month forecast.
  recurring boolean not null default true,
  primary key (profile_id, id)
);

-- Added after the table already existed in some environments, so this is a
-- separate idempotent statement rather than part of the `create table`
-- above (which only runs on a brand-new table).
alter table calendar_events
  -- How often, in months, an event repeats once it recurs: 1 for a monthly
  -- item (salary, loan, utilities), 3 for a quarterly rent cheque, 4 for a
  -- roughly three-times-a-year school term fee. Ignored when not recurring.
  add column if not exists recurrence_interval_months integer not null default 1;

alter table calendar_events
  -- Which month this event's `day` belongs to, relative to profiles.month
  -- (0 = the exemplar's own month). Lets a confirmed calendar-change draft
  -- add an event that starts in a future month (e.g. "starting 1 Oct
  -- 2026") without it also appearing in the exemplar month. Every existing
  -- seeded event is month_offset 0, so this preserves the exemplar exactly.
  add column if not exists month_offset integer not null default 0;

-- Bundle 3: chat-proposed calendar changes. A draft is inert until the
-- application's own confirm endpoint applies it — chat text alone never
-- writes here, and this table never mutates calendar_events by itself.
create table if not exists calendar_drafts (
  draft_id text primary key,
  profile_id text not null references profiles(id) on delete cascade,
  source_message_id text not null,
  action text not null check (action in ('add', 'update', 'delete')),
  target_event_id text,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  -- Event ids written to calendar_events when this draft was confirmed;
  -- recorded so a repeated confirm request can detect it already ran
  -- instead of re-applying the mutation.
  applied_event_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  rejected_at timestamptz
);
