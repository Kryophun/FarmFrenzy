import test from "node:test";
import assert from "node:assert/strict";
import { AI_SKILL_LEVELS, chooseAiMove, isSkillLevel, skillLabel } from "./ai.js";
import type { AiProgress, SkillLevel } from "./ai.js";
import { applyMove, createGame, legalMoves, scores } from "./game.js";
import type { Cell, GameState, Player } from "./game.js";

const tolerances: Record<SkillLevel, number> = { 1: Infinity, 2: 600, 3: 300, 4: 0, 5: 150, 6: 80, 7: 40, 8: 30, 9: 15, 10: 0 };

function seededRandom(): () => number {
  let seed = 42;
  return (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function position(board: Cell[], turn: Player = 1): GameState {
  return { ...createGame(), board, turn };
}

for (const skill of AI_SKILL_LEVELS) {
  await test(`level ${skill} chooses legal moves for either player without mutating the game`, () => {
    for (const turn of [1, 2] as const) {
      const state = { ...createGame(), turn };
      const before = structuredClone(state);
      const move = chooseAiMove(state, skill, () => 0.5);
      assert.ok(move !== null);
      assert.equal(state.board[move.from], turn);
      assert.ok(legalMoves(state.board, move.from).includes(move.to));
      assert.deepEqual(state, before);
    }
  });

  await test(`level ${skill} returns no move for finished games or blocked players`, () => {
    assert.equal(chooseAiMove({ ...createGame(), over: true, winner: 1 }, skill), null);
    assert.equal(chooseAiMove(position(Array<Cell>(49).fill(2)), skill), null);
  });

  await test(`level ${skill} reports the actual best and selected moves without changing its decision`, () => {
    const state = createGame();
    const reports: AiProgress[] = [];
    const expected = chooseAiMove(state, skill, () => 0.25);
    const move = chooseAiMove(state, skill, () => 0.25, progress => { reports.push(progress); });
    assert.ok(move !== null);
    assert.deepEqual(move, expected);
    const first = reports.at(0);
    const final = reports.at(-1);
    assert.ok(first !== undefined && final !== undefined);
    assert.equal(first.phase, "evaluating");
    assert.ok(first.candidates.every(candidate => candidate.score === null));
    assert.equal(final.phase, "complete");
    assert.equal(final.skill, skill);
    assert.deepEqual(final.selectedMove, move);
    assert.equal(final.considering, null);
    for (const candidate of final.candidates) {
      assert.equal(state.board[candidate.move.from], state.turn);
      assert.ok(legalMoves(state.board, candidate.move.from).includes(candidate.move.to));
      if (skill === 1) {
        assert.equal(candidate.score, null);
        assert.equal(candidate.bound, null);
      } else {
        assert.ok(candidate.score !== null && Number.isFinite(candidate.score));
        assert.ok(candidate.bound === "exact" || candidate.bound === "upper");
      }
    }
    assert.equal(final.depth, skill === 1 ? 0 : skill <= 4 ? 1 : skill <= 7 ? 2 : 3);
    assert.ok(final.nodes <= 6_000 + final.candidates.length);
    const selected = final.candidates.find(candidate => candidate.move.from === move.from && candidate.move.to === move.to);
    assert.ok(selected !== undefined);
    if (skill === 1) {
      assert.equal(final.bestMove, null);
    } else {
      assert.ok(final.bestMove !== null);
      const bestMove = final.bestMove;
      const best = final.candidates.find(candidate => candidate.move.from === bestMove.from && candidate.move.to === bestMove.to);
      assert.ok(best !== undefined);
      assert.ok(best.score !== null && selected.score !== null);
      assert.equal(selected.bound, "exact");
      assert.equal(best.bound, "exact");
      assert.ok(best.score - selected.score >= 0);
      assert.ok(best.score - selected.score <= tolerances[skill]);
    }
  });
}

await test("level 1 retains random legal play", () => {
  const state = createGame();
  assert.notDeepEqual(chooseAiMove(state, 1, () => 0), chooseAiMove(state, 1, () => 0.999));
  for (const value of [-1, 1, NaN, Infinity]) {
    assert.throws(() => chooseAiMove(state, 1, () => value), RangeError);
  }
});

await test("level 4 retains the old Medium's strongest immediate material gain", () => {
  const board = Array<Cell>(49).fill(0);
  board[0] = board[48] = 1;
  board[9] = board[15] = board[16] = board[42] = 2;
  const state = position(board);
  const chosen = chooseAiMove(state, 4);
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

for (const skill of AI_SKILL_LEVELS.filter(level => level !== 1)) {
  await test(`level ${skill} takes an immediate elimination win instead of a deliberate inaccuracy`, () => {
    const board = Array<Cell>(49).fill(0);
    board[0] = 1;
    board[9] = 2;
    const state = position(board);
    const move = chooseAiMove(state, skill);
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
  const first = chooseAiMove(state, 10);
  assert.ok(first !== null);
  state = applyMove(state, first.from, first.to);
  assert.equal(state.over, false);
  assert.equal(state.turn, 1);
  assert.equal(state.passed, 2);
  const second = chooseAiMove(state, 10);
  assert.ok(second !== null);
  state = applyMove(state, second.from, second.to);
  assert.equal(state.over, true);
  assert.equal(state.winner, 1);
});

await test("intermediate levels and level 10 look past a greedy counterattack", () => {
  const state = position([
    2, 0, 1, 1, 0, 2, 0,
    2, 2, 2, 2, 0, 1, 2,
    1, 2, 1, 1, 0, 1, 0,
    1, 2, 2, 1, 1, 1, 0,
    1, 1, 2, 2, 2, 0, 0,
    1, 1, 0, 1, 2, 1, 1,
    0, 1, 2, 2, 2, 0, 0,
  ]);
  const medium = chooseAiMove(state, 4);
  const reports: AiProgress[] = [];
  const hard = chooseAiMove(state, 10, Math.random, progress => { reports.push(progress); });
  assert.ok(medium !== null && hard !== null);
  const final = reports.at(-1);
  assert.ok(final !== undefined);
  assert.equal(final.phase, "complete");
  assert.ok(final.candidates.every(candidate => candidate.score !== null));
  assert.ok(final.depth >= 1 && final.depth <= 3);
  assert.ok(final.nodes <= 6_000 + final.candidates.length);
  assert.deepEqual(final.bestMove, hard);
  assert.deepEqual(final.selectedMove, hard);
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
  for (const skill of [5, 6, 7] as const) {
    const middleReports: AiProgress[] = [];
    const middle = chooseAiMove(state, skill, () => 0.999, progress => { middleReports.push(progress); });
    assert.ok(middle !== null);
    assert.equal(middleReports.at(-1)?.depth, 2);
    assert.ok(worstReply(middle.from, middle.to) > worstReply(medium.from, medium.to));
  }
  for (const skill of [5, 6, 7, 8, 9] as const) {
    const variedReports: AiProgress[] = [];
    const selected = chooseAiMove(state, skill, () => 0, progress => { variedReports.push(progress); });
    const finalReport = variedReports.at(-1);
    assert.ok(selected !== null && finalReport !== undefined);
    assert.ok(finalReport.candidates.some(candidate => candidate.bound === "upper"));
    const candidate = finalReport.candidates.find(value => value.move.from === selected.from && value.move.to === selected.to);
    assert.ok(candidate !== undefined);
    assert.equal(candidate.bound, "exact");
  }
});

await test("a seeded AI-vs-AI match keeps moves valid and finishes", () => {
  let state = createGame();
  const random = seededRandom();
  for (let turn = 0; turn < 400 && !state.over; turn++) {
    const move = chooseAiMove(state, state.turn === 1 ? 1 : 4, random);
    assert.ok(move !== null);
    state = applyMove(state, move.from, move.to);
    assert.ok(state.board.every(piece => [0, 1, 2].includes(piece)));
  }
  assert.equal(state.over, true);
});

await test("levels 4 and 10 stay best-move policies rather than adding randomness", () => {
  const noRandomness = (): number => { throw new Error("This level must not sample a move."); };
  assert.deepEqual(chooseAiMove(createGame(), 4, noRandomness), { from: 0, to: 1 });
  assert.deepEqual(chooseAiMove(createGame(), 10, noRandomness), { from: 0, to: 8 });
});

await test("casual levels vary move quality progressively rather than just changing labels", () => {
  const misses = (skill: SkillLevel): number => {
    const random = seededRandom();
    let count = 0;
    for (let sample = 0; sample < 100; sample++) {
      const state = createGame();
      const move = chooseAiMove(state, skill, random);
      assert.ok(move !== null);
      if (scores(applyMove(state, move.from, move.to).board)[1] < 3) {
        count++;
      }
    }
    return count;
  };
  const beginner = misses(2);
  const casual = misses(3);
  assert.ok(beginner > casual);
  assert.ok(casual > 0);
  assert.equal(misses(4), 0);
});

await test("strength values are validated and labeled without claiming Elo ratings", () => {
  for (const skill of AI_SKILL_LEVELS) {
    assert.equal(isSkillLevel(skill), true);
    assert.match(skillLabel(skill), new RegExp(`Level ${skill} · `));
  }
  for (const invalid of [0, 11, -1, 1.5, NaN, Infinity]) {
    assert.equal(isSkillLevel(invalid), false);
    assert.throws(() => {
      // @ts-expect-error Verify validation of malformed external worker values.
      chooseAiMove(createGame(), invalid);
    }, RangeError);
  }
  assert.match(skillLabel(6), /Intermediate/);
  assert.match(skillLabel(10), /Advanced/);
});
