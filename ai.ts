import { SIZE, applyMove, legalMoves, moveType, scores } from "./game.js";
import type { GameState, Player } from "./game.js";

export type SkillLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export const AI_SKILL_LEVELS: readonly SkillLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export type PlayerType = "human" | "ai";

export const PLAYER_TYPE_LABELS: Record<PlayerType, string> = {
  human: "Human",
  ai: "AI",
};

interface SkillProfile {
  depth: number;
  nodes: number;
  variation: number;
  tolerance: number;
  temperature: number;
}

const profiles: Readonly<Record<SkillLevel, Readonly<SkillProfile>>> = {
  1: { depth: 0, nodes: 0, variation: 1, tolerance: 0, temperature: 0 },
  2: { depth: 1, nodes: 0, variation: 1, tolerance: 600, temperature: 200 },
  3: { depth: 1, nodes: 0, variation: 0.65, tolerance: 300, temperature: 100 },
  4: { depth: 1, nodes: 0, variation: 0, tolerance: 0, temperature: 0 },
  5: { depth: 2, nodes: 3_000, variation: 0.3, tolerance: 150, temperature: 75 },
  6: { depth: 2, nodes: 4_000, variation: 0.15, tolerance: 80, temperature: 40 },
  7: { depth: 2, nodes: 4_500, variation: 0.06, tolerance: 40, temperature: 20 },
  8: { depth: 3, nodes: 5_000, variation: 0.03, tolerance: 30, temperature: 15 },
  9: { depth: 3, nodes: 5_500, variation: 0.01, tolerance: 15, temperature: 8 },
  10: { depth: 3, nodes: 6_000, variation: 0, tolerance: 0, temperature: 0 },
};

export function isSkillLevel(value: number): value is SkillLevel {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}

export function skillLabel(skill: SkillLevel): string {
  const band = skill <= 2 ? "Beginner" : skill <= 4 ? "Casual" : skill <= 7 ? "Intermediate" : "Advanced";
  return `Level ${skill} · ${band}`;
}

export function skillDescription(skill: SkillLevel): string {
  if (skill === 1) {
    return "Random legal moves, like the previous Easy setting.";
  }
  if (skill <= 3) {
    return "Prefers immediate gains, with fewer mistakes at higher levels.";
  }
  if (skill === 4) {
    return "Best immediate gains, like the previous Medium setting.";
  }
  if (skill <= 7) {
    return "Looks up to two moves ahead, considering your reply. Higher levels are more accurate.";
  }
  return skill === 10 ? "Strongest play: up to three moves ahead, like the previous Hard setting."
    : "Looks up to three moves ahead, with fewer mistakes and more search at higher levels.";
}

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
  skill: SkillLevel;
  phase: "evaluating" | "complete";
  depth: number;
  nodes: number;
  candidates: AiCandidate[];
  considering: AiMove | null;
  bestMove: AiMove | null;
  selectedMove: AiMove | null;
}

export interface AiRequest {
  state: GameState;
  skill: SkillLevel;
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

function randomUnit(random: () => number): number {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError("The random source must return a number from 0 up to, but not including, 1.");
  }
  return sample;
}

function selectForSkill(
  candidates: AiCandidate[],
  bestMove: AiMove,
  profile: Readonly<SkillProfile>,
  completedDepth: number,
  random: () => number,
): AiMove {
  if (profile.variation === 0 || (profile.depth >= 2 && completedDepth < 2)) {
    return bestMove;
  }
  const best = candidates.find(candidate => candidate.move.from === bestMove.from && candidate.move.to === bestMove.to);
  if (best === undefined || best.score === null || best.bound !== "exact") {
    throw new Error("The best AI move must have an exact evaluation.");
  }
  const bestScore = best.score;
  const alternatives = candidates.flatMap(candidate => {
    const score = candidate.score;
    if (score === null || candidate.bound !== "exact" || score < bestScore - profile.tolerance
      || (candidate.move.from === bestMove.from && candidate.move.to === bestMove.to)) {
      return [];
    }
    return [{ move: candidate.move, weight: Math.exp((score - bestScore) / profile.temperature) }];
  });
  if (alternatives.length === 0 || randomUnit(random) >= profile.variation) {
    return bestMove;
  }
  const target = randomUnit(random) * alternatives.reduce((sum, candidate) => sum + candidate.weight, 0);
  let cumulative = 0;
  for (const candidate of alternatives) {
    cumulative += candidate.weight;
    if (target < cumulative) {
      return candidate.move;
    }
  }
  return alternatives[alternatives.length - 1].move;
}

