-- Zero Ink v2 — menus, itemised receipts, private receipts, secure code lookup.
-- Applied to production on 2026-11-06.

alter table profiles add column if not exists tax_rate numeric default 0;
alter table profiles add column if not exists business_type text;

alter table receipts add column if not exists merchant_id   uuid references profiles(id);
alter table receipts add column if not exists line_items    jsonb;
alter table receipts add column if not exists subtotal      numeric;
alter table receipts add column if not exists tax           numeric;
alter table receipts add column if not exists category      text;
alter table receipts add column if not exists customer_code text;
create index if not exists receipts_customer_idx on receipts(customer_id, created_at desc);
create index if not exists receipts_merchant_idx on receipts(merchant_id, created_at desc);

create table if not exists menu_items (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references profiles(id) on delete cascade,
  name        text not null,
  price       numeric not null default 0,
  category    text,
  active      boolean not null default true,
  created_at  timestamptz default now()
);
create index if not exists menu_items_merchant_idx on menu_items(merchant_id);
alter table menu_items enable row level security;
create policy "Merchants manage own menu" on menu_items for all to authenticated
  using (auth.uid() = merchant_id) with check (auth.uid() = merchant_id);

-- Look up a customer by 4-digit code without exposing the profiles table.
create or replace function public.find_customer_by_code(p_code text)
returns table(id uuid, first_name text)
language sql security definer set search_path = public stable as $$
  select p.id, split_part(coalesce(p.full_name,''),' ',1) from profiles p where p.code = p_code limit 1;
$$;
revoke all on function public.find_customer_by_code(text) from public, anon;
grant execute on function public.find_customer_by_code(text) to authenticated;

-- Receipts are private: the customer and the business that sent it can read it.
drop policy if exists "Customers can view their own receipts" on receipts;
create policy "Customers and merchants view own receipts" on receipts for select to authenticated
  using (auth.uid() = customer_id or auth.uid() = merchant_id);

drop policy if exists "Anyone authenticated can send a receipt" on receipts;
create policy "Authenticated can send receipts as themselves" on receipts for insert to authenticated
  with check (merchant_id is null or merchant_id = auth.uid());
