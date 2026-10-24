import { SIZE, PLAYER_NAMES, createGame, legalMoves, moveType, scores, applyMove } from "./game.js";
import type { GameState, Move, Player } from "./game.js";

function getElement<T extends HTMLElement>(selector: string, elementType: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof elementType)) {
    throw new Error(`Missing or invalid game element: ${selector}`);
  }
  return element;
}

let state = createGame();
let selected: number | null = null;
let focused = 0;
const history: GameState[] = [];
const board = getElement("#board", HTMLDivElement);
const announcement = getElement("#announcement", HTMLParagraphElement);
const rulesDialog = getElement("#rules-dialog", HTMLDialogElement);
const resetDialog = getElement("#reset-dialog", HTMLDialogElement);
const cells: HTMLButtonElement[] = [];

function coordinate(index: number): string {
  return `${String.fromCharCode(65 + index % SIZE)}${Math.floor(index / SIZE) + 1}`;
}

for (let index = 0; index < SIZE * SIZE; index++) {
  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = "cell";
  cell.addEventListener("click", () => { selectCell(index); });
  cell.addEventListener("focus", () => {
    focused = index;
    cells.forEach((button, i) => { button.tabIndex = i === index ? 0 : -1; });
  });
  cell.addEventListener("keydown", event => {
    const row = Math.floor(index / SIZE);
    const column = index % SIZE;
    const targets: Partial<Record<string, number>> = {
      ArrowUp: ((row + SIZE - 1) % SIZE) * SIZE + column,
      ArrowDown: ((row + 1) % SIZE) * SIZE + column,
      ArrowLeft: row * SIZE + (column + SIZE - 1) % SIZE,
      ArrowRight: row * SIZE + (column + 1) % SIZE,
      Home: row * SIZE,
      End: row * SIZE + SIZE - 1,
    };
    const target = targets[event.key];
    if (target !== undefined) {
      event.preventDefault();
      cells[target].focus();
    }
    if (event.key === "Escape") {
      selected = null;
      render();
    }
  });
  cells.push(cell);
  board.append(cell);
}

function selectCell(index: number): void {
  if (state.over) {
    return;
  }
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
  const nextState = applyMove(state, selected, index);
  state = nextState;
  selected = null;
  render(true);
  announceMove(nextState.lastMove);
}

function render(animate = false): void {
  const destinations = selected === null ? [] : legalMoves(state.board, selected);
  cells.forEach((cell, index) => {
    const piece = state.board[index];
    const destinationType = selected !== null && destinations.includes(index) ? moveType(selected, index) : null;
    cell.className = "cell";
    cell.classList.toggle("selected", selected === index);
    if (destinationType) {
      cell.classList.add(`legal-${destinationType}`);
    }
    cell.classList.toggle("last-destination", state.lastMove?.to === index);
    if (animate && (state.lastMove?.to === index || state.lastMove?.captured.includes(index) === true)) {
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
    cell.setAttribute("aria-label", `${coordinate(index)}, ${piece ? PLAYER_NAMES[piece] : "empty"}${destinationType ? `, ${destinationType} available` : ""}`);
  });

  const count = scores(state.board);
  const players: readonly Player[] = [1, 2];
  for (const player of players) {
    getElement(`#score-${player}`, HTMLElement).textContent = String(count[player]);
    getElement(`#player-${player}`, HTMLElement).classList.toggle("active", !state.over && state.turn === player);
    getElement(`#player-${player}-status`, HTMLElement).textContent = state.over
      ? state.winner === 0 ? "Good game" : state.winner === player ? "The winner!" : "Well played"
      : state.turn === player ? "Your move" : state.passed === player ? "No moves - passed" : "Up next";
  }
  getElement("#fern-share", HTMLElement).style.width = `${count[1] / (count[1] + count[2]) * 100}%`;
  getElement("#coral-share", HTMLElement).style.width = `${count[2] / (count[1] + count[2]) * 100}%`;
  const turnLabel = getElement("#turn-label", HTMLDivElement);
  turnLabel.classList.toggle("coral", state.over ? state.winner === 2 : state.turn === 2);
  turnLabel.replaceChildren(document.createElement("span"), document.createTextNode(
    state.over ? state.winner === 0 ? "A perfectly matched rivalry." : `${PLAYER_NAMES[state.winner]} wins!`
      : `${PLAYER_NAMES[state.turn]}'s turn`,
  ));
  getElement("#move-counter", HTMLElement).textContent = `MOVE ${String(state.moves + (state.over ? 0 : 1)).padStart(2, "0")}`;
  getElement("#undo", HTMLButtonElement).disabled = !history.length;
  getElement("#selection-hint", HTMLElement).textContent = state.over
    ? "Good game. A rematch is only a click away."
    : selected === null ? `Pick a ${PLAYER_NAMES[state.turn]} piece to see your possibilities.`
      : destinations.length ? "Filled dots clone. Outlined dots jump. Your move."
        : "This piece is blocked. Try another of your pieces.";
}

function announceMove(move: Move): void {
  const flipped = move.captured.length;
  let message = `${PLAYER_NAMES[move.player]} ${move.type === "clone" ? "cloned" : "jumped"} from ${coordinate(move.from)} to ${coordinate(move.to)}${flipped ? ` and flipped ${flipped} ${flipped === 1 ? "piece" : "pieces"}` : ""}.`;
  if (state.over) {
    const count = scores(state.board);
    message += ` ${state.winner === 0 ? "It's a draw!" : `${PLAYER_NAMES[state.winner]} wins!`} Fern ${count[1]}, Coral ${count[2]}.`;
  } else {
    if (state.passed !== null) {
      message += ` ${PLAYER_NAMES[state.passed]} has no legal moves and passes.`;
    }
    message += ` ${PLAYER_NAMES[state.turn]}'s turn.`;
  }
  announcement.textContent = message;
}

getElement("#undo", HTMLButtonElement).addEventListener("click", () => {
  const previous = history.pop();
  if (!previous) {
    return;
  }
  state = previous;
  selected = null;
  render();
  announcement.textContent = `Move undone. ${PLAYER_NAMES[state.turn]}'s turn.`;
});

function resetGame(): void {
  state = createGame();
  history.length = 0;
  selected = null;
  focused = 0;
  render();
  announcement.textContent = "A fresh start. Fern goes first.";
}

getElement("#new-game", HTMLButtonElement).addEventListener("click", () => {
  if (history.length && !state.over) {
    resetDialog.showModal();
  } else {
    resetGame();
  }
});
getElement("#cancel-reset", HTMLButtonElement).addEventListener("click", () => { resetDialog.close(); });
getElement("#confirm-reset", HTMLButtonElement).addEventListener("click", () => {
  resetGame();
  resetDialog.close();
});
document.querySelectorAll(".rules-trigger").forEach(button => {
  button.addEventListener("click", () => { rulesDialog.showModal(); });
});
for (const dialog of [rulesDialog, resetDialog]) {
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) {
      return;
    }
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      dialog.close();
    }
  });
}

render();
