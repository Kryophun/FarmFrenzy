import { SIZE, applyMove, legalMoves, moveType, scores } from "./game.js";
import type { GameState, Player } from "./game.js";

export type Difficulty = "easy" | "medium" | "hard";
export type PlayerType = "human" | Difficulty;

export const PLAYER_TYPE_LABELS: Record<PlayerType, string> = {
  human: "Human",
  easy: "Easy AI",
  medium: "Medium AI",
  hard: "Hard AI",
};

export interface AiMove {
  from: number;
  to: number;
}

export interface AiCandidate {
  move: AiMove;
  score: number | null;
  bound: "exact" | "upper" | null;
}

export interface AiProgress {
  difficulty: Difficulty;
  phase: "evaluating" | "complete";
  depth: number;
  nodes: number;
  candidates: AiCandidate[];
  considering: AiMove | null;
  bestMove: AiMove | null;
}

export interface AiRequest {
  state: GameState;
  difficulty: Difficulty;
}

export type AiResponse =
  | { type: "progress"; progress: AiProgress }
  | { type: "move"; move: AiMove | null }
  | { type: "error"; message: string };

function availableMoves(state: GameState): AiMove[] {
  const moves: AiMove[] = [];
  const cloneDestinations = new Set<number>();
  state.board.forEach((piece, from) => {
    if (piece !== state.turn) {
      return;
    }
    for (const to of legalMoves(state.board, from)) {
      if (moveType(from, to) === "clone") {
        if (cloneDestinations.has(to)) {
          continue;
        }
        cloneDestinations.add(to);
      }
      moves.push({ from, to });
    }
  });
  return moves;
}

function immediateGain(state: GameState, move: AiMove): number {
  let gain = moveType(move.from, move.to) === "clone" ? 1 : 0;
  const row = Math.floor(move.to / SIZE);
  const column = move.to % SIZE;
  for (let y = Math.max(0, row - 1); y <= Math.min(SIZE - 1, row + 1); y++) {
    for (let x = Math.max(0, column - 1); x <= Math.min(SIZE - 1, column + 1); x++) {
      const piece = state.board[y * SIZE + x];
      if (piece !== 0 && piece !== state.turn) {
        gain += 2;
      }
    }
  }
  return gain;
}

function orderedMoves(state: GameState): AiMove[] {
  return availableMoves(state)
    .map(move => ({ move, gain: immediateGain(state, move) }))
    .sort((a, b) => b.gain - a.gain)
    .map(({ move }) => move);
}

function evaluate(state: GameState, player: Player): number {
  const count = scores(state.board);
  const opponent: Player = player === 1 ? 2 : 1;
  const material = count[player] - count[opponent];
  if (state.over) {
    return state.winner === 0 ? 0 : (state.winner === player ? 100_000 : -100_000) + material;
  }
  const mobility: Record<Player, Set<number>> = { 1: new Set(), 2: new Set() };
  state.board.forEach((piece, from) => {
    if (piece !== 0) {
      for (const to of legalMoves(state.board, from)) {
        mobility[piece].add(to);
      }
    }
  });
  return material * 100 + (mobility[player].size - mobility[opponent].size) * 2;
}

interface SearchBudget {
  remaining: number;
}

function search(
  state: GameState,
  depth: number,
  player: Player,
  alpha: number,
  beta: number,
  budget: SearchBudget,
): number | null {
  if (depth === 0 || state.over) {
    return evaluate(state, player);
  }
  const maximizing = state.turn === player;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of orderedMoves(state)) {
    if (budget.remaining === 0) {
      return null;
    }
    budget.remaining--;
    const value = search(applyMove(state, move.from, move.to), depth - 1, player, alpha, beta, budget);
    if (value === null) {
      return null;
    }
    best = maximizing ? Math.max(best, value) : Math.min(best, value);
    if (maximizing) {
      alpha = Math.max(alpha, best);
    } else {
      beta = Math.min(beta, best);
    }
    if (alpha >= beta) {
      break;
    }
  }
  return best;
}

