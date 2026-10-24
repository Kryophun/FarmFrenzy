import test from "node:test";
import assert from "node:assert/strict";
import { applyAutoFillWave, getAutoFillPlan } from "./auto-fill.js";
import { applyMove, createGame, legalMoves, moveType, scores } from "./game.js";
import type { Board, Cell, GameState } from "./game.js";

function position(board: Board): GameState {
  return { ...createGame(), board };
}

function settledPosition(): GameState {
  const board = Array<Cell>(49).fill(1);
  board[48] = 2;
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      board[row * 7 + column] = 0;
    }
  }
  return position(board);
}

await test("does not fill contested territory even when no capture is currently available", () => {
  const state = createGame();
  for (const player of [1, 2] as const) {
    state.board.forEach((piece, from) => {
      if (piece === player) {
        for (const to of legalMoves(state.board, from)) {
          assert.equal(applyMove({ ...state, turn: player }, from, to).lastMove.captured.length, 0);
        }
      }
    });
  }
  assert.equal(getAutoFillPlan(state), null);
});

await test("includes jump reach when deciding whether an empty square is contested", () => {
  const board = Array<Cell>(49).fill(1);
  board[48] = 2;
  board[32] = 0;
  assert.equal(getAutoFillPlan(position(board)), null);
});

await test("plans maximal simultaneous waves instead of cascading within a wave", () => {
  let state = settledPosition();
  const before = structuredClone(state);
  const waves = getAutoFillPlan(state);
  assert.ok(waves !== null);
  assert.deepEqual(state, before);
  assert.deepEqual(waves.map(wave => wave.length), [7, 5, 3, 1]);
  for (const wave of waves) {
    assert.equal(new Set(wave.map(clone => clone.from)).size, wave.length);
    const available = new Set(state.board.flatMap((piece, from) => piece === 1
      ? legalMoves(state.board, from).filter(to => moveType(from, to) === "clone") : []));
    assert.deepEqual(new Set(wave.map(clone => clone.to)), available);
    const previous = structuredClone(state);
    const original = state;
    state = applyAutoFillWave(state, wave);
    assert.deepEqual(original, previous);
    for (const clone of wave) {
      assert.equal(previous.board[clone.to], 0);
      assert.equal(previous.board[clone.from], clone.player);
      assert.equal(state.board[clone.from], clone.player);
    }
  }
  assert.equal(state.over, true);
  assert.equal(state.winner, 1);
  assert.deepEqual(scores(state.board), { 1: 48, 2: 1 });
  assert.equal(state.moves, 16);
});

await test("both players can clone in the same wave", () => {
  const board = Array<Cell>(49).fill(1);
  for (let index = 28; index < 49; index++) {
    board[index] = 2;
  }
  board[0] = board[48] = 0;
  const state = position(board);
  const plan = getAutoFillPlan(state);
  assert.ok(plan !== null);
  assert.equal(plan.length, 1);
  assert.deepEqual(new Set(plan[0].map(clone => clone.player)), new Set([1, 2]));
  assert.deepEqual(plan[0].map(clone => clone.to), [0, 48]);
  const next = applyAutoFillWave(state, plan[0]);
  assert.equal(next.over, true);
  assert.deepEqual(scores(next.board), { 1: 28, 2: 21 });
  assert.equal(next.moves, 2);
});

await test("reassigns clone sources to fill the maximum number of legal destinations", () => {
  const board: Board = [
    0, 1, 0, 1, 0, 1, 0,
    1, 1, 0, 0, 0, 0, 0,
    1, 1, 0, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 0, 1,
    1, 1, 0, 0, 1, 0, 1,
    1, 0, 1, 1, 1, 0, 0,
    1, 1, 0, 0, 0, 1, 0,
  ];
  const state: GameState = { ...position(board), over: true, winner: 1 };
  const plan = getAutoFillPlan(state);
  assert.ok(plan !== null);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].length, 21);
  assert.equal(new Set(plan[0].map(clone => clone.from)).size, 21);
  assert.equal(new Set(plan[0].map(clone => clone.to)).size, 21);
  assert.equal(applyAutoFillWave(state, plan[0]).board.includes(0), false);
});

