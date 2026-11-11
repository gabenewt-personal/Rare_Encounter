# Rare Encounter *(working title)*

A daily Pokémon trivia game where **rare correct answers score more**. Everyone gets the same six prompts each day ("Name a Ghost-type Pokémon", "Name a Pokémon that can learn Thunderbolt"…). Answer with any Pokémon from any generation; the less likely other trainers are to say it, the better the Poké Ball you earn.

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
| `npm run report [-- --days 90 --start YYYY-MM-DD --preview --out reports/q.md]` | **Question-quality report** (dev only): simulates N days and lists every prompt with category, answers, difficulty, answer-set completeness, similarity to the last 7 days, answer-type spread; flags problems |
| `npm run wildcards [-- --list]` | Review curated wildcard prompts: status, counts, typos, duplicates |
| `npx tsx scripts/synergy-report.ts [days]` | Simulate Team Synergy tiers for different player styles (override with `ALLOWANCE=… QUAD=… TIERS=…`) |

### Developer mode

Open `/?dev=1` (or `/?dev=1&date=2026-12-25`; add `&wildcards=preview` to let **pending** wildcards rotate so you can playtest them before approving). You get a **DEV** panel with ◀/▶ day buttons, a date picker, a sample of valid answers for the current prompt, and "Reset dev save". Dev mode uses a **separate save namespace**, so simulating dates never touches real progress — play consecutive simulated days to test streaks and Trainer Classes. Links between Home and the daily challenge keep the dev parameters.

## Screens

- **Home (`/`)**: title, today's Daily Challenge card (number, UTC date, status, and a **Play / Continue / View Today's Results** button), countdown to the next reset with the reset time in your local time, Trainer Class + streak, **Survival Mode — Coming Soon** (disabled), How to Play and Settings (sound, animations: Auto/Full/Reduced).
- **Daily challenge (`/daily`)**: prompts, timer, reveal, results. A finished day always opens on its results; it can't be replayed. Results end with **Return Home** and **Share**, pinned to the bottom of the screen.

Moving between screens never resets progress: everything is saved after each action.

## How it plays

1. Six prompts per day in a fixed shape: **2 easy (≥ 50 valid answers) → 3 medium (15–49) → 1 hard (5–14)**. Your six answers form a **party**, shown in a six-slot bar while you play.
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

6. After prompt six, **Team Synergy** rates the party's defensive typing and multiplies the rarity score (see below).
7. Results: final score with its breakdown (`RARITY 310 × TEAM 1.15 = 357`), each answer + ball (⧗ for timeouts), the **party analysis** (six sprites with types, synergy tier, an 18-type defense grid, biggest threats and walls), best & rarest answer, streak, Trainer Class, reset info, and a spoiler-free **Share** (`🟣🔵⌛⬛🟡🔴  357 pts` / `🛡️ Team Excellent ×1.15`).

### Team Synergy

`src/lib/synergy.ts` is pure and reads every number from `TEAM_SYNERGY` in `src/config/game.ts`, so it can be rebalanced without touching data or UI.

- **Type chart:** the modern chart from PokéAPI (`/type/{name}` damage relations), stored in `src/data/generated/typechart.json` and sanity-checked at build time (Ground→Flying 0×, Dragon→Fairy 0×, and so on). Dual types multiply, so 4× weaknesses and immunities are handled. Abilities, held items, moves and battle-only forms are ignored. A regional-form answer is scored with that form's typing (Hisuian Typhlosion = Fire/Ghost).
- **Exposure:** for each of the 18 attacking types, `max(0, weak − (resist + immune) − allowance)`, with a 4× weakness counting `quadWeaknessWeight` times. These are summed over all types. This measures *overlapping* weaknesses net of teammates who cover them, not a count of unique weak types.
- **Tiers** (current values):

