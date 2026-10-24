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

await test("leaves existing game-over conditions unchanged", () => {
  assert.equal(getAutoFillPlan({ ...settledPosition(), over: true, winner: 1 }), null);
  assert.equal(getAutoFillPlan(position(Array<Cell>(49).fill(1))), null);
});

await test("rejects captures, jumps, duplicate destinations, and within-wave chain clones", () => {
  const state = settledPosition();
  for (const wave of [
    [{ from: 4, to: 2, player: 1 as const }],
    [{ from: 40, to: 32, player: 1 as const }],
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
