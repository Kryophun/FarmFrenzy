# Farm Frenzy

A farm-fresh, responsive territory game inspired by Ataxx. Play with two humans on the same device, challenge an AI, or watch two AIs compete. Written in strict TypeScript, with no accounts or backend services.

## Play online

[Play Farm Frenzy](https://kryophun.github.io/FarmFrenzy/) in your browser.

## Run

Install Node.js 22 or newer, then run:

```sh
npm ci
npm start
```

Open `http://127.0.0.1:3000` in your browser. `npm start` compiles the TypeScript and copies the HTML/CSS to `dist` before starting the server. Restart it after editing source files. Set `PORT` or `HOST` to override the development server defaults.

For static hosting, run `npm run build` and publish only `dist/index.html`, `dist/styles.css`, `dist/app.js`, `dist/game.js`, `dist/ai.js`, `dist/ai-worker.js`, `dist/auto-fill.js`, and `dist/sound.js`. Serve them together over HTTP(S), including the worker modules.

## Play

Before each match, each player chooses a farm friend from Cow, Pig, Chicken, Sheep, Horse, and Duck. Players must choose different pieces. Each animal suggests a name (for example, Sheep becomes BaaBaa). The name follows animal changes until the player edits it; after any manual edit, later animal changes never overwrite it, even if the name is changed back to a suggested default. Names are required, limited to 24 characters, and cannot be only spaces.

Set each player independently to **Human**, **Easy AI** (random legal moves), **Medium AI** (best immediate territory gain), or **Hard AI** (looks ahead using a bounded, up-to-three-ply search). Both players default to Human. AI runs entirely on your device in a Web Worker so the board and controls remain responsive.

New game and Play again return to the player-choice screen. Current pieces, names, and player types are prefilled so you can keep or change them before starting the next match. Refreshing or closing the page resets the choices; they are not saved across visits. Player 1 starts. On human turns, select one of your pieces, then a highlighted empty square:

- **Clone:** move one square in any direction, leaving the original piece in place.
- **Jump:** move exactly two squares away (including diagonals and off-axis destinations), emptying the original square.
- **Flip:** every opposing piece immediately adjacent to the destination becomes yours. Flips do not chain.

Jumps visibly travel in an arc from the source to the destination. Clones split off while the original piece stays behind. After landing, each captured piece gets a brief cartoon dust-cloud tussle featuring both players' animals, then reveals its new owner. Captures and scores settle when the tussles finish, and the next turn waits for the full animation. Reduced-motion preferences skip both travel and tussle animations. Undo, new-game actions, pause controls, and opening the rules safely finish or cancel any active visual transition, including every dust cloud.

**Sound:** the game-screen Sound selector turns a short cartoon tussle effect on or off. Sound starts enabled and is unlocked by pressing Let's play; the choice stays the same across new games until the page is refreshed. Each capturing move plays one half-second effect, even when it takes several pieces. The sound is synthesized locally, with no recordings, downloads, or external audio services. Reduced-motion mode can still play capture sounds; Sound Off mutes immediately. Undo, restart, rules, and pause controls stop any playing effect. Background tabs stay silent. If browser audio is unavailable or blocked, a visible message explains it and gameplay continues with sound off.

Blocked players pass automatically. The game ends when the board fills, a player loses all pieces, or neither player has a legal move. The player with more pieces wins; equal scores are a draw. There is no repetition limit. New game asks for confirmation during an active match; after a match ends, it becomes Play again and opens player choice without confirmation. Pending AI work is cancelled, and no new match begins until you press Let's play on the player-choice screen.

After all takeover animations and automatic fill waves finish, a prominent trophy banner appears above the board with the winner's name and final score. Scores are shown in Player 1–Player 2 order, with both names underneath. The banner scrolls into view, respects reduced-motion preferences, and disappears when you undo the finish or start another game.

**Automatic endgame finish:** when every remaining empty square is reachable by exactly one side through the remaining empty squares (including potential jumps), and all those squares can be filled by cloning, the game takes over. Each paced wave makes the maximum possible set of legal, non-capturing clones for both sides: each existing source piece can clone once, and each destination receives one piece. Matching can reassign clone destinations to avoid wasting opportunities. Squares created in a wave only become sources in the following wave. Any contested square keeps normal play, even when no immediate capture is available. If a player loses all their pieces, the winner is decided immediately but still fills the remaining empty squares in the same paced waves before the final score is shown. Reduced-motion mode still fills in paced batches without movement effects.

**Undo** restores one move in human-vs-human and AI-vs-AI games. Against one AI, it rewinds to the last human decision, including intervening AI moves. Undoing to an AI turn pauses AI until **Resume AI** is pressed. **Pause AI** stops pending AI work without changing the board; human turns are still playable. Opening the rules or restart dialog temporarily suspends AI and closing it resumes eligible turns. Restarting or undoing cancels any pending AI result. If AI fails to load or select a valid move, the game reports the error and offers **Retry AI** rather than silently making a fallback move.

Automatic fill waves do not create separate undo entries: undo removes the triggering move and the entire automatic finish. Rules and new-game controls safely interrupt automatic fill; returning to play resumes any remaining settled territory. An already-paused AI remains paused for normal turns until Resume AI is chosen, but a decided elimination win still completes its automatic fill.

Enable **Show AI thinking** during a match to open the move explorer. It shows actual candidate moves, their evaluations, the current candidate, best move, search depth, and visited positions. Worker updates are throttled, and the final analysis stays visible during the following human turn. Easy AI lists legal choices without invented scores. Medium and Hard display estimated piece advantage from the current AI's perspective; higher is better, and `≤` marks a search upper bound rather than an exact score. Hard's final report uses its last fully completed search depth. Undo and new games clear stale analysis.

Use a mouse or touchscreen, or Tab into the board and navigate with arrow keys. Enter/Space selects a piece or destination; Escape clears the selection. Home/End moves to the first/last square of the row.

Games are kept in memory; refreshing starts a fresh match. Google Fonts is optional: local fallback fonts keep the game usable without network access. All artwork is original CSS, not assets from Sierra's game.

## Development

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run check
```

`game.ts` is the typed, pure game engine, `ai.ts` contains the three AI strategies, `ai-worker.ts` runs AI off the UI thread, `auto-fill.ts` detects settled territory and plans safe fill waves, `sound.ts` synthesizes and controls capture audio, `app.ts` handles browser interaction, and `server.ts` serves only the public application files. The corresponding `*.test.ts` files cover game rules, AI strategies, automatic fill, and sound synthesis; `build.ts` copies static assets after compilation. Generated JavaScript lives in the ignored `dist` directory. There are no runtime package dependencies.

`eslint.config.ts` enables ESLint's recommended rules plus typescript-eslint's strict and stylistic type-checked presets for all TypeScript, including tests and tooling. Additional rules require explicit return types, safe boolean conditions, strict equality, braces, type-only imports, and exhaustive switches. Unsafe types, unhandled promises, unused code, and unused lint-disable directives fail linting; warnings also fail. Run `npm run lint:fix` for automatic fixes. `npm run check` runs lint, type checking, and the compiled game tests.

The Code quality GitHub Actions workflow runs `npm ci` and `npm run check` on pushes to `main` and on pull requests.

## Publishing

The **Publish game** workflow deploys to GitHub Pages whenever `main` changes, or when started manually with Run workflow. It installs the locked dependencies, runs lint, type checking, and tests, then uploads only the eight browser files listed above. Server code, tests, tooling, and repository configuration are not published.

GitHub Pages uses **GitHub Actions** as its publishing source. Deployments use the repository's `github-pages` environment and the workflow's short-lived deployment credentials; no personal credentials are stored in the workflow.
