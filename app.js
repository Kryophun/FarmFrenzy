import { SIZE, PLAYER_NAMES, createGame, legalMoves, moveType, scores, applyMove } from "./game.js";

let state = createGame();
let selected = null;
let focused = 0;
const history = [];
const board = document.querySelector("#board");
const announcement = document.querySelector("#announcement");
const rulesDialog = document.querySelector("#rules-dialog");
const resetDialog = document.querySelector("#reset-dialog");
const cells = [];

function coordinate(index) {
  return `${String.fromCharCode(65 + index % SIZE)}${Math.floor(index / SIZE) + 1}`;
}

for (let index = 0; index < SIZE * SIZE; index++) {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = "cell";
  cell.addEventListener("click", () => selectCell(index));
  cell.addEventListener("focus", () => {
    focused = index;
    cells.forEach((button, i) => { button.tabIndex = i === index ? 0 : -1; });
  });
  cell.addEventListener("keydown", event => {
    const row = Math.floor(index / SIZE);
    const column = index % SIZE;
    const targets = {
      ArrowUp: ((row + SIZE - 1) % SIZE) * SIZE + column,
      ArrowDown: ((row + 1) % SIZE) * SIZE + column,
      ArrowLeft: row * SIZE + (column + SIZE - 1) % SIZE,
      ArrowRight: row * SIZE + (column + 1) % SIZE,
      Home: row * SIZE,
      End: row * SIZE + SIZE - 1,
    };
    if (event.key in targets) {
      event.preventDefault();
      cells[targets[event.key]].focus();
    }
    if (event.key === "Escape") {
      selected = null;
      render();
    }
  });
  cells.push(cell);
  board.append(cell);
}

function selectCell(index) {
  if (state.over) return;
  if (state.board[index] === state.turn) {
    selected = selected === index ? null : index;
    render();
    announcement.textContent = selected === null
      ? "Selection cleared."
      : `${coordinate(index)} selected. Choose a highlighted square to clone or jump.`;
    return;
  }
  if (selected === null || !legalMoves(state.board, selected).includes(index)) {
    announcement.textContent = selected === null
      ? `Choose one of ${PLAYER_NAMES[state.turn]}'s pieces first.`
      : "That square is not available. Choose a highlighted square.";
    return;
  }
  history.push(state);
  state = applyMove(state, selected, index);
  selected = null;
  render(true);
  announceMove();
}

function render(animate = false) {
  const destinations = selected === null ? [] : legalMoves(state.board, selected);
  cells.forEach((cell, index) => {
    const piece = state.board[index];
    const available = destinations.includes(index);
    cell.className = "cell";
    cell.classList.toggle("selected", selected === index);
    if (available) cell.classList.add(`legal-${moveType(selected, index)}`);
    cell.classList.toggle("last-destination", state.lastMove?.to === index);
    if (animate && (state.lastMove?.to === index || state.lastMove?.captured.includes(index))) {
      cell.classList.add("just-moved");
    }
    cell.replaceChildren();
    if (piece) {
      const token = document.createElement("span");
      token.className = `piece ${piece === 1 ? "fern" : "coral"}-piece`;
      token.setAttribute("aria-hidden", "true");
      cell.append(token);
    }
    cell.tabIndex = index === focused ? 0 : -1;
    cell.setAttribute("aria-pressed", String(selected === index));
    cell.setAttribute("aria-label", `${coordinate(index)}, ${piece ? PLAYER_NAMES[piece] : "empty"}${available ? `, ${moveType(selected, index)} available` : ""}`);
  });

  const count = scores(state.board);
  for (const player of [1, 2]) {
    document.querySelector(`#score-${player}`).textContent = count[player];
    document.querySelector(`#player-${player}`).classList.toggle("active", !state.over && state.turn === player);
    document.querySelector(`#player-${player}-status`).textContent = state.over
      ? state.winner === 0 ? "Good game" : state.winner === player ? "The winner!" : "Well played"
      : state.turn === player ? "Your move" : state.passed === player ? "No moves - passed" : "Up next";
  }
  document.querySelector("#fern-share").style.width = `${count[1] / (count[1] + count[2]) * 100}%`;
  document.querySelector("#coral-share").style.width = `${count[2] / (count[1] + count[2]) * 100}%`;
  const turnLabel = document.querySelector("#turn-label");
  turnLabel.classList.toggle("coral", state.over ? state.winner === 2 : state.turn === 2);
  turnLabel.replaceChildren(document.createElement("span"), document.createTextNode(
    state.over ? state.winner === 0 ? "A perfectly matched rivalry." : `${PLAYER_NAMES[state.winner]} wins!`
      : `${PLAYER_NAMES[state.turn]}'s turn`,
  ));
  document.querySelector("#move-counter").textContent = `MOVE ${String(state.moves + (state.over ? 0 : 1)).padStart(2, "0")}`;
  document.querySelector("#undo").disabled = !history.length;
  document.querySelector("#selection-hint").textContent = state.over
    ? "Good game. A rematch is only a click away."
    : selected === null ? `Pick a ${PLAYER_NAMES[state.turn]} piece to see your possibilities.`
      : destinations.length ? "Filled dots clone. Outlined dots jump. Your move."
        : "This piece is blocked. Try another of your pieces.";
}

function announceMove() {
  const move = state.lastMove;
  const flipped = move.captured.length;
  let message = `${PLAYER_NAMES[move.player]} ${move.type === "clone" ? "cloned" : "jumped"} from ${coordinate(move.from)} to ${coordinate(move.to)}${flipped ? ` and flipped ${flipped} ${flipped === 1 ? "piece" : "pieces"}` : ""}.`;
  if (state.over) {
    const count = scores(state.board);
    message += ` ${state.winner === 0 ? "It's a draw!" : `${PLAYER_NAMES[state.winner]} wins!`} Fern ${count[1]}, Coral ${count[2]}.`;
  } else {
    if (state.passed) message += ` ${PLAYER_NAMES[state.passed]} has no legal moves and passes.`;
    message += ` ${PLAYER_NAMES[state.turn]}'s turn.`;
  }
  announcement.textContent = message;
}

document.querySelector("#undo").addEventListener("click", () => {
  if (!history.length) return;
  state = history.pop();
  selected = null;
  render();
  announcement.textContent = `Move undone. ${PLAYER_NAMES[state.turn]}'s turn.`;
});

function resetGame() {
  state = createGame();
  history.length = 0;
  selected = null;
  focused = 0;
  render();
  announcement.textContent = "A fresh start. Fern goes first.";
}

document.querySelector("#new-game").addEventListener("click", () => {
  if (history.length && !state.over) resetDialog.showModal();
  else resetGame();
});
document.querySelector("#cancel-reset").addEventListener("click", () => resetDialog.close());
document.querySelector("#confirm-reset").addEventListener("click", () => {
  resetGame();
  resetDialog.close();
});
document.querySelectorAll(".rules-trigger").forEach(button => {
  button.addEventListener("click", () => rulesDialog.showModal());
});
for (const dialog of [rulesDialog, resetDialog]) {
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
}

render();
