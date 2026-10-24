import test from "node:test";
import assert from "node:assert/strict";
import { createTussleSamples, TUSSLE_SOUND_DURATION } from "./sound.js";

function seededRandom(): () => number {
  let seed = 42;
  return (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

for (const sampleRate of [8_000, 44_100, 48_000]) {
  await test(`tussle sound is short, audible, bounded, and fades out at ${sampleRate} Hz`, () => {
    const samples = createTussleSamples(sampleRate, seededRandom());
    assert.equal(samples.length, Math.ceil(sampleRate * TUSSLE_SOUND_DURATION));
    assert.equal(samples[0], 0);
    assert.equal(samples.at(-1), 0);
    assert.ok(samples.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 0.65));
    const rms = (values: Float32Array): number =>
      Math.sqrt(values.reduce((sum, sample) => sum + sample * sample, 0) / values.length);
    assert.ok(rms(samples) > 0.01 && rms(samples) < 0.2);
    assert.ok(rms(samples.slice(-Math.floor(sampleRate * 0.02))) < rms(samples) * 0.5);
  });
}

await test("sound synthesis is repeatable with a seeded noise source", () => {
  assert.deepEqual(createTussleSamples(44_100, seededRandom()), createTussleSamples(44_100, seededRandom()));
});

await test("invalid sample rates are rejected explicitly", () => {
  for (const sampleRate of [0, -1, NaN, Infinity]) {
    assert.throws(() => createTussleSamples(sampleRate), RangeError);
  }
});
