-- BlitzSense account persistence and privacy-safe leaderboard.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date timestamptz not null,
  score integer not null check (score >= 0),
  correct_count integer not null check (correct_count >= 0),
  total_played integer not null check (total_played between 1 and 100),
  difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  position_count integer not null check (position_count in (5, 10, 20)),
  gm_stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (correct_count <= total_played),
  check (score <= total_played * 250)
);
create index if not exists sessions_user_date_idx on public.sessions(user_id, date desc);
create index if not exists sessions_board_idx on public.sessions(difficulty, position_count, score desc);

create table if not exists public.seen_games (
  user_id uuid primary key references auth.users(id) on delete cascade,
  game_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.seen_games enable row level security;
alter table public.user_state enable row level security;

create policy "profiles are readable" on public.profiles for select using (true);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "users read own sessions" on public.sessions for select using (auth.uid() = user_id);
create policy "users insert own sessions" on public.sessions for insert with check (auth.uid() = user_id);
create policy "users manage own seen games" on public.seen_games for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users manage own state" on public.user_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Player'),
    new.raw_user_meta_data->>'avatar_url'
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.get_leaderboard(
  requested_difficulty text,
  requested_position_count integer,
  requested_limit integer default 20
)
returns table(username text, avatar_url text, best_score integer, total_sessions bigint, avg_accuracy double precision)
language sql stable security definer set search_path = public as $$
  select p.username, p.avatar_url, max(s.score)::integer, count(*)::bigint,
    avg((s.correct_count::double precision / nullif(s.total_played, 0)) * 100)
  from public.sessions s join public.profiles p on p.id = s.user_id
  where s.difficulty = requested_difficulty and s.position_count = requested_position_count
  group by p.id, p.username, p.avatar_url
  order by max(s.score) desc, avg(s.correct_count::double precision / nullif(s.total_played, 0)) desc
  limit least(greatest(requested_limit, 1), 100);
$$;

grant execute on function public.get_leaderboard(text, integer, integer) to anon, authenticated;
