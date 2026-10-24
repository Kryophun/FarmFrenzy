# Farm Frenzy

A farm-fresh, responsive territory game inspired by Ataxx, for two human players on the same device. No accounts, AI, backend services, or build step.

## Run

Install Node.js 22 or newer, then run:

```sh
npm start
```

Open `http://127.0.0.1:3000` in your browser. Set `PORT` or `HOST` to override the development server defaults. The site can also be hosted on any static web server.

## Play

Fern starts. Select one of your pieces, then a highlighted empty square:

- **Clone:** move one square in any direction, leaving the original piece in place.
- **Jump:** move exactly two squares away (including diagonals and off-axis destinations), emptying the original square.
- **Flip:** every opposing piece immediately adjacent to the destination becomes yours. Flips do not chain.

Blocked players pass automatically. The game ends when the board fills, a player loses all pieces, or neither player has a legal move. The player with more pieces wins; equal scores are a draw. There is no repetition limit. Undo restores the previous turn, including after a game ends. New game asks for confirmation during an active match.

Use a mouse or touchscreen, or Tab into the board and navigate with arrow keys. Enter/Space selects a piece or destination; Escape clears the selection. Home/End moves to the first/last square of the row.

Games are kept in memory; refreshing starts a fresh match. Google Fonts is optional: local fallback fonts keep the game usable without network access. All artwork is original CSS, not assets from Sierra's game.

## Development

```sh
npm test
```

`game.js` is the pure game engine, `app.js` handles accessible browser interaction, and `server.js` serves only the public application files. There are no package dependencies.
