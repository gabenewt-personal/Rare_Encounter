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
| `npm test` | Vitest suite (validation, scoring, daily generation/reset, streaks, dataset spot checks) |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run build && npm start` | Production build (the page is fully static) |
| `npm run data` | Rebuild the dataset from PokéAPI (uses `.cache/`; add `-- --fresh` to refetch) |
| `npx tsx scripts/rarity-report.ts [questionId…]` | Print estimated rarity distributions for tuning |

### Developer mode

Open `/?dev=1` (or `/?dev=1&date=2026-12-25`). You get a **DEV** panel with ◀/▶ day buttons, a date picker, a sample of valid answers for the current prompt, and "Reset dev save". Dev mode uses a **separate save namespace**, so simulating dates never touches real progress — play consecutive simulated days to test streaks and Trainer Classes.

## How it plays

1. Five prompts per day, ordered easy → hard (by number of valid answers).
2. Type a Pokémon (autocomplete, ▲▼ + Enter, or tap). Unknown names and Pokémon you've already used today don't cost a turn. A real Pokémon that doesn't fit the prompt *does* (0 pts, "It broke free!").
3. Correct answers get a sprite reveal, a ball-wobble animation, and a tier:

| Ball | Share of answers | Points |
| --- | --- | --- |
| Poké Ball | ≥ 20 % | 10 |
| Great Ball | 5–20 % | 25 |
| Ultra Ball | 1–5 % | 50 |
| Master Ball | < 1 % | 100 (flash, sparkles, fanfare) |

4. Results screen: total score, each answer + ball, best & rarest answer, streak, Trainer Class, progress, and a spoiler-free **Share** (`🟣🔵🔴⬛🟡 285 pts`).

The global reset is **00:00 UTC**. Completing all five prompts completes the day regardless of score.

## Answer rules

- **Species are the unit of answering.** Each species once per day.
- **Names** are matched deterministically: case/accents/punctuation/spaces ignored, `♀/♂` = `f/m` = `female/male`, PokéAPI slugs accepted, plus a few common variants (`Mr Mime`, `Farfetched`, `Nidoran F`). See `src/lib/pokedex.ts`.
- **Types** use current-generation typing (Clefairy is Fairy). A species qualifies if its **default form or a regional form** (Alolan, Galarian, Hisuian, Paldean) fits; the regional sprite is shown on reveal. Megas, Gigantamax, Rotom appliances, and other battle/cosmetic forms don't count.
- **Generation** = the species' debut generation (Alolan Vulpix is still Gen I).
- **Moves** count if PokéAPI records the species (default or regional form) learning it by **any method** — level-up, TM/HM/TR, egg, tutor — in **any main-series version group**.
- **Abilities** include hidden abilities.
- **Evolution** prompts credit the Pokémon that evolves (Clefairy uses a Moon Stone, not Clefable). "Trade" includes trade-with-item; "friendship" is any evolution with a friendship requirement.
- Encounter-location prompts were deliberately left out of v1: location data is per-game and often ambiguous.

## Architecture

```
scripts/build-dataset.ts   PokéAPI → trim → validate → cache → generated JSON
src/config/game.ts         ALL tunables: categories, weights, answer-count bounds,
                           tiers/points, popularity model, trainer classes, reset time
src/data/generated/        Committed, versioned data used at runtime
  pokedex.json             1,025 species (id, name, gen, types, flags, evolution stage)
  questions.json           ~800 candidate prompts, each with its verified answer set
src/lib/
  pokedex.ts               Name normalization, lookup, autocomplete search
  questions.ts             Deterministic daily challenge generator
  validation.ts            Pure answer validation
  rarity.ts                RarityProvider interface, estimated + observed providers, tiers/points
  session.ts               One attempt at one day (pure transitions + persistence helper)
  progress/streak.ts       Streak + Trainer Class rules (pure)
  progress/store.ts        GameStore interface; LocalStorageStore (live/dev namespaces), MemoryStore
  dates.ts / random.ts     UTC date keys, countdown; seeded PRNG
  sprites.ts               Swappable sprite sources
  audio.ts / share.ts      WebAudio chiptune SFX (muted by default); share text
