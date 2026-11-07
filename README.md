# Rare Encounter *(working title)*

A daily Pokémon trivia game where **rare correct answers score more**. Everyone gets the same five prompts each day ("Name a Ghost-type Pokémon", "Name a Pokémon that can learn Thunderbolt"…). Answer with any Pokémon from any generation; the less likely other trainers are to say it, the better the Poké Ball you earn.

Built with Next.js 16 (App Router) + React 19 + TypeScript, plain structured CSS, and a locally cached PokéAPI dataset. No accounts, no backend, no credentials needed.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm test` | Vitest suite (validation, rarity, daily layout, timer, timezone/year reset, streaks, dataset spot checks) |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run build && npm start` | Production build (the page is fully static) |
| `npm run data` | Rebuild the dataset from PokéAPI (uses `.cache/`; add `-- --fresh` to refetch) |
| `npx tsx scripts/rarity-report.ts [questionId…]` | Print estimated rarity distributions for tuning |

### Developer mode

Open `/?dev=1` (or `/?dev=1&date=2026-12-25`). You get a **DEV** panel with ◀/▶ day buttons, a date picker, a sample of valid answers for the current prompt, and "Reset dev save". Dev mode uses a **separate save namespace**, so simulating dates never touches real progress — play consecutive simulated days to test streaks and Trainer Classes. Links between Home and the daily challenge keep the dev parameters.

## Screens

- **Home (`/`)**: title, today's Daily Challenge card (number, UTC date, status, and a **Play / Continue / View Today's Results** button), countdown to the next reset with the reset time in your local time, Trainer Class + streak, **Survival Mode — Coming Soon** (disabled), How to Play and Settings (sound, animations: Auto/Full/Reduced).
- **Daily challenge (`/daily`)**: prompts, timer, reveal, results. A finished day always opens on its results; it can't be replayed. Results end with **Return Home** and **Share**, pinned to the bottom of the screen.

Moving between screens never resets progress: everything is saved after each action.

## How it plays

1. Five prompts per day in a fixed shape: **2 easy (≥ 50 valid answers) → 2 medium (15–49) → 1 hard (5–14)**.
2. Each prompt has a **20-second timer** (`QUESTION_TIME_LIMIT_SECONDS`). It starts once the prompt has finished typing and the input is enabled, and stops on a valid submission. Misspelled names and repeats don't cost a turn and don't reset it. Running out scores 0 ("TIME'S UP!") and moves on. The last 5 seconds turn red, with a tick if sound is on. There's **no speed bonus**: rarity is the only thing scored.
3. The timer is wall-clock based (a saved start timestamp). Reloading, switching tabs, going Home or locking the phone don't pause it. If it ran out while you were away, the prompt resolves as a timeout when you come back, with a notice.
4. Type a Pokémon (autocomplete, ▲▼ + Enter, or tap). A real Pokémon that doesn't fit the prompt costs the turn (0 pts, "It broke free!").
5. Correct answers get a sprite reveal, a ball wobble, and a tier:

| Ball | Est. share of answers *for this prompt* | Points |
| --- | --- | --- |
| Poké Ball | ≥ 20 % | 10 |
| Great Ball | 5–20 % | 25 |
| Ultra Ball | 1–5 % | 50 (gold flash, pixel burst, points count-up) |
| Master Ball | < 1 % | 100 (colour flash, screen shake, 12-pixel burst, fanfare) |

   Under reduced motion (OS setting or in-game), flashes, shakes, bursts and wipes are removed. The coloured frame, label and points still make Ultra and Master stand out.

6. Results: total score, each answer + ball (⧗ for timeouts), best & rarest answer, streak, Trainer Class, progress, reset info, and a spoiler-free **Share** (`🟣🔵⌛⬛🟡 175 pts`).

### Daily reset

The reset is global at **00:00 UTC** (`RESET_UTC_OFFSET_HOURS` / `RESET_TIMEZONE_LABEL`). Every date key, challenge number, challenge id, countdown and streak calculation uses the same UTC date, so a player in Tokyo and one in Los Angeles always get the same challenge at the same instant. The UI labels dates "UTC" and shows the reset in the player's local time. `tests/reset.test.ts` covers five timezones (including UTC+13:45), the Dec 31 → Jan 1 rollover, Feb 29, and streaks across both. Completing all five prompts, timeouts included, completes the day regardless of score.

## Answer rules