export function chooseAiMove(
  state: GameState,
  difficulty: Difficulty,
  random: () => number = Math.random,
  onProgress?: (progress: AiProgress) => void,
): AiMove | null {
  if (state.over) {
    return null;
  }
  const moves = orderedMoves(state);
  const first = moves.at(0);
  if (first === undefined) {
    return null;
  }
  const report = (
    candidates: AiCandidate[],
    depth: number,
    nodes: number,
    considering: AiMove | null,
    bestMove: AiMove | null,
    phase: AiProgress["phase"] = "evaluating",
  ): void => {
    onProgress?.({
      difficulty,
      phase,
      depth,
      nodes,
      candidates: candidates.map(candidate => ({ ...candidate, move: { ...candidate.move } })),
      considering: considering === null ? null : { ...considering },
      bestMove: bestMove === null ? null : { ...bestMove },
    });
  };
  const candidates: AiCandidate[] = moves.map(move => ({ move, score: null, bound: null }));
  if (difficulty === "easy") {
    report(candidates, 0, 0, null, null);
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError("The random source must return a number from 0 up to, but not including, 1.");
    }
    const choice = moves[Math.floor(sample * moves.length)];
    report(candidates, 0, 0, null, choice, "complete");
    return choice;
  }

  let bestMove = first;
  let bestValue = -Infinity;
  let evaluated = 0;
  report(candidates, 1, 0, null, null);
  for (const [index, move] of moves.entries()) {
    report(candidates, 1, evaluated, move, evaluated === 0 ? null : bestMove);
    const next = applyMove(state, move.from, move.to);
    const count = scores(next.board);
    const value = next.over ? evaluate(next, state.turn)
      : (count[state.turn] - count[state.turn === 1 ? 2 : 1]) * 100;
    candidates[index].score = value;
    candidates[index].bound = "exact";
    evaluated++;
    if (value > bestValue) {
      bestValue = value;
      bestMove = move;
    }
    report(candidates, 1, evaluated, null, bestMove);
  }
  if (difficulty === "medium") {
    report(candidates, 1, evaluated, null, bestMove, "complete");
    return bestMove;
  }

  const budget: SearchBudget = { remaining: 6_000 };
  let completedDepth = 1;
  let completedCandidates = candidates;
  for (let depth = 2; depth <= 3; depth++) {
    let iterationMove = bestMove;
    let iterationValue = -Infinity;
    let complete = true;
    const iterationCandidates: AiCandidate[] = moves.map(move => ({ move, score: null, bound: null }));
    report(iterationCandidates, depth, evaluated + 6_000 - budget.remaining, null, null);
    for (const [index, move] of moves.entries()) {
      if (budget.remaining === 0) {
        complete = false;
        break;
      }
      report(iterationCandidates, depth, evaluated + 6_000 - budget.remaining, move,
        iterationValue === -Infinity ? null : iterationMove);
      budget.remaining--;
      const value = search(applyMove(state, move.from, move.to), depth - 1, state.turn, iterationValue, Infinity, budget);
      if (value === null) {
        complete = false;
        break;
      }
      iterationCandidates[index].score = value;
      iterationCandidates[index].bound = value <= iterationValue ? "upper" : "exact";
      if (value > iterationValue) {
        iterationValue = value;
        iterationMove = move;
      }
      report(iterationCandidates, depth, evaluated + 6_000 - budget.remaining, null, iterationMove);
    }
    // Only use a completed depth so every root move gets the same search horizon.
    if (!complete) {
      break;
    }
    bestMove = iterationMove;
    completedDepth = depth;
    completedCandidates = iterationCandidates;
  }
  report(completedCandidates, completedDepth, evaluated + 6_000 - budget.remaining, null, bestMove, "complete");
  return bestMove;
}
