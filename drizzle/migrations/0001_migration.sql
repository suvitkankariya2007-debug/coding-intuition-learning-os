
-- Source metadata columns
alter table public.curriculum_items
  add column reference text,
  add column idea text,
  add column priority_marker text,
  add column leetcode_id int,
  add column concept_only boolean not null default false;

-- Manual progress mark (independent of source priority marker)
alter table public.item_progress
  add column manual_mark text check (manual_mark in ('red','blue','yellow'));

-- Richer, append-only check-ins
alter table public.review_log
  add column hint_stage text check (hint_stage in ('none','gentle','deeper','solution')),
  add column invariant text,
  add column edge_case text,
  add column transfer_problem text,
  add column mistake_class text,
  add column confidence int check (confidence between 1 and 5),
  add column manual_mark text check (manual_mark in ('red','blue','yellow'));

drop policy "own log" on public.review_log;
revoke update, delete on public.review_log from authenticated;
create policy "own log select" on public.review_log for select to authenticated using (auth.uid() = user_id);
create policy "own log insert" on public.review_log for insert to authenticated with check (auth.uid() = user_id);

alter table public.catalog_imports
  add constraint verified_requires_full_count check (not verified or imported_count = expected_count);

-- Cross-user reference guards
create or replace function public.guard_item_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.curriculum_items c where c.id = new.item_id and c.user_id = new.user_id) then
    raise exception 'item does not belong to this user' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger item_progress_owner before insert or update on public.item_progress
  for each row execute function public.guard_item_owner();
create trigger review_log_owner before insert or update on public.review_log
  for each row execute function public.guard_item_owner();

create or replace function public.guard_import_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.import_id is not null and not exists (
    select 1 from public.catalog_imports i where i.id = new.import_id and i.user_id = new.user_id) then
    raise exception 'import does not belong to this user' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger curriculum_import_owner before insert or update on public.curriculum_items
  for each row execute function public.guard_import_owner();

-- Coaching preferences (explicitly confirmed)
create table public.coaching_preferences (
  user_id uuid primary key default auth.uid(),
  prefs jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.coaching_preferences to authenticated;
grant all on public.coaching_preferences to service_role;
alter table public.coaching_preferences enable row level security;
create policy "own prefs" on public.coaching_preferences for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Supermemory opt-in outbox (summary only; no sync job)
create table public.memory_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  summary text not null check (length(summary) <= 2000),
  consent boolean not null check (consent),
  status text not null default 'queued_not_connected' check (status in ('queued_not_connected','sent','failed')),
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.memory_outbox to authenticated;
grant all on public.memory_outbox to service_role;
alter table public.memory_outbox enable row level security;
create policy "own outbox select" on public.memory_outbox for select to authenticated using (auth.uid() = user_id);
create policy "own outbox insert" on public.memory_outbox for insert to authenticated with check (auth.uid() = user_id and status = 'queued_not_connected');
create policy "own outbox delete" on public.memory_outbox for delete to authenticated using (auth.uid() = user_id);

-- Atomic, validated catalog replacement. Preserves progress for kept positions.
create or replace function public.replace_catalog(p_source text, p_entries jsonb, p_confirm boolean)
returns uuid language plpgsql security invoker set search_path = public as $$
declare uid uuid := auth.uid(); imp uuid; n int; existing int;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  n := jsonb_array_length(p_entries);
  if n = 0 or n > 1000 then raise exception 'entry count % out of range', n; end if;
  if exists (select 1 from jsonb_array_elements(p_entries) e where coalesce(trim(e->>'title'),'') = '') then
    raise exception 'entry with blank title'; end if;
  if (select count(distinct (e->>'position')::int) from jsonb_array_elements(p_entries) e) <> n then
    raise exception 'duplicate or missing order values'; end if;
  select count(*) into existing from public.curriculum_items where user_id = uid;
  if existing > 0 and not p_confirm then raise exception 'confirmation required to replace existing catalog'; end if;

  insert into public.catalog_imports(user_id, source_name, imported_count, expected_count)
  values (uid, p_source, n, 188) returning id into imp;

  insert into public.curriculum_items(user_id, import_id, position, title, topic, difficulty, url,
    reference, idea, priority_marker, leetcode_id, concept_only, raw)
  select uid, imp, (e->>'position')::int, trim(e->>'title'), nullif(e->>'topic',''), nullif(e->>'difficulty',''),
    nullif(e->>'url',''), nullif(e->>'reference',''), nullif(e->>'idea',''), nullif(e->>'priority_marker',''),
    (e->>'leetcode_id')::int, coalesce((e->>'concept_only')::boolean, false), coalesce(e->'raw', '{}'::jsonb)
  from jsonb_array_elements(p_entries) e
  on conflict (user_id, position) do update set
    import_id = excluded.import_id, title = excluded.title, topic = excluded.topic, difficulty = excluded.difficulty,
    url = excluded.url, reference = excluded.reference, idea = excluded.idea, priority_marker = excluded.priority_marker,
    leetcode_id = excluded.leetcode_id, concept_only = excluded.concept_only, raw = excluded.raw;

  delete from public.curriculum_items where user_id = uid and import_id is distinct from imp;
  return imp;
end $$;
grant execute on function public.replace_catalog(text, jsonb, boolean) to authenticated;
revoke execute on function public.replace_catalog(text, jsonb, boolean) from anon, public;
