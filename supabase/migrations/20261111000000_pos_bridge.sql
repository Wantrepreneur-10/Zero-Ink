-- POS bridge: connection keys + orders pushed from a POS. Applied to production 2026-11-11.
create table if not exists merchant_keys (
  merchant_id uuid primary key references profiles(id) on delete cascade,
  key_hash text unique not null,           -- SHA-256 of the key; the key itself is shown once and never stored
  created_at timestamptz default now()
);
alter table merchant_keys enable row level security;
create policy "Merchants manage own key" on merchant_keys for all to authenticated
  using (auth.uid() = merchant_id) with check (auth.uid() = merchant_id);

create table if not exists pos_orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references profiles(id) on delete cascade,
  source text not null default 'pos',
  external_id text,
  items jsonb not null,
  subtotal numeric, tax numeric, total numeric not null,
  note text,
  status text not null default 'pending' check (status in ('pending','sent','dismissed')),
  created_at timestamptz default now(),
  unique (merchant_id, external_id)
);
create index if not exists pos_orders_merchant_idx on pos_orders(merchant_id, status, created_at desc);
alter table pos_orders enable row level security;
-- Rows are inserted only by the `pos` edge function (service role).
create policy "Merchants read own POS orders" on pos_orders for select to authenticated using (auth.uid() = merchant_id);
create policy "Merchants update own POS orders" on pos_orders for update to authenticated
  using (auth.uid() = merchant_id) with check (auth.uid() = merchant_id);
alter publication supabase_realtime add table pos_orders;
