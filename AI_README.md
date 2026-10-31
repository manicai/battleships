# Battleship

A single-page HTML5 Battleship game against an AI opponent, written in TypeScript.

## Run

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # typecheck + production build into dist/
```

## How to play

A guided tour runs on your first visit; press **?** in the header to replay it.

1. Place your fleet: click your board to place each ship (press **R** or right-click to rotate), or press **Randomize** (random fleets never have touching ships).
2. Press **Start Battle**, then click squares in *Enemy Waters* to fire. You and the AI alternate shots.
3. Sink all five enemy ships before they sink yours. **New Game** restarts at any time.
4. On the end screen, **View Board** hides the results so you can study the final boards (enemy ships you never found are outlined); **Results** brings the results back.

AI levels: **Easy** (mostly random), **Normal** (hunt/target with parity), **Hard** (probability density over every possible ship placement).

## Code

- `src/game.ts` – board, ships and shot rules
- `src/ai.ts` – computer opponent
- `src/main.ts` – UI and game flow
- `src/tutorial.ts` – guided tour with spotlight
- `src/effects.ts` – victory/defeat animations (canvas-confetti)
- `src/audio.ts` – synthesized sound effects (Web Audio API, no assets)
- `src/style.css` – layout, hit/miss/sunk animations, end-game overlay

## Open-source credits

- [Vite](https://vite.dev) (MIT) and [TypeScript](https://www.typescriptlang.org) (Apache-2.0)
- [canvas-confetti](https://github.com/catdad/canvas-confetti) (ISC)
- [Black Ops One](https://fonts.google.com/specimen/Black+Ops+One) and [Inter](https://rsms.me/inter/) fonts (SIL OFL)
