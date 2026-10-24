import test from "node:test";
import assert from "node:assert/strict";
import { createGame, legalMoves, hasMove, scores, applyMove } from "./game.js";
import type { Board, Cell, GameState, Player } from "./game.js";

function position(board: Board, turn: Player = 1): GameState {
  return { ...createGame(), board, turn };
}

await test("starts with opposing corners and Player 1 to play", () => {
  const state = createGame();
  assert.equal(state.board.length, 49);
  assert.deepEqual(scores(state.board), { 1: 2, 2: 2 });
  assert.deepEqual([state.board[0], state.board[6], state.board[42], state.board[48]], [1, 2, 2, 1]);
  assert.equal(state.turn, 1);
  assert.equal(state.over, false);
});

await test("legal moves respect edges, distance, and occupied cells", () => {
  const state = createGame();
  assert.deepEqual(legalMoves(state.board, 0), [1, 2, 7, 8, 9, 14, 15, 16]);
  assert.deepEqual(legalMoves(state.board, 1), []);
  assert.deepEqual(legalMoves(state.board, -1), []);
  assert.deepEqual(legalMoves(state.board, 49), []);
  assert.deepEqual(legalMoves(state.board, 0.5), []);
  assert.ok(!legalMoves(state.board, 6).includes(7));
});

await test("an adjacent move clones without changing the previous state", () => {
  const original = createGame();
  const next = applyMove(original, 0, 8);
  assert.equal(next.board[0], 1);
  assert.equal(next.board[8], 1);
  assert.equal(original.board[8], 0);
  assert.deepEqual(scores(next.board), { 1: 3, 2: 2 });
  assert.equal(next.turn, 2);
  assert.equal(next.moves, 1);
  assert.equal(next.lastMove.type, "clone");
});

await test("two-square moves jump, including off-axis destinations", () => {
  for (const destination of [2, 9, 14, 15, 16]) {
    const next = applyMove(createGame(), 0, destination);
    assert.equal(next.board[0], 0);
    assert.equal(next.board[destination], 1);
    assert.deepEqual(scores(next.board), { 1: 2, 2: 2 });
    assert.equal(next.lastMove.type, "jump");
  }
});

await test("landing flips all eight neighbors, but does not chain infection", () => {
  const board = Array<Cell>(49).fill(0);
  board[0] = 1;
  for (const index of [8, 9, 10, 15, 17, 22, 23, 24, 25, 48]) {
    board[index] = 2;
  }
  const next = applyMove(position(board), 0, 16);
  assert.deepEqual(next.lastMove.captured, [8, 9, 10, 15, 17, 22, 23, 24]);
  for (const index of next.lastMove.captured) {
    assert.equal(next.board[index], 1);
  }
  assert.equal(next.board[25], 2);
});

await test("rejects wrong-player, occupied, distant, malformed, and finished moves", () => {
  const invalidMoves: [number, number][] = [[6, 5], [0, 48], [0, 3], [1, 2], [0, -1], [0, 49], [0, 1.5]];
  for (const [from, to] of invalidMoves) {
    assert.throws(() => applyMove(createGame(), from, to), /not allowed/);
  }
  assert.throws(() => {
    // @ts-expect-error Verify runtime rejection of malformed calls from JavaScript.
    applyMove(createGame(), undefined, 1);
  }, /not allowed/);
  assert.throws(() => applyMove({ ...createGame(), over: true, winner: 1 }, 0, 1), /not allowed/);
});

await test("a trapped opponent passes and the current player moves again", () => {
  const board = Array<Cell>(49).fill(1);
  board[0] = 2;
  board[47] = board[48] = 0;
  const next = applyMove(position(board), 46, 47);
  assert.equal(next.turn, 1);
  assert.equal(next.passed, 2);
  assert.equal(next.over, false);
  assert.equal(hasMove(next.board, 2), false);
  assert.equal(hasMove(next.board, 1), true);
});

await test("elimination ends the game even with empty squares", () => {
  const board = Array<Cell>(49).fill(0);
  board[0] = 1;
  board[9] = 2;
  const next = applyMove(position(board), 0, 8);
  assert.equal(next.over, true);
  assert.equal(next.winner, 1);
  assert.equal(next.passed, null);
});

await test("a full board ends the game and awards the majority", () => {
  const board = Array<Cell>(49).fill(2);
  board[0] = 1;
  board[1] = 0;
  const next = applyMove(position(board), 0, 1);
  assert.equal(next.over, true);
  assert.equal(next.winner, 2);
  assert.equal(next.board.includes(0), false);
});

await test("a full board can also be won by Player 1", () => {
  const board = Array<Cell>(49).fill(1);
  board[48] = 2;
  board[1] = 0;
  const next = applyMove(position(board), 0, 1);
  assert.equal(next.over, true);
  assert.equal(next.winner, 1);
});

await test("jumps can cross occupied cells", () => {
  const board = Array<Cell>(49).fill(0);
  board[0] = 1;
  board[1] = board[48] = 2;
  const next = applyMove(position(board), 0, 2);
  assert.equal(next.board[0], 0);
  assert.equal(next.board[2], 1);
  assert.equal(next.board[1], 1);
  assert.equal(next.board[48], 2);
});

await test("infection never wraps across a board edge", () => {
  const board = Array<Cell>(49).fill(0);
  board[5] = 1;
  board[7] = board[13] = board[48] = 2;
  const next = applyMove(position(board), 5, 6);
  assert.equal(next.board[7], 2);
  assert.equal(next.board[13], 1);
  assert.deepEqual(next.lastMove.captured, [13]);
});

await test("a complete deterministic match stays valid and terminates", () => {
  let state = createGame();
  for (let turn = 0; turn < 100 && !state.over; turn++) {
    const options = state.board.flatMap((piece, from) => piece === state.turn
      ? legalMoves(state.board, from).map(to => ({ from, to })) : []);
    const nextMove = options.find(({ from, to }) => Math.max(
      Math.abs(Math.floor(from / 7) - Math.floor(to / 7)), Math.abs(from % 7 - to % 7),
    ) === 1) ?? options.at(0);
    assert.ok(nextMove !== undefined);
    state = applyMove(state, nextMove.from, nextMove.to);
    assert.ok(state.board.every(piece => [0, 1, 2].includes(piece)));
    assert.ok(scores(state.board)[1] + scores(state.board)[2] <= 49);
  }
  assert.equal(state.over, true);
});
