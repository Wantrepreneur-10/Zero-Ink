-- Square connections (OAuth tokens). Applied to production 2026-11-11.
create table if not exists square_connections (
  merchant_id uuid primary key references profiles(id) on delete cascade,
  square_merchant_id text unique not null,
  business_name text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  connected_at timestamptz default now()
);
alter table square_connections enable row level security;
-- No policies on purpose: tokens are only ever read by the `square` edge function (service role).
