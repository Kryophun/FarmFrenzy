import { SIZE, PLAYER_NAMES, createGame, legalMoves, moveType, scores, applyMove } from "./game.js";
import type { GameState, Move, Player } from "./game.js";

function getElement<T extends HTMLElement>(selector: string, elementType: new () => T): T {
  const element = document.querySelector(selector);
  if (!(element instanceof elementType)) {
    throw new Error(`Missing or invalid game element: ${selector}`);
  }
  return element;
}

interface PieceChoice {
  id: string;
  name: string;
  symbol: string;
}

const pieceChoices: readonly PieceChoice[] = [
  { id: "cow", name: "Cow", symbol: "🐮" },
  { id: "pig", name: "Pig", symbol: "🐷" },
  { id: "chicken", name: "Chicken", symbol: "🐔" },
  { id: "sheep", name: "Sheep", symbol: "🐑" },
  { id: "horse", name: "Horse", symbol: "🐴" },
  { id: "duck", name: "Duck", symbol: "🦆" },
];
const players: readonly Player[] = [1, 2];
const playerPieces: Record<Player, PieceChoice | null> = { 1: null, 2: null };
let matchStarted = false;
let state = createGame();
let selected: number | null = null;
let focused = 0;
const history: GameState[] = [];
const board = getElement("#board", HTMLDivElement);
const announcement = getElement("#announcement", HTMLParagraphElement);
const rulesDialog = getElement("#rules-dialog", HTMLDialogElement);
const resetDialog = getElement("#reset-dialog", HTMLDialogElement);
const pieceDialog = getElement("#piece-dialog", HTMLDialogElement);
const startGameButton = getElement("#start-game", HTMLButtonElement);
const cells: HTMLButtonElement[] = [];
const pieceInputs: { player: Player; choice: PieceChoice; input: HTMLInputElement; label: HTMLLabelElement }[] = [];

for (const player of players) {
  const options = getElement(`#piece-options-${player}`, HTMLDivElement);
  for (const choice of pieceChoices) {
    const label = document.createElement("label");
    label.className = "piece-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `piece-${player}`;
    input.value = choice.id;
    input.required = true;
    const symbol = document.createElement("span");
    symbol.className = "piece-option-symbol";
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = choice.symbol;
    const name = document.createElement("span");
    name.textContent = choice.name;
    label.append(input, symbol, name);
    options.append(label);
    pieceInputs.push({ player, choice, input, label });
    input.addEventListener("change", () => {
      playerPieces[player] = choice;
      updatePiecePicker();
    });
  }
}

function updatePiecePicker(): void {
  for (const { player, choice, input, label } of pieceInputs) {
    const opponent: Player = player === 1 ? 2 : 1;
    input.disabled = playerPieces[opponent]?.id === choice.id;
    input.checked = playerPieces[player]?.id === choice.id;
    label.classList.toggle("chosen", input.checked);
    label.classList.toggle("unavailable", input.disabled);
    label.title = input.disabled ? `${PLAYER_NAMES[opponent]} has chosen ${choice.name}` : choice.name;
  }
  const fern = playerPieces[1];
  const coral = playerPieces[2];
  startGameButton.disabled = fern === null || coral === null || fern.id === coral.id;
  getElement("#piece-picker-status", HTMLParagraphElement).textContent = fern !== null && coral !== null
    ? `Fern's ${fern.name} vs. Coral's ${coral.name}. Ready to grow?`
    : fern !== null ? "Coral, choose your farm friend."
      : coral !== null ? "Fern, choose your farm friend."
        : "Choose one farm friend for each player.";
}

getElement("#piece-form", HTMLFormElement).addEventListener("submit", event => {
  event.preventDefault();
  if (playerPieces[1] === null || playerPieces[2] === null || playerPieces[1].id === playerPieces[2].id) {
    getElement("#piece-picker-status", HTMLParagraphElement).textContent = "Choose a different farm friend for each player before starting.";
    return;
  }
  matchStarted = true;
  pieceDialog.close();
  render();
  announcement.textContent = `Fern's ${playerPieces[1].name} vs. Coral's ${playerPieces[2].name}. Fern goes first.`;
  cells[0].focus();
});
pieceDialog.addEventListener("cancel", event => { event.preventDefault(); });

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
  if (!matchStarted || state.over) {
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
      const choice = playerPieces[piece];
      if (choice !== null) {
        const symbol = document.createElement("span");
        symbol.className = "piece-symbol";
        symbol.textContent = choice.symbol;
        token.append(symbol);
        token.classList.add("has-symbol");
      }
      cell.append(token);
    }
    cell.tabIndex = index === focused ? 0 : -1;
    cell.setAttribute("aria-pressed", String(selected === index));
    const owner = piece ? `${PLAYER_NAMES[piece]}${playerPieces[piece] !== null ? ` (${playerPieces[piece].name})` : ""}` : "empty";
    cell.setAttribute("aria-label", `${coordinate(index)}, ${owner}${destinationType ? `, ${destinationType} available` : ""}`);
  });

  const count = scores(state.board);
  for (const player of players) {
    const choice = playerPieces[player];
    const avatar = getElement(`#player-${player}-avatar`, HTMLDivElement);
    if (choice !== null) {
      avatar.textContent = choice.symbol;
      avatar.title = choice.name;
    }
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
  getElement("#new-game", HTMLButtonElement).disabled = !matchStarted;
  getElement("#new-game-label", HTMLSpanElement).textContent = state.over ? "Play again" : "New game";
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
updatePiecePicker();
pieceDialog.showModal();
