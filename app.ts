import { SIZE, createGame, legalMoves, moveType, scores, applyMove } from "./game.js";
import type { GameState, Move, Player } from "./game.js";
import { PLAYER_TYPE_LABELS } from "./ai.js";
import type { AiCandidate, AiMove, AiProgress, AiRequest, AiResponse, PlayerType } from "./ai.js";

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
  defaultName: string;
}

interface AnimatedMove {
  move: Move;
  previousBoard: GameState["board"];
  ghost: HTMLElement;
  travel: Animation | null;
  split: Animation | null;
}

const pieceChoices: readonly PieceChoice[] = [
  { id: "cow", name: "Cow", symbol: "🐮", defaultName: "MooMoo" },
  { id: "pig", name: "Pig", symbol: "🐷", defaultName: "Oinkers" },
  { id: "chicken", name: "Chicken", symbol: "🐔", defaultName: "Cluckers" },
  { id: "sheep", name: "Sheep", symbol: "🐑", defaultName: "BaaBaa" },
  { id: "horse", name: "Horse", symbol: "🐴", defaultName: "NeighNeigh" },
  { id: "duck", name: "Duck", symbol: "🦆", defaultName: "Quackers" },
];
const players: readonly Player[] = [1, 2];
const playerPieces: Record<Player, PieceChoice | null> = { 1: null, 2: null };
const playerNames: Record<Player, string> = { 1: "Player 1", 2: "Player 2" };
const customizedNames = new Set<Player>();
const playerTypes: Record<Player, PlayerType> = { 1: "human", 2: "human" };
let aiPaused = false;
let aiError: string | null = null;
let aiTimer: number | null = null;
let aiWorker: Worker | null = null;
let thinkingPlayer: Player | null = null;
let latestAiProgress: AiProgress | null = null;
let activeMoveAnimation: AnimatedMove | null = null;
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
  const typeInput = getElement(`#player-${player}-type`, HTMLSelectElement);
  typeInput.addEventListener("change", () => {
    const value = typeInput.value;
    if (value !== "human" && value !== "easy" && value !== "medium" && value !== "hard") {
      throw new Error("Unknown player type.");
    }
    playerTypes[player] = value;
    render();
  });
  const nameInput = getElement(`#player-${player}-name`, HTMLInputElement);
  nameInput.addEventListener("input", () => {
    customizedNames.add(player);
    playerNames[player] = nameInput.value.trim();
    nameInput.setCustomValidity(playerNames[player].length === 0 ? "Enter a name that is not just spaces." : "");
    updatePiecePicker();
    render();
  });
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
      if (!customizedNames.has(player)) {
        playerNames[player] = choice.defaultName;
        nameInput.value = choice.defaultName;
      }
      updatePiecePicker();
      render();
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
    label.title = input.disabled ? `${playerNames[opponent]} has chosen ${choice.name}` : choice.name;
  }
  const fern = playerPieces[1];
  const coral = playerPieces[2];
  const missingName = players.find(player => playerNames[player].length === 0);
  startGameButton.disabled = missingName !== undefined || fern === null || coral === null || fern.id === coral.id;
  getElement("#piece-picker-status", HTMLParagraphElement).textContent = missingName !== undefined
    ? `Enter a name for Player ${missingName}.`
    : fern !== null && coral !== null
      ? `${playerNames[1]}'s ${fern.name} vs. ${playerNames[2]}'s ${coral.name}. Ready to grow?`
    : fern !== null ? `${playerNames[2]}, choose your farm friend.`
      : coral !== null ? `${playerNames[1]}, choose your farm friend.`
        : "Choose one farm friend for each player.";
}

