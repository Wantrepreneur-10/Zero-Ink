-- Zero Ink — base schema (profiles + receipts). Already applied to production.
-- Kept here so a fresh Supabase project can be rebuilt from migrations in order.

create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  code        text unique not null,
  is_merchant boolean default false,
  created_at  timestamptz default now()
);

create table if not exists receipts (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references profiles(id) on delete cascade,
  merchant_name text not null,
  items         text,
  amount        numeric not null default 0,
  carbon        numeric default 0,
  created_at    timestamptz default now()
);

alter table profiles enable row level security;
alter table receipts enable row level security;

create policy "Anyone can insert a profile" on profiles for insert with check (true);
create policy "Users can update their own profile" on profiles for update using (auth.uid() = id);
create policy "Users can view all profiles" on profiles for select using (true);

-- Live receipt delivery
alter publication supabase_realtime add table receipts;
