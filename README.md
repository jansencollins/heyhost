# HeyHost — Interactive Trivia Game Platform

A live trivia game platform inspired by Kahoot. Hosts create AI-generated trivia games and run them live. Players join from their phones using a short game code — no account needed.

## Features

- **Host Dashboard** — Create, edit, and manage trivia games
- **AI Question Generation** — Auto-generate multiple-choice questions by topic, age range, and difficulty
- **Live Sessions** — Real-time lobby, gameplay, and scoring
- **Game Screen** — Big-display presentation mode with questions, timer, results, and leaderboard
- **Host Remote** — Mobile-friendly controls to run the game
- **Player View** — Join with a code, pick a color, answer questions
- **Dark/Light Mode** — Toggle in dashboard

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4**
- **Supabase** — Auth, Postgres, Realtime

## Setup

### 1. Create a Supabase Project

Go to [supabase.com](https://supabase.com) and create a new project.

### 2. Run the Schema

Open the SQL Editor in your Supabase dashboard and paste the contents of `supabase/schema.sql`. Run it to create all tables, RLS policies, and realtime subscriptions.

**Important:** After running the schema, go to your Supabase Dashboard > Database > Replication and ensure the following tables are enabled for realtime:
- `sessions`
- `session_players`
- `session_question_state`
- `session_answers`

### 3. Configure Environment Variables

Copy the example file and fill in your Supabase credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional: for AI question generation (falls back to mock generator)
AI_API_KEY=
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_MODEL=gpt-4o-mini
```

Find your keys in Supabase Dashboard > Settings > API.

### 4. Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to Test (Demo Flow)

### Step 1: Create a Game (Host)

1. Go to `http://localhost:3000/login`
2. Sign up with any email/password
3. Click **New Game** in the dashboard
4. Enter a topic (e.g., "Space exploration"), pick settings, click **Generate Questions**
5. Review/edit questions, then click **Save Game**

### Step 2: Start a Live Session

1. Open the saved game from the dashboard
2. Click **Start Live Game**
3. You'll see the Host Remote with a game code (e.g., `A4K7NP`)
4. Click **Open Screen** to open the Game Screen in a new tab (this is what you'd project on a big display)

### Step 3: Join as a Player

1. Open a second browser/incognito window
2. Go to `http://localhost:3000/play`
3. Enter the game code shown on the Game Screen
4. Pick a name and color, then click **Join Game**
5. You'll appear in the lobby on both the Host Remote and Game Screen

### Step 4: Play

1. On the Host Remote, click **Start Game**
2. The Game Screen shows the question with a countdown timer
3. The Player View shows answer buttons — tap one to answer
4. After the timer ends (or host clicks **End Question**), results are displayed
5. Host clicks **Next Question** to advance
6. After the last question, the final leaderboard is shown

## Architecture

### Routes

| Route | Purpose |
|-------|---------|
| `/` | Landing page |
| `/login` | Host authentication (sign up / sign in) |
| `/dashboard` | Game list |
| `/dashboard/games/new` | Create game with AI generation |
| `/dashboard/games/[gameId]` | Edit game questions, start live session |
| `/host/session/[sessionId]` | Host Remote — mobile controls during game |
| `/screen/[sessionCode]` | Game Screen — big display for projector/TV |
| `/play` | Player code entry |
| `/play/[sessionCode]` | Player in-session view |

### Realtime Strategy

Uses **Supabase Realtime postgres_changes** — subscribing to row-level INSERT/UPDATE events on four key tables:

- `sessions` — status changes, current question index
- `session_players` — joins, kicks, score updates
- `session_question_state` — timer start/pause/lock/results
- `session_answers` — new answers for live distribution

This was chosen over broadcast channels because:
1. The database is the single source of truth — no reconciliation needed
2. All state changes are durable and queryable
3. Supabase handles fan-out to all connected clients automatically
4. Simpler to reason about vs. broadcast + separate DB writes

Trade-off: ~100-200ms higher latency than pure broadcast, but acceptable for 30s question timers.

### Scoring

- **Base points:** 1000 per correct answer
- **Speed bonus (optional):** Up to 500 additional points scaled linearly by response time
- Points are calculated client-side on answer submission and stored in `session_answers`
- Player total scores are stored on `session_players.score`

### AI Question Generation

The `/api/generate-questions` route supports two modes:

1. **Mock generator** (default): Returns deterministic sample questions when no `AI_API_KEY` is configured
2. **LLM generator**: Calls an OpenAI-compatible API with a structured prompt when `AI_API_KEY` is set

The generator is behind a simple interface — swap providers by changing the env vars.

## Database Schema

See `supabase/schema.sql` for the complete schema including:

- `profiles` — Host user profiles (auto-created on signup)
- `games` — Trivia game definitions
- `game_questions` — Questions belonging to a game
- `game_question_choices` — Answer choices per question
- `sessions` — Live game sessions with unique codes
- `session_players` — Players in a session
- `session_question_state` — Per-question timer/state
- `session_answers` — Player answers with scoring

All tables have Row Level Security (RLS) policies:
- Hosts can only read/write their own games
- Session data is publicly readable (players need it)
- Player joins and answer submissions are restricted to active sessions
- Host-only actions (kick, advance, pause) require authenticated host ownership