src/components/            UI: Game (state machine), AnswerInput, Reveal, Results, TrainerCard…
tests/                     Vitest suites
```

### Data pipeline

`npm run data` fetches every species, its default + regional forms, all evolution chains, and English names for usable moves/abilities/items (~3,300 requests on a cold cache, a few seconds warm). It validates the data (≥1,000 species, unique ids, a default form for every species, valid types and generations, English names) and fails loudly otherwise. Every generated prompt's answer set is checked against the Pokédex and against the min/max answer counts in `CATEGORY_CONFIG`. The game never calls PokéAPI at runtime.

### Daily generator

A pure function of the date, the question pool, the config, and `CHALLENGE_SEED_VERSION`:

1. A seeded RNG (version + day index) fills five slots with categories by weight (≤ 2 per category).
2. Each category deals from a seeded shuffle of its pool, cycle by cycle, so every prompt is used before any repeats.
3. Prompts used within `NO_REPEAT_DAYS` (14) are skipped. Tiny pools (Generation, Evolution: 9–11 prompts) stay ≥ 10 days apart, which is tested over two simulated years.
4. Prompts are sorted easy → hard.

The generator replays history from the epoch (memoized, ~1,500 picks per year). The challenge id includes a fingerprint of the day's prompts, so an unfinished save can't be replayed against different questions after a data update. A **completed** day stays locked regardless.

> Ship dataset or config changes at the reset (00:00 UTC). Changing weights, pools, or the seed reshuffles future days.

### Rarity: estimated now, real later

`EstimatedRarityProvider` ranks a prompt's valid answers by a popularity score (generation, starter line, legendary/mythical, fully evolved, a curated "iconic" list, and a penalty for regional-form-only matches). It then assigns Zipf-distributed shares by rank (ties share an average rank). This is a **model, not player data**, and the UI says so. It's deterministic, so every player sees the same tiers all day.

`ObservedRarityProvider` is already implemented and tested. It takes real per-question answer counts (e.g. a Supabase snapshot frozen at the start of the day so scores stay stable) and blends them with the estimate as a prior. Switching providers doesn't change gameplay code.

### Persistence → accounts later

All storage goes through the `GameStore` interface. `LocalStorageStore` falls back to memory if storage is blocked (private mode). A `SupabaseStore` keyed by user id can implement the same five methods. Player progress is plain JSON (`schemaVersion: 1`, per-day history), so it can be uploaded and merged on first sign-in.

### Deploying

The app builds to a static page (`○ /` in `next build`), so it deploys to Vercel with zero config and no environment variables. Optional: `NEXT_PUBLIC_SPRITE_SET=gen5|default|placeholder`.

## Sprites & legal

See [SPRITES.md](SPRITES.md). **Read it before any public release.**

## Version 2 roadmap (most important first)

1. **Real answer frequencies.** Record anonymous submissions (Supabase table: date, question id, species id). Freeze each day's counts into a snapshot used for the *next* day of that prompt, or score live with a provisional/final split. Plug it into `ObservedRarityProvider`.
2. **Server-side validation and answers.** Today the full question pool ships to the browser (~100 KB gzipped), so answers can be inspected and the device clock can be changed. Move challenge generation and validation behind a route handler, and send the client only the prompt text.
3. **Licensed or original art.** Commission or source sprites with explicit permission, or ship the placeholder set (see SPRITES.md).
4. **Accounts and cloud sync.** Add a `SupabaseStore` and migrate localStorage progress on first login.
5. **Curated prompt quality.** Hand-tune the iconic list. Add prompt "familiarity" weights so obscure move and ability names (e.g. "Alluring Voice") appear less often than famous ones. Add an editorial override manifest for special days.
6. **More categories.** Egg groups, colors, height/weight bands, signature moves, unambiguous encounter locations, and type + ability combos.
7. **Polish.** Animated sprite option, haptics on iOS, a PWA install/offline mode, a stats/history screen, and a streak-freeze item.
