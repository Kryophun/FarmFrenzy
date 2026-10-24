export const SIZE = 7;
export const PLAYER_NAMES = { 1: "Fern", 2: "Coral" };

export function createGame() {
  const board = Array(SIZE * SIZE).fill(0);
  board[0] = board[48] = 1;
  board[6] = board[42] = 2;
  return { board, turn: 1, moves: 0, over: false, winner: null, passed: null, lastMove: null };
}

function distance(from, to) {
  return Math.max(
    Math.abs(Math.floor(from / SIZE) - Math.floor(to / SIZE)),
    Math.abs((from % SIZE) - (to % SIZE)),
  );
}

export function legalMoves(board, from) {
  if (!Number.isInteger(from) || from < 0 || from >= SIZE * SIZE || !board[from]) return [];
  return board.flatMap((piece, to) => !piece && distance(from, to) <= 2 ? [to] : []);
}

export function hasMove(board, player) {
  return board.some((piece, from) => piece === player && legalMoves(board, from).length > 0);
}

export function scores(board) {
  return { 1: board.filter(piece => piece === 1).length, 2: board.filter(piece => piece === 2).length };
}

export function moveType(from, to) {
  return distance(from, to) === 1 ? "clone" : "jump";
}

export function applyMove(state, from, to) {
  if (state.over || state.board[from] !== state.turn || !legalMoves(state.board, from).includes(to)) {
    throw new Error("That move is not allowed.");
  }
  const board = [...state.board];
  const type = moveType(from, to);
  if (type === "jump") board[from] = 0;
  board[to] = state.turn;
  const captured = [];
  board.forEach((piece, index) => {
    if (piece && piece !== state.turn && distance(index, to) === 1) {
      board[index] = state.turn;
      captured.push(index);
    }
  });

  const count = scores(board);
  const opponent = 3 - state.turn;
  const opponentCanMove = hasMove(board, opponent);
  const currentCanMove = hasMove(board, state.turn);
  const over = !count[1] || !count[2] || (!opponentCanMove && !currentCanMove);
  return {
    board,
    turn: opponentCanMove || over ? opponent : state.turn,
    moves: state.moves + 1,
    over,
    winner: over ? (count[1] === count[2] ? 0 : count[1] > count[2] ? 1 : 2) : null,
    passed: !over && !opponentCanMove ? opponent : null,
    lastMove: { from, to, type, player: state.turn, captured },
  };
}