- **Species are the unit of answering.** Each species once per day.
- **Names** are matched deterministically: case/accents/punctuation/spaces ignored, `♀/♂` = `f/m` = `female/male`, PokéAPI slugs accepted, plus a few common variants (`Mr Mime`, `Farfetched`, `Nidoran F`). See `src/lib/pokedex.ts`.
- **Types** use current-generation typing (Clefairy is Fairy). A species qualifies if its **default form or a regional form** (Alolan, Galarian, Hisuian, Paldean) fits; the regional sprite is shown on reveal. Megas, Gigantamax, Rotom appliances, and other battle/cosmetic forms don't count.
- **Generation** = the species' debut generation (Alolan Vulpix is still Gen I).
- **Moves** count if PokéAPI records the species (default or regional form) learning it by **any method** — level-up, TM/HM/TR, egg, tutor — in **any main-series version group**. Prompts only *ask about* moves and abilities introduced in Gens I–IV (`PROMPT_FAMILIARITY`), so a prompt is "Thunderbolt", never "Alluring Voice". Answers still span all nine generations.
- **Abilities** include hidden abilities.
- **Evolution** prompts credit the Pokémon that evolves (Clefairy uses a Moon Stone, not Clefable). "Trade" includes trade-with-item; "friendship" is any evolution with a friendship requirement.
- **Name** prompts ("starts with B") use the official English name with accents stripped.
- Encounter-location prompts are still left out: location data is per-game and often ambiguous.

## Architecture

```
scripts/build-dataset.ts   PokéAPI → trim → validate → cache → generated JSON
src/config/game.ts         ALL tunables: difficulty bands + daily layout, per-difficulty
                           category weights, timer, tiers/points, popularity model,
                           trainer classes, reset time
src/data/generated/        Committed, versioned data used at runtime
  pokedex.json             1,025 species (id, name, gen, types, flags, evolution stage)
  questions.json           ~750 prompts, each with a verified answer set + relevance hints
src/lib/                   ── mode-agnostic engine (reused by Survival later) ──
  questionDeck.ts          Difficulty bands, weighted categories, no-repeat dealing,
                           difficultyForRound() ramp for Survival
  validation.ts            Pure answer validation
  rarity.ts                RarityProvider interface, prompt-specific estimate, observed provider
  timer.ts                 Wall-clock timer math
  pokedex.ts               Name normalization, lookup, autocomplete search
                           ── daily mode ──
  questions.ts             Daily challenge generator (built on QuestionDeck)
  session.ts               One attempt at one day: timer start/timeout, answers, persistence
  progress/streak.ts       Streak + Trainer Class rules (pure)
  progress/store.ts        GameStore interface; LocalStorageStore (live/dev), MemoryStore
                           ── shared ──
  client.ts                URL/dev context, settings, motion preference
  dates.ts / random.ts     UTC date keys, countdown, next reset; seeded PRNG
  sprites.ts / audio.ts / share.ts
src/app/page.tsx           Home        src/app/daily/page.tsx   Daily challenge
src/components/            Shell (header/footer/settings/help/keyboard), Home, DailyGame,
                           QuestionTimer, AnswerInput, Reveal, Results, TrainerCard…
tests/                     Vitest: validation, rarity, daily, timer, reset, streak
```

### Data pipeline

`npm run data` fetches every species, its default + regional forms, all evolution chains, and details for usable moves/abilities/items. It trims and caches each response (pokemon/move/ability cache entries are versioned, so a change to the trim only refetches those). It validates the data and fails loudly on problems, then builds every prompt with its verified answer set. Prompts with fewer than 5 answers are never generated. For each prompt it also records **relevance hints**:

- `strong`: the textbook answer for *this* prompt. That's the primary type (any Flying type, since Flying is usually listed second), a move learned by level-up that shares the move's type, or a regular (non-hidden) ability.
- `weak`: a correct but deep-cut answer, such as a regional-form-only match, an off-type move learned only by TM/egg/tutor, or a hidden ability.

### Daily generator

A pure function of the date, the question pool, the config, and `CHALLENGE_SEED_VERSION` (now `v2`):

1. Every day follows `DAILY_LAYOUT` = easy, easy, medium, medium, hard.
2. For each slot, a seeded RNG picks a category by its **per-difficulty weight** (`CATEGORY_CONFIG[cat].weights`), ≤ 2 per category per day. It only considers categories that still have a prompt not used in the last 14 days, so tiny pools sit out instead of repeating.
3. The `QuestionDeck` deals from seeded shuffled cycles per (difficulty, category).

