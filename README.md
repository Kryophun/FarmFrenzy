# Farm Frenzy

A farm-fresh, responsive territory game inspired by Ataxx, for two human players on the same device. Written in strict TypeScript, with no accounts, AI, or backend services.

## Run

Install Node.js 22 or newer, then run:

```sh
npm ci
npm start
```

Open `http://127.0.0.1:3000` in your browser. `npm start` compiles the TypeScript and copies the HTML/CSS to `dist` before starting the server. Restart it after editing source files. Set `PORT` or `HOST` to override the development server defaults.

For static hosting, run `npm run build` and publish only `dist/index.html`, `dist/styles.css`, `dist/app.js`, and `dist/game.js`.

## Play

Before the first match, each player chooses a farm friend from Cow, Pig, Chicken, Sheep, Horse, and Duck. Players must choose different pieces. Each animal suggests a name (for example, Sheep becomes BaaBaa). The name follows animal changes until the player edits it; after any manual edit, later animal changes never overwrite it, even if the name is changed back to a suggested default. Names are required, limited to 24 characters, and cannot be only spaces.

Pieces and names stay the same for rematches and new games until the page is refreshed or closed; they are not saved across visits. Player 1 starts. Select one of your pieces, then a highlighted empty square:

- **Clone:** move one square in any direction, leaving the original piece in place.
- **Jump:** move exactly two squares away (including diagonals and off-axis destinations), emptying the original square.
- **Flip:** every opposing piece immediately adjacent to the destination becomes yours. Flips do not chain.

Blocked players pass automatically. The game ends when the board fills, a player loses all pieces, or neither player has a legal move. The player with more pieces wins; equal scores are a draw. There is no repetition limit. Undo restores the previous turn, including after a game ends. New game asks for confirmation during an active match; after a match ends, it becomes Play again. Both actions keep the chosen pieces and names.

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

`game.ts` is the typed, pure game engine, `app.ts` handles accessible browser interaction, and `server.ts` serves only the public application files. `game.test.ts` contains the rules tests; `build.ts` copies static assets after compilation. Generated JavaScript lives in the ignored `dist` directory. There are no runtime package dependencies.

`eslint.config.ts` enables ESLint's recommended rules plus typescript-eslint's strict and stylistic type-checked presets for all TypeScript, including tests and tooling. Additional rules require explicit return types, safe boolean conditions, strict equality, braces, type-only imports, and exhaustive switches. Unsafe types, unhandled promises, unused code, and unused lint-disable directives fail linting; warnings also fail. Run `npm run lint:fix` for automatic fixes. `npm run check` runs lint, type checking, and the compiled game tests.

The Code quality GitHub Actions workflow runs `npm ci` and `npm run check` on pushes to `main` and on pull requests.
