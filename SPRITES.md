# Sprites, artwork & permissions

**Status: prototype only. The current sprite setup is not cleared for a public or commercial release.**

## What the prototype uses

`src/lib/sprites.ts` builds sprite URLs; nothing else in the game knows where art comes from.

| `NEXT_PUBLIC_SPRITE_SET` | Source | Coverage |
| --- | --- | --- |
| `gen5` *(default)* | PokéAPI sprites repo, `versions/generation-v/black-white/{id}.png` | #1–649 in Black/White style. #650+ fall back to `default` |
| `default` | PokéAPI sprites repo, `sprites/pokemon/{id}.png` (`front_default`) | All 1,025 species + regional forms (ids ≥ 10000) |
| `placeholder` | Original pixel-art silhouette drawn in `Sprite.tsx` | Everything. No third-party art |

Sprites are hot-linked from `raw.githubusercontent.com/PokeAPI/sprites` and never bundled. If an image fails to load, the placeholder is shown instead. All sprites render at integer scale with `image-rendering: pixelated`.

Regional forms use their PokéAPI form id (e.g. Hisuian Typhlosion), so the reveal shows the form that made the answer valid. All 57 such ids were checked and resolve.

## Copyright and permission notes

- **Official game sprites** (Black/White and `front_default`) are © Nintendo / Creatures Inc. / GAME FREAK. The PokéAPI sprites repository redistributes them but **cannot grant you a license**. Its README notes that the sprites belong to their owners. Fan projects routinely use them under informal tolerance, but that is not permission. Monetization (ads, payments) raises the risk sharply.
- **Community "Gen 5 style" sprites for Gen 6–9** (for example the Smogon / Pokémon Showdown "gen5" sprite project) are made by individual artists. Each project has its own terms, often "credit required, non-commercial". **Not included.** Before using them, find each artist's or project's terms, record them here, and add credits in the UI.
- **Pokémon names and the Poké Ball design** are trademarks of Nintendo / Creatures / GAME FREAK. The ball icons in this repo (`PixelBall.tsx`) are original 12×12 pixel drawings, but the design they depict is still a trademark.
- **PokéAPI data** (names, stats, learnsets) is factual data served under PokéAPI's fair-use policy. We cache locally and never hit the API at runtime, as their docs request.
- **Fonts** (Press Start 2P, Pixelify Sans) are SIL Open Font License via Google Fonts. **Sound effects** are synthesized in code (`audio.ts`), so there are no audio assets.

## Before a public release, decide one of

1. **Placeholder / original art:** set `NEXT_PUBLIC_SPRITE_SET=placeholder`, or commission original creature-agnostic art (silhouettes, type icons). This is the lowest risk.
2. **Licensed community sprites:** obtain written permission from each artist or project, add their credits, and add a new sprite set in `sprites.ts`. Self-host the files in `public/sprites/` rather than hot-linking.
3. **Official sprites:** only with permission from the rights holders.

Also keep the in-game disclaimer: *"Fan-made, non-commercial prototype…"* (in the How to Play dialog).

## Permission log

| Asset | Source | License / permission | Credit required | Status |
| --- | --- | --- | --- | --- |
| Official sprites (BW, front_default) | PokéAPI/sprites repo | None granted (© Nintendo et al.) | n/a | Prototype only |
| Ball icons, placeholder silhouette | Original (this repo) | Ours | No | OK |
| Press Start 2P, Pixelify Sans | Google Fonts | SIL OFL 1.1 | No | OK |
| Community Gen 6–9 "gen5-style" sprites | — | **Not checked** | Likely | Not used |
