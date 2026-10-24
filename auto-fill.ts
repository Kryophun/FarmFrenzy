import { applyMove, legalMoves, moveType, scores } from "./game.js";
import type { Board, GameState, Player } from "./game.js";

export interface AutoFillClone {
  from: number;
  to: number;
  player: Player;
}

export type AutoFillWave = AutoFillClone[];

function isFillablePosition(state: GameState): boolean {
  if (!state.board.includes(0)) {
    return false;
  }
  if (!state.over) {
    return true;
  }
  const count = scores(state.board);
  return (state.winner === 1 && count[1] > 0 && count[2] === 0)
    || (state.winner === 2 && count[2] > 0 && count[1] === 0);
}

function reachableEmptySquares(board: Board, player: Player, clonesOnly: boolean): Set<number> {
  const traversal = [...board];
  const queue = board.flatMap((piece, index) => piece === player ? [index] : []);
  const reached = new Set<number>();
  // The array iterator also visits newly reached squares appended below.
  for (const from of queue) {
    for (const to of legalMoves(traversal, from)) {
      if (clonesOnly && moveType(from, to) !== "clone") {
        continue;
      }
      traversal[to] = player;
      reached.add(to);
      queue.push(to);
    }
  }
  return reached;
}

function maximumCloneWave(board: Board, owners: readonly (Player | null)[]): AutoFillWave {
  const matched = new Map<number, AutoFillClone>();
  const assignDestination = (to: number, visited: Set<number>): boolean => {
    const player = owners[to];
    if (player === null) {
      throw new Error("Automatic fill found an empty square without an owner.");
    }
    for (const [from, piece] of board.entries()) {
      if (piece !== player || moveType(from, to) !== "clone" || visited.has(from)) {
        continue;
      }
      visited.add(from);
      const previous = matched.get(from);
      // Reassign earlier matches when needed to fit the maximum number of legal clones.
      if (previous === undefined || assignDestination(previous.to, visited)) {
        matched.set(from, { from, to, player });
        return true;
      }
    }
    return false;
  };
  board.forEach((piece, to) => {
    if (piece === 0) {
      assignDestination(to, new Set());
    }
  });
  return [...matched.values()].sort((a, b) => a.to - b.to);
}

export function getAutoFillPlan(state: GameState): AutoFillWave[] | null {
  if (!isFillablePosition(state)) {
    return null;
  }
  const reachable = {
    1: reachableEmptySquares(state.board, 1, false),
    2: reachableEmptySquares(state.board, 2, false),
  };
  const cloneReachable = {
    1: reachableEmptySquares(state.board, 1, true),
    2: reachableEmptySquares(state.board, 2, true),
  };
  const owners = state.board.map((piece, index): Player | null => {
    if (piece !== 0 || reachable[1].has(index) === reachable[2].has(index)) {
      return null;
    }
    return reachable[1].has(index) ? 1 : 2;
  });
  if (state.board.some((piece, index) => piece === 0
    && (owners[index] === null || !cloneReachable[owners[index]].has(index)))) {
    return null;
  }
  const board = [...state.board];
  const waves: AutoFillWave[] = [];
  while (board.includes(0)) {
    const wave = maximumCloneWave(board, owners);
    if (wave.length === 0) {
      throw new Error("Settled territory could not be filled by cloning.");
    }
    // Apply the whole wave together so a new clone cannot be a source until the next wave.
    for (const clone of wave) {
      board[clone.to] = clone.player;
    }
    waves.push(wave);
  }
  return waves;
}

export function applyAutoFillWave(state: GameState, wave: readonly AutoFillClone[]): GameState {
  if (!isFillablePosition(state) || wave.length === 0) {
    throw new Error("An automatic fill wave requires a fillable game and at least one clone.");
  }
  const playable: GameState = state.over ? { ...state, over: false, winner: null } : state;
  const board = [...state.board];
  const sources = new Set<number>();
  const destinations = new Set<number>();
  for (const clone of wave) {
    const verified = applyMove({ ...playable, turn: clone.player }, clone.from, clone.to);
    if (verified.lastMove.type !== "clone" || verified.lastMove.captured.length > 0
      || sources.has(clone.from) || destinations.has(clone.to)) {
      throw new Error("Automatic fill waves must be non-capturing clones with distinct sources and destinations.");
    }
    sources.add(clone.from);
    destinations.add(clone.to);
    board[clone.to] = clone.player;
  }
  const next = { ...state, board, moves: state.moves + wave.length, passed: null, lastMove: null };
  if (board.includes(0)) {
    if (state.over) {
      return { ...next, over: true, winner: state.winner };
    }
    return { ...next, over: false, winner: null };
  }
  const count = scores(board);
  return { ...next, over: true, winner: count[1] === count[2] ? 0 : count[1] > count[2] ? 1 : 2 };
}
