-- Run AFTER the v2 app is live (the v1 app read other users' profiles to look up codes).
-- Users can then only read their own profile; code lookup goes through find_customer_by_code().

drop policy if exists "Users can view all profiles" on profiles;
create policy "Users can view own profile" on profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "Anyone can insert a profile" on profiles;
create policy "Users can create own profile" on profiles for insert to authenticated
  with check (auth.uid() = id);
