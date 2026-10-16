
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.catalog_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  source_name text not null,
  expected_count int not null default 188,
  imported_count int not null default 0,
  verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.catalog_imports to authenticated;
grant all on public.catalog_imports to service_role;
alter table public.catalog_imports enable row level security;
create policy "own imports" on public.catalog_imports for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.curriculum_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  import_id uuid references public.catalog_imports(id) on delete set null,
  position int not null,
  title text not null,
  topic text,
  difficulty text,
  url text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, position)
);
grant select, insert, update, delete on public.curriculum_items to authenticated;
grant all on public.curriculum_items to service_role;
alter table public.curriculum_items enable row level security;
create policy "own items" on public.curriculum_items for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.item_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  item_id uuid not null references public.curriculum_items(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started','attempted','solved','mastered')),
  notes text not null default '',
  ease numeric not null default 2.5,
  interval_days int not null default 0,
  repetitions int not null default 0,
  due_date date,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, item_id)
);
grant select, insert, update, delete on public.item_progress to authenticated;
grant all on public.item_progress to service_role;
alter table public.item_progress enable row level security;
create policy "own progress" on public.item_progress for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.review_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  item_id uuid not null references public.curriculum_items(id) on delete cascade,
  grade int not null check (grade between 0 and 5),
  reviewed_at timestamptz not null default now(),
  next_due date not null
);
grant select, insert, delete on public.review_log to authenticated;
grant all on public.review_log to service_role;
alter table public.review_log enable row level security;
create policy "own log" on public.review_log for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
