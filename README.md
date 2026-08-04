# BlitzSense

BlitzSense is a React chess-intuition trainer built from positions in rated Lichess and Chess.com games. Move analysis runs in a dedicated local Stockfish worker, while bundled positions keep guest training available if a provider is temporarily unavailable.

## Highlights

- Rated-game positions with opening, rating, game-speed, color, and difficulty filters
- Evaluation-loss scoring from five local Stockfish candidate lines, with memory and IndexedDB caches
- Timed and zen sessions, between-move or end-only analysis, streak and speed bonuses
- A reproducible Daily Challenge: the featured player, source-game snapshot, and shuffle are fixed by date
- Retry-mistakes sessions, bookmarks, history, milestones, Elo, and a global leaderboard
- Guest-first use with optional Supabase authentication and cross-device profile-state sync
- Mouse, touch, and keyboard chessboard controls; focus-trapped dialogs and reduced-motion support

## Local development

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Useful commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```

`npm run build` runs the complete quality gate before producing `dist/`. Tailwind is compiled locally; the production application does not depend on the Tailwind CDN.

## Optional Supabase setup

1. Create a Supabase project.
2. Apply [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql) with the Supabase CLI or SQL editor.
3. Copy `.env.example` to `.env.local` and provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Enable the desired Google and/or email authentication providers and add the local and production redirect URLs.

The migration creates profiles, sessions, seen-game cooldowns, synchronized user state, row-level-security policies, and a security-definer leaderboard function. Raw session rows remain private to their owner; the public leaderboard returns only aggregate fields.

Client session scores are constrained by the database but are still client-reported. Treat the leaderboard as a friendly comparison unless challenge submissions are later verified by a trusted server.

## Progress and synchronization

Guests use local storage. When a guest signs in, BlitzSense merges their achievements and bookmarks with the account state instead of overwriting either side. Sessions and seen games use dedicated database tables; preferences, streaks, milestones, bookmarks, and daily completions use the `user_state` record.

Provider games and engine lines are cached in IndexedDB with expiration times. Clearing site data removes guest progress and caches.

## Architecture

- `components/` — screens and reusable UI
- `hooks/` — auth, preferences, dialog behavior, sound, and session orchestration
- `services/` — position providers, Stockfish worker, persistence facade, and telemetry
- `db/` and `supabase/` — browser database client and schema migration
- `utils/` — chess rules, storage, deterministic selection, caching, and Elo calculations
- `data/` — curated static source data

`services/positions.ts` owns provider orchestration; provider-independent concerns such as deterministic randomization, persistent caching, telemetry, and daily-player data live in focused modules so they can be tested independently.

## Error reporting

Unexpected errors are retained locally in a small rolling log. Setting `VITE_ERROR_REPORT_URL` additionally sends a minimal JSON error record to your HTTPS endpoint. No position history, email address, or authentication token is included.

## CI

`.github/workflows/ci.yml` runs the clean-install, production build, and Chromium regression suite on pushes and pull requests.
