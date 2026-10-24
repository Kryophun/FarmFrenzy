import test from "node:test";
import assert from "node:assert/strict";
import { chooseAiMove } from "./ai.js";
import type { AiProgress, Difficulty } from "./ai.js";
import { applyMove, createGame, legalMoves, scores } from "./game.js";
import type { Cell, GameState, Player } from "./game.js";

const difficulties: readonly Difficulty[] = ["easy", "medium", "hard"];

function position(board: Cell[], turn: Player = 1): GameState {
  return { ...createGame(), board, turn };
}

for (const difficulty of difficulties) {
  await test(`${difficulty} chooses legal moves for either player without mutating the game`, () => {
    for (const turn of [1, 2] as const) {
      const state = { ...createGame(), turn };
      const before = structuredClone(state);
      const move = chooseAiMove(state, difficulty, () => 0.5);
      assert.ok(move !== null);
      assert.equal(state.board[move.from], turn);
      assert.ok(legalMoves(state.board, move.from).includes(move.to));
      assert.deepEqual(state, before);
    }
  });

  await test(`${difficulty} returns no move for finished games or blocked players`, () => {
    assert.equal(chooseAiMove({ ...createGame(), over: true, winner: 1 }, difficulty), null);
    assert.equal(chooseAiMove(position(Array<Cell>(49).fill(2)), difficulty), null);
  });

  await test(`${difficulty} reports real legal candidates and the selected move without changing its decision`, () => {
    const state = createGame();
    const reports: AiProgress[] = [];
    const expected = chooseAiMove(state, difficulty, () => 0.25);
    const move = chooseAiMove(state, difficulty, () => 0.25, progress => { reports.push(progress); });
    assert.deepEqual(move, expected);
    const first = reports.at(0);
    const final = reports.at(-1);
    assert.ok(first !== undefined && final !== undefined);
    assert.equal(first.phase, "evaluating");
    assert.ok(first.candidates.every(candidate => candidate.score === null));
    assert.equal(final.phase, "complete");
    assert.equal(final.difficulty, difficulty);
    assert.deepEqual(final.bestMove, move);
    assert.equal(final.considering, null);
    for (const candidate of final.candidates) {
      assert.equal(state.board[candidate.move.from], state.turn);
      assert.ok(legalMoves(state.board, candidate.move.from).includes(candidate.move.to));
      if (difficulty === "easy") {
        assert.equal(candidate.score, null);
        assert.equal(candidate.bound, null);
      } else {
        assert.ok(candidate.score !== null && Number.isFinite(candidate.score));
        assert.ok(candidate.bound === "exact" || candidate.bound === "upper");
      }
    }
    assert.equal(final.depth, difficulty === "easy" ? 0 : difficulty === "medium" ? 1 : 3);
  });
}

await test("easy uses randomness to choose different legal moves", () => {
  const state = createGame();
  assert.notDeepEqual(chooseAiMove(state, "easy", () => 0), chooseAiMove(state, "easy", () => 0.999));
  for (const value of [-1, 1, NaN, Infinity]) {
    assert.throws(() => chooseAiMove(state, "easy", () => value), RangeError);
  }
});

await test("medium takes the strongest immediate material gain", () => {
  const board = Array<Cell>(49).fill(0);
  board[0] = board[48] = 1;
  board[9] = board[15] = board[16] = board[42] = 2;
  const state = position(board);
  const chosen = chooseAiMove(state, "medium");
  assert.ok(chosen !== null);
  const gain = (from: number, to: number): number => {
    const count = scores(applyMove(state, from, to).board);
    return count[1] - count[2];
  };
  const bestGain = Math.max(...state.board.flatMap((piece, from) =>
    piece === state.turn ? legalMoves(state.board, from).map(to => gain(from, to)) : [],
  ));
  assert.equal(gain(chosen.from, chosen.to), bestGain);
});

for (const difficulty of ["medium", "hard"] as const) {
  await test(`${difficulty} takes an immediate elimination win`, () => {
    const board = Array<Cell>(49).fill(0);
    board[0] = 1;
    board[9] = 2;
    const state = position(board);
    const move = chooseAiMove(state, difficulty);
    assert.ok(move !== null);
    const next = applyMove(state, move.from, move.to);
    assert.equal(next.over, true);
    assert.equal(next.winner, 1);
  });
}

await test("AI continues correctly when an opponent must pass", () => {
  const board = Array<Cell>(49).fill(1);
  board[0] = 2;
  board[47] = board[48] = 0;
  let state = position(board);
  const first = chooseAiMove(state, "hard");
  assert.ok(first !== null);
  state = applyMove(state, first.from, first.to);
  assert.equal(state.over, false);
  assert.equal(state.turn, 1);
  assert.equal(state.passed, 2);
  const second = chooseAiMove(state, "hard");
  assert.ok(second !== null);
  state = applyMove(state, second.from, second.to);
  assert.equal(state.over, true);
  assert.equal(state.winner, 1);
});

await test("hard looks past a greedy capture to avoid a stronger counterattack", () => {
  const state = position([
    2, 0, 1, 1, 0, 2, 0,
    2, 2, 2, 2, 0, 1, 2,
    1, 2, 1, 1, 0, 1, 0,
    1, 2, 2, 1, 1, 1, 0,
    1, 1, 2, 2, 2, 0, 0,
    1, 1, 0, 1, 2, 1, 1,
    0, 1, 2, 2, 2, 0, 0,
  ]);
  const medium = chooseAiMove(state, "medium");
  const reports: AiProgress[] = [];
  const hard = chooseAiMove(state, "hard", Math.random, progress => { reports.push(progress); });
  assert.ok(medium !== null && hard !== null);
  const final = reports.at(-1);
  assert.ok(final !== undefined);
  assert.equal(final.phase, "complete");
  assert.ok(final.candidates.every(candidate => candidate.score !== null));
  assert.ok(final.depth >= 1 && final.depth <= 3);
  assert.ok(final.nodes <= 6_000 + final.candidates.length);
  assert.deepEqual(final.bestMove, hard);
  const worstReply = (from: number, to: number): number => {
    const next = applyMove(state, from, to);
    assert.equal(next.turn, 2);
    return Math.min(...next.board.flatMap((piece, replyFrom) => piece === 2
      ? legalMoves(next.board, replyFrom).map(replyTo => {
        const count = scores(applyMove(next, replyFrom, replyTo).board);
        return count[1] - count[2];
      }) : [],
    ));
  };
  assert.ok(worstReply(hard.from, hard.to) > worstReply(medium.from, medium.to));
});

await test("a seeded AI-vs-AI match keeps moves valid and finishes", () => {
  let state = createGame();
  let seed = 42;
  const random = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let turn = 0; turn < 400 && !state.over; turn++) {
    const move = chooseAiMove(state, state.turn === 1 ? "easy" : "medium", random);
    assert.ok(move !== null);
    state = applyMove(state, move.from, move.to);
    assert.ok(state.board.every(piece => [0, 1, 2].includes(piece)));
  }
  assert.equal(state.over, true);
});