The generator replays history from the epoch (memoized). Tests confirm the layout on every day for a year, and **no prompt repeats within 14 days over two simulated years**. The challenge id fingerprints the day's prompts: an unfinished save is discarded if the prompts change, and a **completed** day stays locked regardless.

> Ship dataset or config changes at the reset (00:00 UTC). Changing weights, pools, or the seed reshuffles future days.

### Rarity: prompt-specific estimate now, real data later

`EstimatedRarityProvider` ranks a prompt's valid answers by **answer likelihood for that prompt**. That starts from general familiarity (generation, starter line, legendary/mythical, fully evolved, a curated iconic list, a Pikachu mascot bonus), then adds the prompt's `strong` hint or subtracts its `weak` one. Shares are Zipf-distributed by rank, with ties sharing an average rank. So the same Pokémon has different rarity on different prompts: Gengar is common as a Ghost type but rarer as a Poison type, and Pikachu tops "learns Thunderbolt" while a TM-only Rattata is a deep cut. It's labelled **ESTIMATED / EST.** everywhere, and it's deterministic, so everyone sees the same tiers all day.

`ObservedRarityProvider` (implemented and tested) takes real per-question counts, ideally frozen at the start of the day, and blends them with the estimate as a prior. Its `label` is "Player data", and the UI copy switches automatically via `provider.isEstimate`.

### Mobile

- The visual viewport is tracked (`<html data-kb>`, `--vvh`). When the iOS keyboard opens, the header, footer and banners collapse and the prompt is scrolled to the top. The timer, prompt, input and up to 3 suggestions fit above the keyboard (checked at a 400px visible height).
- Autocomplete is an overlay, and the hint line and typewriter reserve their space, so typing never shifts the layout.
- Inputs use 20px text (no iOS zoom), all controls are ≥ 44px tall, safe-area insets are respected, and the results actions stay pinned to the bottom of the screen.

### Survival Mode (prepared, not built)

Survival needs no new engine: `new QuestionDeck(QUESTION_POOL, CATEGORY_CONFIG, runSeed)`, then each round `deck.pickCategory(difficultyForRound(r), rng)` + `deck.deal(…, isFresh = not asked this run)`. It would validate with `validateAnswer` (an `incorrect` result ends the run), score with `scoreAnswer`, time with `timer.ts`, and keep its own store keys and best-run stats, separate from daily sessions and streaks.

### Persistence → accounts later

All storage goes through the `GameStore` interface. `LocalStorageStore` falls back to memory if storage is blocked (private mode). A `SupabaseStore` keyed by user id can implement the same methods. Player progress is plain JSON (`schemaVersion: 1`, per-day history), so it can be uploaded and merged on first sign-in.

### Deploying

Both routes are static (`○ /`, `○ /daily`), so the app deploys to Vercel with zero config and no environment variables. Optional: `NEXT_PUBLIC_SPRITE_SET=gen5|default|placeholder`.

## Sprites & legal

See [SPRITES.md](SPRITES.md). **Read it before any public release.**

## Version 2 roadmap (most important first)

1. **Real answer frequencies.** Record anonymous submissions (Supabase table: date, question id, species id). Freeze each day's counts into a snapshot used for the *next* day of that prompt, or score live with a provisional/final split. Plug it into `ObservedRarityProvider`.
2. **Server-side validation and answers.** Today the full question pool ships to the browser (~100 KB gzipped), so answers can be inspected and the device clock can be changed. Move challenge generation and validation behind a route handler, and send the client only the prompt text.
3. **Licensed or original art.** Commission or source sprites with explicit permission, or ship the placeholder set (see SPRITES.md).
4. **Accounts and cloud sync.** Add a `SupabaseStore` and migrate localStorage progress on first login.
5. **Curated prompt quality.** Hand-tune the iconic list and relevance hints with real data. Add an editorial override manifest for special days.
6. **Survival Mode** on top of `QuestionDeck` (see above).
7. **More categories.** Egg groups, colors, height/weight bands, signature moves, unambiguous encounter locations, and type + ability combos.
8. **Polish.** Animated sprite option, haptics on iOS, a PWA install/offline mode, a stats/history screen, and a streak-freeze item.
