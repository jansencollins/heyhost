-- HeyHost Trivia Platform Schema
-- Run this in Supabase SQL Editor to set up all tables and policies

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- GAMES
-- ============================================================
create table if not exists public.games (
  id uuid primary key default uuid_generate_v4(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  topic text not null default '',
  age_range text not null default 'mix',
  difficulty text not null default 'medium',
  timer_seconds int not null default 30,
  speed_bonus boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.games enable row level security;

create policy "Hosts can read own games"
  on public.games for select
  using (auth.uid() = host_id);

create policy "Hosts can insert own games"
  on public.games for insert
  with check (auth.uid() = host_id);

create policy "Hosts can update own games"
  on public.games for update
  using (auth.uid() = host_id);

create policy "Hosts can delete own games"
  on public.games for delete
  using (auth.uid() = host_id);

-- ============================================================
-- GAME QUESTIONS
-- ============================================================
create table if not exists public.game_questions (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references public.games(id) on delete cascade,
  question_order int not null default 0,
  prompt text not null,
  explanation text,
  created_at timestamptz not null default now()
);

alter table public.game_questions enable row level security;

create policy "Hosts can read own game questions"
  on public.game_questions for select
  using (
    exists (
      select 1 from public.games where games.id = game_questions.game_id and games.host_id = auth.uid()
    )
  );

create policy "Hosts can insert own game questions"
  on public.game_questions for insert
  with check (
    exists (
      select 1 from public.games where games.id = game_questions.game_id and games.host_id = auth.uid()
    )
  );

create policy "Hosts can update own game questions"
  on public.game_questions for update
  using (
    exists (
      select 1 from public.games where games.id = game_questions.game_id and games.host_id = auth.uid()
    )
  );

create policy "Hosts can delete own game questions"
  on public.game_questions for delete
  using (
    exists (
      select 1 from public.games where games.id = game_questions.game_id and games.host_id = auth.uid()
    )
  );

-- NOTE: "Players can read session questions" policy is created after the sessions table below.

-- ============================================================
-- GAME QUESTION CHOICES
-- ============================================================
create table if not exists public.game_question_choices (
  id uuid primary key default uuid_generate_v4(),
  question_id uuid not null references public.game_questions(id) on delete cascade,
  choice_text text not null,
  is_correct boolean not null default false,
  choice_order int not null default 0
);

alter table public.game_question_choices enable row level security;

create policy "Hosts can read own choices"
  on public.game_question_choices for select
  using (
    exists (
      select 1 from public.game_questions gq
      join public.games g on g.id = gq.game_id
      where gq.id = game_question_choices.question_id
        and g.host_id = auth.uid()
    )
  );

create policy "Hosts can insert own choices"
  on public.game_question_choices for insert
  with check (
    exists (
      select 1 from public.game_questions gq
      join public.games g on g.id = gq.game_id
      where gq.id = game_question_choices.question_id
        and g.host_id = auth.uid()
    )
  );

create policy "Hosts can update own choices"
  on public.game_question_choices for update
  using (
    exists (
      select 1 from public.game_questions gq
      join public.games g on g.id = gq.game_id
      where gq.id = game_question_choices.question_id
        and g.host_id = auth.uid()
    )
  );

create policy "Hosts can delete own choices"
  on public.game_question_choices for delete
  using (
    exists (
      select 1 from public.game_questions gq
      join public.games g on g.id = gq.game_id
      where gq.id = game_question_choices.question_id
        and g.host_id = auth.uid()
    )
  );

-- NOTE: "Players can read session choices" policy is created after the sessions table below.

-- ============================================================
-- SESSIONS (live run of a game)
-- ============================================================
create table if not exists public.sessions (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references public.games(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  current_question_index int not null default -1,
  timer_seconds int not null default 30,
  speed_bonus boolean not null default true,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create unique index if not exists sessions_active_code_idx
  on public.sessions (code) where status != 'finished';

alter table public.sessions enable row level security;

-- Hosts can manage their sessions
create policy "Hosts can read own sessions"
  on public.sessions for select
  using (auth.uid() = host_id);

create policy "Hosts can insert sessions"
  on public.sessions for insert
  with check (auth.uid() = host_id);

create policy "Hosts can update own sessions"
  on public.sessions for update
  using (auth.uid() = host_id);

-- Anyone can read sessions by code (players need this)
create policy "Anyone can read session by code"
  on public.sessions for select
  using (true);

-- ============================================================
-- DEFERRED POLICIES (depend on sessions table existing)
-- ============================================================

-- Players can read questions for active sessions they're in
create policy "Players can read session questions"
  on public.game_questions for select
  using (
    exists (
      select 1 from public.sessions s
      where s.game_id = game_questions.game_id
        and s.status in ('lobby', 'playing', 'finished')
    )
  );

-- Players can read choices for active sessions
create policy "Players can read session choices"
  on public.game_question_choices for select
  using (
    exists (
      select 1 from public.game_questions gq
      join public.sessions s on s.game_id = gq.game_id
      where gq.id = game_question_choices.question_id
        and s.status in ('lobby', 'playing', 'finished')
    )
  );

-- ============================================================
-- SESSION PLAYERS
-- ============================================================
create table if not exists public.session_players (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  display_name text not null,
  avatar_color text not null default '#6366f1',
  score int not null default 0,
  is_removed boolean not null default false,
  joined_at timestamptz not null default now()
);

alter table public.session_players enable row level security;

-- Anyone can read session players
create policy "Anyone can read session players"
  on public.session_players for select
  using (true);

-- Anyone can join (insert) a session
create policy "Anyone can join session"
  on public.session_players for insert
  with check (
    exists (
      select 1 from public.sessions
      where sessions.id = session_players.session_id
        and sessions.status = 'lobby'
    )
  );

-- Hosts can update players (kick)
create policy "Hosts can update session players"
  on public.session_players for update
  using (
    exists (
      select 1 from public.sessions
      where sessions.id = session_players.session_id
        and sessions.host_id = auth.uid()
    )
  );

-- ============================================================
-- SESSION QUESTION STATE
-- ============================================================
create table if not exists public.session_question_state (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_index int not null,
  question_id uuid not null references public.game_questions(id) on delete cascade,
  started_at timestamptz,
  ends_at timestamptz,
  is_paused boolean not null default false,
  paused_remaining_ms int,
  is_locked boolean not null default false,
  show_results boolean not null default false,
  show_leaderboard boolean not null default false,
  unique(session_id, question_index)
);

alter table public.session_question_state enable row level security;

create policy "Anyone can read question state"
  on public.session_question_state for select
  using (true);

create policy "Hosts can insert question state"
  on public.session_question_state for insert
  with check (
    exists (
      select 1 from public.sessions
      where sessions.id = session_question_state.session_id
        and sessions.host_id = auth.uid()
    )
  );

create policy "Hosts can update question state"
  on public.session_question_state for update
  using (
    exists (
      select 1 from public.sessions
      where sessions.id = session_question_state.session_id
        and sessions.host_id = auth.uid()
    )
  );

-- ============================================================
-- SESSION ANSWERS
-- ============================================================
create table if not exists public.session_answers (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.session_players(id) on delete cascade,
  question_id uuid not null references public.game_questions(id) on delete cascade,
  choice_id uuid not null references public.game_question_choices(id) on delete cascade,
  answered_at timestamptz not null default now(),
  is_correct boolean not null default false,
  time_ms int not null default 0,
  points_awarded int not null default 0,
  unique(session_id, player_id, question_id)
);

alter table public.session_answers enable row level security;

-- Anyone can read answers (for results display)
create policy "Anyone can read session answers"
  on public.session_answers for select
  using (true);

-- Players can submit answers
create policy "Anyone can submit answers"
  on public.session_answers for insert
  with check (
    exists (
      select 1 from public.sessions
      where sessions.id = session_answers.session_id
        and sessions.status = 'playing'
    )
  );

-- ============================================================
-- AUTO-UPDATE PLAYER SCORES (trigger runs as definer, bypasses RLS)
-- ============================================================
create or replace function public.update_player_score()
returns trigger as $$
begin
  update public.session_players
  set score = (
    select coalesce(sum(points_awarded), 0)
    from public.session_answers
    where player_id = NEW.player_id
      and session_id = NEW.session_id
  )
  where id = NEW.player_id;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists on_answer_inserted on public.session_answers;
create trigger on_answer_inserted
  after insert on public.session_answers
  for each row execute function public.update_player_score();

-- ============================================================
-- Enable realtime on key tables
-- ============================================================
alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.session_players;
alter publication supabase_realtime add table public.session_question_state;
alter publication supabase_realtime add table public.session_answers;
