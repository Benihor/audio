-- Run this in the Supabase SQL editor (once per project).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  sub_status text,
  sub_current_period_end timestamptz,
  download_credits integer not null default 0,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.download_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_idx on public.profiles (stripe_customer_id);
create index if not exists download_log_user_idx on public.download_log (user_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.consume_download_credit(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.profiles
     set download_credits = download_credits - 1,
         updated_at = now()
   where id = p_user
     and download_credits > 0
  returning download_credits into n;
  return found;
end;
$$;

alter table public.profiles enable row level security;
alter table public.stripe_events enable row level security;
alter table public.download_log enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- Writes go through the backend service role (bypasses RLS).
revoke all on public.stripe_events from anon, authenticated;
revoke all on public.download_log from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant all on public.stripe_events to service_role;
grant all on public.download_log to service_role;
grant execute on function public.consume_download_credit(uuid) to service_role;
