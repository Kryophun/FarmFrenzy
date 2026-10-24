export const SIZE = 7;
export type Player = 1 | 2;
export type Cell = 0 | Player;
export type Board = Cell[];
export type MoveType = "clone" | "jump";

export interface Move {
  from: number;
  to: number;
  type: MoveType;
  player: Player;
  captured: number[];
}

interface GamePosition {
  board: Board;
  turn: Player;
  moves: number;
  passed: Player | null;
  lastMove: Move | null;
}

export type GameState = GamePosition & (
  | { over: false; winner: null }
  | { over: true; winner: 0 | Player }
);

export function createGame(): GameState {
  const board = Array<Cell>(SIZE * SIZE).fill(0);
  board[0] = board[48] = 1;
  board[6] = board[42] = 2;
  return { board, turn: 1, moves: 0, over: false, winner: null, passed: null, lastMove: null };
}

function distance(from: number, to: number): number {
  return Math.max(
    Math.abs(Math.floor(from / SIZE) - Math.floor(to / SIZE)),
    Math.abs((from % SIZE) - (to % SIZE)),
  );
}

export function legalMoves(board: readonly Cell[], from: number): number[] {
  if (!Number.isInteger(from) || from < 0 || from >= SIZE * SIZE || !board[from]) {
    return [];
  }
  return board.flatMap((piece, to) => !piece && distance(from, to) <= 2 ? [to] : []);
}

export function hasMove(board: readonly Cell[], player: Player): boolean {
  return board.some((piece, from) => piece === player && legalMoves(board, from).length > 0);
}

export function scores(board: readonly Cell[]): Record<Player, number> {
  return { 1: board.filter(piece => piece === 1).length, 2: board.filter(piece => piece === 2).length };
}

export function moveType(from: number, to: number): MoveType {
  return distance(from, to) === 1 ? "clone" : "jump";
}

export function applyMove(state: GameState, from: number, to: number): GameState & { lastMove: Move } {
  if (state.over || state.board[from] !== state.turn || !legalMoves(state.board, from).includes(to)) {
    throw new Error("That move is not allowed.");
  }
  const board = [...state.board];
  const type = moveType(from, to);
  if (type === "jump") {
    board[from] = 0;
  }
  board[to] = state.turn;
  const captured: number[] = [];
  board.forEach((piece, index) => {
    if (piece && piece !== state.turn && distance(index, to) === 1) {
      board[index] = state.turn;
      captured.push(index);
    }
  });

  const count = scores(board);
  const opponent: Player = state.turn === 1 ? 2 : 1;
  const opponentCanMove = hasMove(board, opponent);
  const currentCanMove = hasMove(board, state.turn);
  const over = !count[1] || !count[2] || (!opponentCanMove && !currentCanMove);
  const next = {
    board,
    turn: opponentCanMove || over ? opponent : state.turn,
    moves: state.moves + 1,
    passed: !over && !opponentCanMove ? opponent : null,
    lastMove: { from, to, type, player: state.turn, captured },
  };
  if (over) {
    return { ...next, over: true, winner: count[1] === count[2] ? 0 : count[1] > count[2] ? 1 : 2 };
  }
  return { ...next, over: false, winner: null };
}