getElement("#piece-form", HTMLFormElement).addEventListener("submit", event => {
  event.preventDefault();
  if (playerPieces[1] === null || playerPieces[2] === null || playerPieces[1].id === playerPieces[2].id) {
    getElement("#piece-picker-status", HTMLParagraphElement).textContent = "Choose a different farm friend for each player before starting.";
    return;
  }
  if (!getElement("#piece-form", HTMLFormElement).reportValidity()) {
    return;
  }
  matchStarted = true;
  pieceDialog.close();
  render();
  announcement.textContent = `${playerNames[1]}'s ${playerPieces[1].name} vs. ${playerNames[2]}'s ${playerPieces[2].name}. ${playerNames[1]} goes first.`;
  cells[0].focus();
  scheduleAi();
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
  if (!matchStarted || state.over || activeMoveAnimation !== null || playerTypes[state.turn] !== "human") {
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
      ? `Choose one of ${playerNames[state.turn]}'s pieces first.`
      : "That square is not available. Choose a highlighted square.";
    return;
  }
  playMove(selected, index);
}

function playMove(from: number, to: number): void {
  const nextState = applyMove(state, from, to);
  const origin = cells[from].getBoundingClientRect();
  const destination = cells[to].getBoundingClientRect();
  const area = board.getBoundingClientRect();
  const ghost = cells[from].querySelector<HTMLElement>(".piece");
  if (ghost === null) {
    throw new Error("The moving piece is missing from the board.");
  }
  const motion: AnimatedMove | null = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? null : {
    move: nextState.lastMove,
    previousBoard: state.board,
    ghost,
    travel: null,
    split: null,
  };
  history.push(state);
  state = nextState;
  selected = null;
  activeMoveAnimation = motion;
  render(true);
  if (motion === null) {
    announceMove(nextState.lastMove);
    scheduleAi();
    return;
  }
  const cloning = motion.move.type === "clone";
  const duration = cloning ? 300 : 380;
  const dx = destination.left - origin.left;
  const dy = destination.top - origin.top;
  const arc = Math.min(28, origin.height * (cloning ? 0.2 : 0.45));
  ghost.classList.add("move-ghost");
  ghost.style.left = `${origin.left - area.left + origin.width * 0.12}px`;
  ghost.style.top = `${origin.top - area.top + origin.height * 0.12}px`;
  ghost.style.width = `${origin.width * 0.76}px`;
  ghost.style.height = `${origin.height * 0.76}px`;
  board.append(ghost);
  if (cloning) {
    motion.split = cells[from].querySelector<HTMLElement>(".piece")?.animate([
      { transform: "scale(1)" },
      { transform: "scale(1.15, 0.87)", offset: 0.35 },
      { transform: "scale(1)" },
    ], { duration, easing: "ease-in-out" }) ?? null;
  }
  motion.travel = ghost.animate([
    { transform: "translate(0, 0) scale(0.9)", opacity: cloning ? 0.65 : 1 },
    { transform: `translate(${dx / 2}px, ${dy / 2 - arc}px) scale(1.08)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1 },
  ], { duration, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)", fill: "forwards" });
  motion.travel.onfinish = (): void => {
    if (activeMoveAnimation !== motion) {
      return;
    }
    cancelMoveAnimation();
    scheduleAi();
  };
  announcement.textContent = `${playerNames[motion.move.player]} is ${cloning ? "cloning" : "jumping"} from ${coordinate(from)} to ${coordinate(to)}.`;
}

function cancelMoveAnimation(): void {
  const motion = activeMoveAnimation;
  if (motion === null) {
    return;
  }
  activeMoveAnimation = null;
  motion.travel?.cancel();
  motion.split?.cancel();
  motion.ghost.remove();
  render(true);
  announceMove(motion.move);
}

function cancelAi(): void {
  if (aiTimer !== null) {
    window.clearTimeout(aiTimer);
    aiTimer = null;
  }
  aiWorker?.terminate();
  aiWorker = null;
  board.setAttribute("aria-busy", String(activeMoveAnimation !== null));
  renderAiThinking();
}

function showAiError(message: string): void {
  cancelAi();
  aiPaused = true;
  aiError = message;
  console.error("AI turn stopped:", message);
  render();
  announcement.textContent = `${playerNames[state.turn]}'s AI stopped: ${message} Retry AI, undo, or start a new game.`;
}

function scheduleAi(): void {
  cancelAi();
  const difficulty = playerTypes[state.turn];
  if (!matchStarted || state.over || activeMoveAnimation !== null || difficulty === "human" || aiPaused || aiError !== null
    || pieceDialog.open || rulesDialog.open || resetDialog.open) {
    return;
  }
  board.setAttribute("aria-busy", "true");
  thinkingPlayer = state.turn;
  latestAiProgress = null;
  aiTimer = window.setTimeout(() => {
    aiTimer = null;
    try {
      const worker = new Worker(new URL("./ai-worker.js", import.meta.url), { type: "module" });
      aiWorker = worker;
      worker.onmessage = (event: MessageEvent<AiResponse>): void => {
        if (aiWorker !== worker) {
          return;
        }
        const response = event.data;
        if (response.type === "progress") {
          latestAiProgress = response.progress;
          renderAiThinking();
          return;
        }
        cancelAi();
        if (response.type === "error") {
          showAiError(response.message);
          return;
        }
        if (response.move === null) {
          showAiError("No legal move was returned for this turn.");
          return;
        }
        try {
          playMove(response.move.from, response.move.to);
        } catch (error) {
          showAiError(error instanceof Error ? error.message : "The AI returned an invalid move.");
        }
      };
      worker.onerror = (event): void => {
        event.preventDefault();
        if (aiWorker === worker) {
          showAiError(event.message || "The AI worker could not be loaded.");
        }
      };
      worker.onmessageerror = (): void => {
        if (aiWorker === worker) {
          showAiError("The AI response could not be read.");
        }
      };
      const request: AiRequest = { state, difficulty };
      worker.postMessage(request);
    } catch (error) {
      showAiError(error instanceof Error ? error.message : "The AI worker could not be started.");
    }
  }, 450);
  renderAiThinking();
}

function moveLabel(move: AiMove): string {
  return `${coordinate(move.from)} → ${coordinate(move.to)}`;
}

function sameMove(first: AiMove, second: AiMove | null): boolean {
  return second !== null && first.from === second.from && first.to === second.to;
}

function evaluationLabel(candidate: AiCandidate): string {
  if (candidate.score === null) {
    return "Not scored";
  }
  const bound = candidate.bound === "upper" ? "≤ " : "";
  if (candidate.score >= 99_900) {
    return `${bound}Winning`;
  }
  if (candidate.score <= -99_900) {
    return `${bound}Losing`;
  }
  return `${bound}${candidate.score > 0 ? "+" : ""}${(candidate.score / 100).toFixed(2)}`;
}

function renderAiThinking(): void {
  const hasAi = players.some(player => playerTypes[player] !== "human");
  getElement("#thinking-toggle", HTMLLabelElement).hidden = !matchStarted || !hasAi;
  const panel = getElement("#ai-thinking", HTMLElement);
  panel.hidden = !matchStarted || !hasAi || !getElement("#show-ai-thinking", HTMLInputElement).checked;
  if (panel.hidden) {
    return;
  }
  const progress = latestAiProgress;
  const active = aiWorker !== null || aiTimer !== null;
  const description = thinkingPlayer === null ? "AI analysis will appear on the next AI turn."
    : `${playerNames[thinkingPlayer]} · ${PLAYER_TYPE_LABELS[playerTypes[thinkingPlayer]]} · ${
      aiError !== null ? "Stopped" : progress?.phase === "complete" ? "Move selected"
        : active ? "Thinking..." : "Analysis paused"}`;
  getElement("#ai-thinking-summary", HTMLParagraphElement).textContent = description;
  getElement("#ai-thinking-depth", HTMLSpanElement).textContent = progress === null ? ""
    : progress.difficulty === "easy" ? `${progress.candidates.length} legal moves · random choice`
      : `Depth ${progress.depth} · ${progress.candidates.filter(candidate => candidate.score !== null).length}/${progress.candidates.length} candidates evaluated · ${progress.nodes} positions visited`;
  getElement("#ai-thinking-current", HTMLParagraphElement).textContent = progress?.considering !== null && progress?.considering !== undefined
    ? `Considering: ${moveLabel(progress.considering)}`
    : active && progress?.phase !== "complete" ? "Evaluating candidate moves..." : "";
  getElement("#ai-thinking-best", HTMLParagraphElement).textContent = progress?.bestMove !== null && progress?.bestMove !== undefined
    ? `${progress.phase === "complete" ? "Selected" : "Best so far"}: ${moveLabel(progress.bestMove)}`
    : "No move selected yet.";
  const rows = progress?.candidates.map(candidate => {
    const row = document.createElement("tr");
    const best = sameMove(candidate.move, progress.bestMove);
    const current = sameMove(candidate.move, progress.considering);
    row.classList.toggle("best-candidate", best);
    row.classList.toggle("current-candidate", current);
    const moveCell = document.createElement("td");
    moveCell.textContent = `${moveLabel(candidate.move)} (${moveType(candidate.move.from, candidate.move.to)})`;
    const scoreCell = document.createElement("td");
    scoreCell.textContent = evaluationLabel(candidate);
    const statusCell = document.createElement("td");
    statusCell.textContent = current ? "Considering" : best
      ? progress.phase === "complete" ? "Selected" : "Best so far"
      : candidate.score !== null ? "Evaluated" : progress.phase === "complete" ? "Not scored" : "Pending";
    row.append(moveCell, scoreCell, statusCell);
    return row;
  }) ?? [];
  getElement("#ai-thinking-candidates", HTMLTableSectionElement).replaceChildren(...rows);
}

function render(animate = false): void {
  const destinations = selected === null ? [] : legalMoves(state.board, selected);
  cells.forEach((cell, index) => {
    const piece = state.board[index];
    const visiblePiece = activeMoveAnimation?.move.to === index ? 0
      : activeMoveAnimation?.move.captured.includes(index) === true
        ? activeMoveAnimation.previousBoard[index] : piece;
    const destinationType = selected !== null && destinations.includes(index) ? moveType(selected, index) : null;
    cell.className = "cell";
    cell.classList.toggle("selected", selected === index);
    if (destinationType) {
      cell.classList.add(`legal-${destinationType}`);
    }
    cell.classList.toggle("last-destination", state.lastMove?.to === index);
    if (animate && activeMoveAnimation === null
      && (state.lastMove?.to === index || state.lastMove?.captured.includes(index) === true)) {
      cell.classList.add("just-moved");
    }
    cell.replaceChildren();
    if (visiblePiece) {
      const token = document.createElement("span");
      token.className = `piece ${visiblePiece === 1 ? "fern" : "coral"}-piece`;
      token.setAttribute("aria-hidden", "true");
      const choice = playerPieces[visiblePiece];
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
    cell.setAttribute("aria-disabled", String(!matchStarted || state.over || activeMoveAnimation !== null || playerTypes[state.turn] !== "human"));
    const owner = piece ? `${playerNames[piece]}${playerPieces[piece] !== null ? ` (${playerPieces[piece].name})` : ""}` : "empty";
    cell.setAttribute("aria-label", `${coordinate(index)}, ${owner}${destinationType ? `, ${destinationType} available` : ""}`);
  });

  const count = scores(activeMoveAnimation?.previousBoard ?? state.board);
  for (const player of players) {
    const displayName = getElement(`#player-${player}-display-name`, HTMLSpanElement);
    displayName.textContent = playerNames[player];
    displayName.title = playerNames[player];
    const choice = playerPieces[player];
    const avatar = getElement(`#player-${player}-avatar`, HTMLDivElement);
    if (choice !== null) {
      avatar.textContent = choice.symbol;
      avatar.title = choice.name;
    }
    getElement(`#score-${player}`, HTMLElement).textContent = String(count[player]);
    getElement(`#player-${player}`, HTMLElement).classList.toggle("active", !state.over && state.turn === player);
    getElement(`#player-${player}-status`, HTMLElement).textContent = activeMoveAnimation !== null
      ? activeMoveAnimation.move.player === player
        ? activeMoveAnimation.move.type === "clone" ? "Cloning..." : "Jumping..." : "Up next"
      : state.over
      ? state.winner === 0 ? "Good game" : state.winner === player ? "The winner!" : "Well played"
      : state.turn === player
        ? playerTypes[player] === "human" ? "Your move"
          : aiError !== null ? "AI stopped" : aiPaused ? "AI paused" : "Thinking..."
        : state.passed === player ? "No moves - passed" : "Up next";
    getElement(`#player-${player}-controller`, HTMLSpanElement).textContent = PLAYER_TYPE_LABELS[playerTypes[player]];
  }
  getElement("#fern-share", HTMLElement).style.width = `${count[1] / (count[1] + count[2]) * 100}%`;
  getElement("#coral-share", HTMLElement).style.width = `${count[2] / (count[1] + count[2]) * 100}%`;
  const turnLabel = getElement("#turn-label", HTMLDivElement);
  turnLabel.classList.toggle("coral", activeMoveAnimation !== null ? activeMoveAnimation.move.player === 2
    : state.over ? state.winner === 2 : state.turn === 2);
  turnLabel.replaceChildren(document.createElement("span"), document.createTextNode(
    activeMoveAnimation !== null
      ? `${playerNames[activeMoveAnimation.move.player]} is ${activeMoveAnimation.move.type === "clone" ? "cloning" : "jumping"}...`
    : state.over ? state.winner === 0 ? "A perfectly matched rivalry." : `${playerNames[state.winner]} wins!`
      : playerTypes[state.turn] === "human" ? `${playerNames[state.turn]}'s turn`
        : `${playerNames[state.turn]}${aiError !== null ? "'s AI stopped" : aiPaused ? "'s AI is paused" : " is thinking..."}`,
  ));
  getElement("#move-counter", HTMLElement).textContent = `MOVE ${String(state.moves + (state.over ? 0 : 1)).padStart(2, "0")}`;
  getElement("#undo", HTMLButtonElement).disabled = !history.length;
  getElement("#new-game", HTMLButtonElement).disabled = !matchStarted;
  getElement("#new-game-label", HTMLSpanElement).textContent = state.over ? "Play again" : "New game";
  const hasAi = players.some(player => playerTypes[player] !== "human");
  const pauseButton = getElement("#toggle-ai", HTMLButtonElement);
  pauseButton.hidden = !matchStarted || !hasAi || state.over || aiError !== null;
  pauseButton.textContent = aiPaused ? "Resume AI" : "Pause AI";
  pauseButton.setAttribute("aria-pressed", String(aiPaused));
  getElement("#retry-ai", HTMLButtonElement).hidden = aiError === null;
  const humanCount = players.filter(player => playerTypes[player] === "human").length;
  getElement("#game-mode", HTMLSpanElement).textContent = humanCount === 2 ? "LOCAL 2P" : humanCount === 1 ? "VS AI" : "AI VS AI";
  getElement("#footer-description", HTMLSpanElement).textContent = humanCount === 2
    ? "Two humans. One board. A friendly rivalry."
    : humanCount === 1 ? "One human. One AI. A friendly rivalry." : "Two AIs. One board. Watch them grow.";
  getElement("#rules-first-player", HTMLSpanElement).textContent = playerNames[1];
  getElement("#selection-hint", HTMLElement).textContent = activeMoveAnimation !== null
    ? "A little takeover in motion."
    : state.over
    ? "Good game. A rematch is only a click away."
    : playerTypes[state.turn] !== "human"
      ? aiError !== null ? "AI stopped. Retry, undo, or start a new game."
        : aiPaused ? "AI is paused. Resume when you're ready." : `${PLAYER_TYPE_LABELS[playerTypes[state.turn]]} is choosing a move.`
    : selected === null ? `Pick a ${playerNames[state.turn]} piece to see your possibilities.`
      : destinations.length ? "Filled dots clone. Outlined dots jump. Your move."
        : "This piece is blocked. Try another of your pieces.";
  board.setAttribute("aria-busy", String(activeMoveAnimation !== null || aiWorker !== null || aiTimer !== null));
  renderAiThinking();
}

function announceMove(move: Move): void {
  const flipped = move.captured.length;
  let message = `${playerNames[move.player]} ${move.type === "clone" ? "cloned" : "jumped"} from ${coordinate(move.from)} to ${coordinate(move.to)}${flipped ? ` and flipped ${flipped} ${flipped === 1 ? "piece" : "pieces"}` : ""}.`;
  if (state.over) {
    const count = scores(state.board);
    message += ` ${state.winner === 0 ? "It's a draw!" : `${playerNames[state.winner]} wins!`} ${playerNames[1]} ${count[1]}, ${playerNames[2]} ${count[2]}.`;
  } else {
    if (state.passed !== null) {
      message += ` ${playerNames[state.passed]} has no legal moves and passes.`;
    }
    message += ` ${playerNames[state.turn]}'s turn.`;
  }
  announcement.textContent = message;
}

getElement("#undo", HTMLButtonElement).addEventListener("click", () => {
  let previous = history.pop();
  if (!previous) {
    return;
  }
  cancelAi();
  cancelMoveAnimation();
  if (players.filter(player => playerTypes[player] === "human").length === 1) {
    while (playerTypes[previous.turn] !== "human" && history.length > 0) {
      const earlier = history.pop();
      if (earlier === undefined) {
        throw new Error("Move history is inconsistent.");
      }
      previous = earlier;
    }
  }
  state = previous;
  thinkingPlayer = null;
  latestAiProgress = null;
  selected = null;
  aiError = null;
  aiPaused = playerTypes[state.turn] !== "human";
  render();
  announcement.textContent = `Move undone. ${playerNames[state.turn]}'s turn.${aiPaused ? " AI is paused; resume when ready." : ""}`;
  scheduleAi();
});

function openPlayerChoice(): void {
  matchStarted = false;
  cancelAi();
  cancelMoveAnimation();
  state = createGame();
  thinkingPlayer = null;
  latestAiProgress = null;
  history.length = 0;
  selected = null;
  focused = 0;
  aiError = null;
  aiPaused = false;
  render();
  updatePiecePicker();
  announcement.textContent = "Review your players, names, and pieces to start a new game.";
  pieceDialog.showModal();
}

getElement("#new-game", HTMLButtonElement).addEventListener("click", () => {
  cancelAi();
  cancelMoveAnimation();
  if (history.length && !state.over) {
    resetDialog.showModal();
  } else {
    openPlayerChoice();
  }
});
getElement("#cancel-reset", HTMLButtonElement).addEventListener("click", () => { resetDialog.close(); });
getElement("#confirm-reset", HTMLButtonElement).addEventListener("click", () => {
  resetDialog.close();
  openPlayerChoice();
});
document.querySelectorAll(".rules-trigger").forEach(button => {
  button.addEventListener("click", () => {
    cancelAi();
    cancelMoveAnimation();
    rulesDialog.showModal();
  });
});
for (const dialog of [rulesDialog, resetDialog]) {
  dialog.addEventListener("close", () => {
    render();
    scheduleAi();
  });
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

getElement("#toggle-ai", HTMLButtonElement).addEventListener("click", () => {
  cancelMoveAnimation();
  aiPaused = !aiPaused;
  render();
  scheduleAi();
  announcement.textContent = aiPaused ? "AI paused. Take your time." : "AI resumed.";
});
getElement("#retry-ai", HTMLButtonElement).addEventListener("click", () => {
  aiError = null;
  aiPaused = false;
  render();
  scheduleAi();
  announcement.textContent = `Retrying ${playerNames[state.turn]}'s AI turn.`;
});
getElement("#show-ai-thinking", HTMLInputElement).addEventListener("change", renderAiThinking);

render();
updatePiecePicker();
pieceDialog.showModal();