| Tier | Exposure | Multiplier |
| --- | --- | --- |
| Excellent | 0–1 | 1.15× |
| Good | 2–3 | 1.10× |
| Fair | 4–6 | 1.05× |
| Poor | 7+ | 1.00× |

- **Tuning:** the suggested starting point (allowance 2, tiers 0 / 1–2 / 3–4 / 5+) was simulated over a year of real daily challenges (`scripts/synergy-report.ts`). It rated about half of all thoughtless parties Excellent and almost none Poor, so planning a team wouldn't matter. With allowance 1, 4× weaknesses counting double, and the tiers above, players who ignore typing land at ≈ 16% Excellent · 37% Good · 31% Fair · 17% Poor. The best achievable party is Excellent on ≈ 99% of days and never worse than Good.
- **Eligibility:** the multiplier applies only when all six answers are valid, distinct Pokémon. Any miss or timeout keeps the plain rarity score. Final = `round(base × multiplier)`, so the bonus is at most +15% and rarity stays the main source of points.
- **Fair question sets:** a Pokémon type can be the subject of at most one prompt per day (`MAX_PROMPTS_PER_TYPE`), so a day never stacks Ground + Ground/Rock + Ground Gen IV. Every prompt also records the attacking types ≥75% of its answers are weak to (`forcedWeak`, e.g. "catch by fishing" → Electric/Grass), and no type may be forced by more than two prompts a day. A test runs a beam search (`src/lib/teamSearch.ts`) over each day's answer sets and confirms the best party is always Good or better.
- **Saved results:** history stores the final `score` plus `baseScore`, `multiplier` and `synergyTier`. Older five-question saves are left untouched. They stay locked, keep their original score, count toward streaks, and simply show "no Team Synergy bonus" with a five-slot party. An unfinished pre-update save for the current day is discarded, because its prompts no longer exist (the seed moved to `v3`).

### Daily reset

The reset is global at **00:00 UTC** (`RESET_UTC_OFFSET_HOURS` / `RESET_TIMEZONE_LABEL`). Every date key, challenge number, challenge id, countdown and streak calculation uses the same UTC date, so a player in Tokyo and one in Los Angeles always get the same challenge at the same instant. The UI labels dates "UTC" and shows the reset in the player's local time. `tests/reset.test.ts` covers five timezones (including UTC+13:45), the Dec 31 → Jan 1 rollover, Feb 29, and streaks across both. Completing all six prompts, timeouts included, completes the day regardless of score.

## Question categories

Each prompt has a complete accepted-answer list built from cached PokéAPI data before it can be selected. Nothing is judged at runtime by AI. The small print under each prompt (`description`) states its scope.

| Group (weekly target) | Category | Examples |
| --- | --- | --- |
| **Core** (24/42 ≈ 57%) | Types · Dual types · Type + Gen | Ghost-type · Water & Ground · Fire-type from Gen IV |
| | Names | Starts with B |
| | Moves (Gen I–IV moves, any learner) | Can learn Thunderbolt |
| | Abilities (Gen I–IV abilities) | Can have Levitate |
| **Trivia** (12/42) | Base stats | Base Attack below 30 · Speed ≥ 120 · single highest stat is HP · Attack = Defense |
| | Locations | A region's first route · a cave · a forest · Safari Zone · Victory Road · Surfing · fishing · Headbutt · Rock Smash |
| | Evolution | Doesn't evolve · third stage · middle stage · evolves at Lv 40+ · by trade / friendship / time of day / known move |
| | Pokédex | Height/weight thresholds · official Pokédex color · genderless / always female / always male · Baby · Legendary / Mythical · Egg Groups |
| | Type matchups | Weak to Ice · 4× weak to Rock · immune to Ground · resists Fire · any 4× weakness |
| | Name & number patterns | Contains Z · double letter · same first/last letter · 4 or 5 letters · 10+ letters · ends with A · Dex # multiple of 25 |
| | Generation | Introduced in Gen III |
| **Wildcard** (6/42) | Curated | More than one head · based on a cat · looks like a man-made object |

