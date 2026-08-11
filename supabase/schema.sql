create extension if not exists pgcrypto;
create extension if not exists citext;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null check (username::text ~ '^[A-Za-z0-9_]{3,24}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_user_profile();

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null default 'Chat with Ollie',
  visitor_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender text not null check (sender in ('visitor', 'operator')),
  kind text not null default 'text' check (kind in ('text', 'image')),
  body text not null check (char_length(body) <= 500000),
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  endpoint text primary key,
  operator_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;
-- No public policies: only the Edge Function's service-role client can access these tables.