export function chooseAiMove(
  state: GameState,
  skill: SkillLevel,
  random: () => number = Math.random,
  onProgress?: (progress: AiProgress) => void,
): AiMove | null {
  if (!isSkillLevel(skill)) {
    throw new RangeError("AI strength must be a whole-number level from 1 to 10.");
  }
  if (state.over) {
    return null;
  }
  const moves = orderedMoves(state);
  const first = moves.at(0);
  if (first === undefined) {
    return null;
  }
  const profile = profiles[skill];
  const report = (
    candidates: AiCandidate[],
    depth: number,
    nodes: number,
    considering: AiMove | null,
    bestMove: AiMove | null,
    phase: AiProgress["phase"] = "evaluating",
    selectedMove: AiMove | null = null,
  ): void => {
    onProgress?.({
      skill,
      phase,
      depth,
      nodes,
      candidates: candidates.map(candidate => ({ ...candidate, move: { ...candidate.move } })),
      considering: considering === null ? null : { ...considering },
      bestMove: bestMove === null ? null : { ...bestMove },
      selectedMove: selectedMove === null ? null : { ...selectedMove },
    });
  };
  const candidates: AiCandidate[] = moves.map(move => ({ move, score: null, bound: null }));
  if (skill === 1) {
    report(candidates, 0, 0, null, null);
    const choice = moves[Math.floor(randomUnit(random) * moves.length)];
    report(candidates, 0, 0, null, null, "complete", choice);
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
  if (profile.depth === 1) {
    const selected = selectForSkill(candidates, bestMove, profile, 1, random);
    report(candidates, 1, evaluated, null, bestMove, "complete", selected);
    return selected;
  }

  const budget: SearchBudget = { remaining: profile.nodes };
  let completedDepth = 1;
  let completedCandidates = candidates;
  for (let depth = 2; depth <= profile.depth; depth++) {
    let iterationMove = bestMove;
    let iterationValue = -Infinity;
    let complete = true;
    const iterationCandidates: AiCandidate[] = moves.map(move => ({ move, score: null, bound: null }));
    report(iterationCandidates, depth, evaluated + profile.nodes - budget.remaining, null, null);
    for (const [index, move] of moves.entries()) {
      if (budget.remaining === 0) {
        complete = false;
        break;
      }
      report(iterationCandidates, depth, evaluated + profile.nodes - budget.remaining, move,
        iterationValue === -Infinity ? null : iterationMove);
      budget.remaining--;
      // Keep near-best candidates exact for skill-limited selection; prune moves below that range.
      const alpha = iterationValue - profile.tolerance;
      const value = search(applyMove(state, move.from, move.to), depth - 1, state.turn, alpha, Infinity, budget);
      if (value === null) {
        complete = false;
        break;
      }
      iterationCandidates[index].score = value;
      iterationCandidates[index].bound = value <= alpha ? "upper" : "exact";
      if (value > iterationValue) {
        iterationValue = value;
        iterationMove = move;
      }
      report(iterationCandidates, depth, evaluated + profile.nodes - budget.remaining, null, iterationMove);
    }
    // Only use a completed depth so every root move gets the same search horizon.
    if (!complete) {
      break;
    }
    bestMove = iterationMove;
    completedDepth = depth;
    completedCandidates = iterationCandidates;
  }
  const selected = selectForSkill(completedCandidates, bestMove, profile, completedDepth, random);
  report(completedCandidates, completedDepth, evaluated + profile.nodes - budget.remaining, null, bestMove, "complete", selected);
  return selected;
}