### Rules

- **Species are the unit of answering**; each species once per day. Answer counts are computed after this deduplication and after form handling.
- **Names** are matched deterministically: case/accents/punctuation/spaces ignored, `♀/♂` = `f/m` = `female/male`, PokéAPI slugs accepted, plus a few common variants (`Mr Mime`, `Farfetched`, `Nidoran F`). Name-pattern prompts count letters only (é = e; spaces and symbols ignored).
- **Typing-based prompts** (types, matchups, abilities, moves) accept a species if its **standard form or a regional form** (Alolan, Galarian, Hisuian, Paldean) fits, using current typing. The regional sprite is shown on reveal. Megas, Gigantamax and battle-only forms never count.
- **Base stats, height and weight** use the **standard form only**.
- **Generation** = the species' debut generation (Alolan Vulpix is still Gen I).
- **Moves**: any learn method (level-up, TM/HM/TR, egg, tutor) in any main-series version group PokéAPI records. Only moves from Gens I–IV are *asked about* (`PROMPT_FAMILIARITY`).
- **Locations**: PokéAPI wild-encounter data (gifts, trades and one-off encounters excluded). This mostly covers Gen I–VII games, and the scope note says so.
- **Type matchups**: the current 18-type chart, by typing alone. Abilities (Levitate etc.) don't count.
- **Evolution** prompts credit the Pokémon that evolves (Haunter evolves by trade, not Gengar).
- **Pokédex color** is the single official color category. That's different from visual wildcards ("red anywhere on its body"), which say "judged from official artwork".

### Curated wildcards

`src/content/wildcards.json` holds subjective or descriptive prompts with a **hand-reviewed accepted-answer list**. Edit it directly; no code changes are needed.

```json
{ "id": "wild:cat", "prompt": "Name a Pokémon based on a cat.", "description": "Any feline — …",
  "basis": "concept", "status": "pending", "answers": ["Meowth", "Persian", …], "reviewNotes": "…" }
```

- `status`: `pending` → `approved` (enters rotation) or `rejected`. **Only approved entries with at least 12 resolvable answers rotate.**
- `basis`: `visual` (judged from official artwork, and the scope note says so) or `concept` (what the design is based on).
- `npm run wildcards` checks every entry for unknown names, duplicates and counts, and shows its status. Tests fail on typos.
- Five starter prompts ship as **pending** (multiple heads, man-made objects, dogs/wolves, cats, shells), with review notes on the borderline picks. With the 14-day no-repeat rule, about **12+ approved wildcards** are needed to reach 6 per week. Until then, unused wildcard slots go to trivia, so core stays at ~57%.

### Difficulty

Bands use an **effective answer count**: raw valid answers × the category's `conceptFactor`. For example, recalling locations (0.6) or Pokédex numbers (0.5) is harder than recalling types (1.0). The guidelines are easy **60+**, medium **25–59** and challenging **12–24**. Prompts with fewer than **12** raw answers are never generated. Threshold prompts (stats, height, weight, evolution level) are generated at round numbers chosen to land in each band.

## Architecture