await test("does not fill full boards or finished positions with both sides still present", () => {
  assert.equal(getAutoFillPlan({ ...settledPosition(), over: true, winner: 1 }), null);
  assert.equal(getAutoFillPlan(position(Array<Cell>(49).fill(1))), null);
});

for (const winner of [1, 2] as const) {
  await test(`fills an elimination win for Player ${winner} without reviving the losing side`, () => {
    const board = Array<Cell>(49).fill(0);
    board[0] = winner;
    let state: GameState = { ...position(board), over: true, winner };
    const original = structuredClone(state);
    const plan = getAutoFillPlan(state);
    assert.ok(plan !== null);
    assert.deepEqual(plan.slice(0, 3).map(wave => wave.length), [1, 2, 4]);
    assert.deepEqual(state, original);
    for (const wave of plan) {
      assert.equal(new Set(wave.map(clone => clone.from)).size, wave.length);
      assert.equal(new Set(wave.map(clone => clone.to)).size, wave.length);
      assert.ok(wave.length <= scores(state.board)[winner]);
      state = applyAutoFillWave(state, wave);
      assert.equal(state.over, true);
      assert.equal(state.winner, winner);
      assert.ok(state.board.every(piece => piece === 0 || piece === winner));
    }
    assert.equal(state.board.includes(0), false);
    assert.equal(scores(state.board)[winner], 49);
  });
}

await test("fills the reported 0-10 elimination position after its final jump", () => {
  const board = Array<Cell>(49).fill(0);
  for (const index of [6, 12, 16, 18, 24, 32, 42]) {
    board[index] = 2;
  }
  for (const index of [40, 47, 48]) {
    board[index] = 1;
  }
  const state = applyMove({ ...position(board), turn: 2, moves: 9 }, 32, 41);
  assert.equal(state.over, true);
  assert.deepEqual(scores(state.board), { 1: 0, 2: 10 });
  const plan = getAutoFillPlan(state);
  assert.ok(plan !== null);
  assert.equal(plan.flat().length, 39);
  let filled: GameState = state;
  for (const wave of plan) {
    filled = applyAutoFillWave(filled, wave);
  }
  assert.deepEqual(scores(filled.board), { 1: 0, 2: 49 });
  assert.equal(filled.winner, 2);
  assert.equal(filled.moves, 49);
});

await test("does not fill invalid finished positions without a surviving winner", () => {
  const empty = Array<Cell>(49).fill(0);
  assert.equal(getAutoFillPlan({ ...position(empty), over: true, winner: 1 }), null);
  const board = empty.slice();
  board[0] = 1;
  assert.equal(getAutoFillPlan({ ...position(board), over: true, winner: 2 }), null);
  assert.equal(getAutoFillPlan({ ...position(board), over: true, winner: 0 }), null);
});

await test("rejects captures, jumps, reused sources, duplicate destinations, and within-wave chain clones", () => {
  const state = settledPosition();
  for (const wave of [
    [{ from: 4, to: 2, player: 1 as const }],
    [{ from: 40, to: 32, player: 1 as const }],
    [{ from: 4, to: 3, player: 1 as const }, { from: 4, to: 10, player: 1 as const }],
    [{ from: 4, to: 3, player: 1 as const }, { from: 11, to: 3, player: 1 as const }],
    [{ from: 4, to: 3, player: 1 as const }, { from: 3, to: 2, player: 1 as const }],
  ]) {
    assert.throws(() => applyAutoFillWave(state, wave));
  }
  const capture = Array<Cell>(49).fill(0);
  capture[0] = 1;
  capture[9] = 2;
  assert.throws(() => applyAutoFillWave(position(capture), [{ from: 0, to: 8, player: 1 }]), /non-capturing/);
  assert.throws(() => applyAutoFillWave(state, []), /at least one clone/);
});