```
scripts/build-dataset.ts   PokéAPI → trim → validate → cache → generated JSON
scripts/expanded-categories.ts  Stats, Pokédex, matchup, evolution, location, name-pattern prompts
scripts/question-report.ts / wildcard-review.ts / synergy-report.ts   dev-only diagnostics
src/config/game.ts         ALL tunables: difficulty bands + daily layout, per-difficulty
                           category weights, timer, tiers/points, popularity model,
                           trainer classes, reset time
src/data/generated/        Committed, versioned data used at runtime
  pokedex.json             1,025 species (id, name, gen, types, flags, evolution stage) + regional form typings
  typechart.json           18×18 type effectiveness (PokéAPI, current generation)
  questions.json           ~730 generated prompts: verified answer set, family, scope note,
                           forced weaknesses, relevance hints
src/content/wildcards.json Curated wildcard prompts with review status (edit freely)
src/lib/                   ── mode-agnostic engine (reused by Survival later) ──
  questionDeck.ts          Difficulty bands, weighted categories, no-repeat dealing,
                           difficultyForRound() ramp for Survival
  validation.ts            Pure answer validation
  rarity.ts                RarityProvider interface, prompt-specific estimate, observed provider
  timer.ts                 Wall-clock timer math
  questionTraits.ts        Effective difficulty, family, generation tag, forced weaknesses
  wildcards.ts             Loads/validates curated wildcards; only approved ones rotate
  synergy.ts               Team defensive analysis + multiplier tiers (config-driven)
  teamSearch.ts            Best achievable party for a prompt set (tests/tooling)
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
                           QuestionTimer, AnswerInput, Reveal, Results, PartyBar,
                           PartyAnalysis, TypeBadge, TrainerCard…
tests/                     Vitest: validation, expanded categories + wildcards + rotation, rarity,
                           daily, timer, reset, streak, synergy
```

### Data pipeline

`npm run data` fetches every species, its default + regional forms, all evolution chains, and details for usable moves/abilities/items. It trims and caches each response (pokemon/move/ability cache entries are versioned, so a change to the trim only refetches those). It validates the data and fails loudly on problems, then builds every prompt with its verified answer set. Prompts with fewer than 5 answers are never generated. For each prompt it also records **relevance hints**:

- `strong`: the textbook answer for *this* prompt. That's the primary type (any Flying type, since Flying is usually listed second), a move learned by level-up that shares the move's type, or a regular (non-hidden) ability.
- `weak`: a correct but deep-cut answer, such as a regional-form-only match, an off-type move learned only by TM/egg/tutor, or a hidden ability.

### Daily generator & rotation

A pure, deterministic function of the date, the question pool, the config and `CHALLENGE_SEED_VERSION` (now `v4`):

1. **Layout:** easy, easy, medium, medium, medium, challenging.
2. **Weekly plan** (`planWeek`): 42 slots split by `WEEKLY_GROUP_QUOTA` (24 core · 12 trivia · 6 wildcard). Wildcards land on 6 of the 7 days, and trivia gives each day 1–2 prompts. Scarce groups are placed first, in slots whose difficulty they can fill.
3. **Category pick** within the group, by per-difficulty weight. Categories used yesterday or the day before are damped (`ROTATION_DAMPING`) so they rotate.
4. **Daily variety rules** (`DAILY_VARIETY`):
   - one prompt per **family** (never two base-Attack thresholds, or two "can learn" prompts, in a day);
   - one generation-specific prompt;
   - one prompt per subject type (immunity prompts count as their type: "immune to Normal" = Ghost);
   - at most 2 per category;
   - no attacking type forced as a weakness by more than 2 prompts.
5. **No repeats:** a prompt isn't reused within 14 days when avoidable, and each (difficulty, category) deck cycles through all of its prompts before reusing any.
6. **Fallback:** if a group has nothing eligible for a slot (e.g. no approved wildcards), the slot goes to trivia, then core.

The generator replays history from the epoch (memoized). The challenge id fingerprints the day's prompts. An unfinished save is discarded if the prompts change, while a **completed** day stays locked.

> Ship dataset or config changes at the reset (00:00 UTC). Changing weights, pools, quotas or the seed reshuffles future days.

**Quality report** (`npm run report`), latest 91-day run:
- ~56% core prompts; 2 / 3 / 1 difficulty per day.
- 0 team-constrained days and 0 shared-weakness stacks.
- Eligible answers span all generations (Gen I ≈ 19%, Gen VI ≈ 6%).
- Remaining flags are informational: trivia families on 3 days running, Move prompts on 5 days running, and a few similar answer sets within a week.

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
