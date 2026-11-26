"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseCSV, analyze, compare } = require("../src/analysis.js");
const demo = require("../src/demo.js");

test("reads UTF-8 BOM, quoted fields, CRLF and extra columns", () => {
  const { frames, inputFPS } = parseCSV('\uFEFF"FPS","Frame Time (ms)",Label\r\n60,16.667,"A, ""B"""\r\n50,20,"C"\r\n');
  assert.deepEqual(frames, [16.667, 20]);
  assert.equal(inputFPS, 55);
});

test("reads semicolon-delimited decimal comma and tab-delimited data", () => {
  assert.deepEqual(parseCSV("FPS;Frame time (ms)\n60,3;16,584").frames, [16.584]);
  assert.deepEqual(parseCSV("FPS\tFrameTimeMs\n60\t16.667").frames, [16.667]);
});

test("reads a single PresentMon-style stream and omits its leading zero", () => {
  const result = parseCSV("Application,ProcessID,SwapChainAddress,MsBetweenPresents\nGame,1,0x100,0\nGame,1,0x100,16\nGame,1,0x100,18");
  assert.deepEqual(result.frames, [16, 18]);
  assert.equal(result.inputFPS, null);
});

test("rejects mixed PresentMon streams", () => {
  assert.throws(() => parseCSV("ProcessID,SwapChainAddress,MsBetweenPresents\n1,0x100,12\n1,0x200,12"), /swap chains/);
  assert.throws(() => parseCSV("ProcessID,MsBetweenPresents\n1,12\n2,12"), /Multiple processes/);
});

test("rejects missing frame times, wrong units, invalid values and ambiguous columns", () => {
  for (const csv of [
    "", "FPS\n20", "FPS,Frame Time (s)\n60,0.0167",
    "FPS,Frame Time (ms)\n60,NaN", "FPS,Frame Time (ms)\n60,-5",
    "FPS,Frame Time (ms)\n60,0", "FPS,Frame Time (ms)\n60",
    'FPS,Frame Time (ms)\n60,"16', "FPS,Frame Time (ms)\n60,16,000",
    "FPS,Frame Time (ms)\nnope,16", "FPS,Frame Time (ms)\n",
    "FPS,Frame Time,FrameTimeMs\n60,16,16",
  ]) {
    assert.throws(() => parseCSV(csv), Error, csv);
  }
});

test("computes clean frame pacing and ignores the arithmetic mean of the FPS column", () => {
  const stats = analyze(parseCSV("FPS,Frame Time (ms)\n100,10\n50,20").frames);
  assert.equal(stats.averageFPS, 1000 / 15);
  assert.equal(stats.lowFPS, 50);
  assert.equal(stats.median, 15);
  assert.equal(stats.deviation, 5);
  const constant = analyze(Array(1200).fill(20));
  assert.equal(constant.averageFPS, 50);
  assert.equal(constant.lowFPS, 50);
  assert.equal(constant.p99, 20);
  assert.equal(constant.events, 0);
});

test("calculates nearest-rank P99 and pools consecutive long frames", () => {
  const frames = Array(100).fill(10);
  frames[20] = 30;
  frames[21] = 50;
  frames[51] = 35;
  const stats = analyze(frames);
  assert.deepEqual(stats.spikes, [20, 21, 51]);
  assert.equal(stats.events, 2);
  assert.equal(stats.p99, 35);
  assert.equal(stats.lowFPS, 20);
  assert.ok(Math.abs(stats.spikesPerMinute - 120 / 1.085) < 1e-9);
});

test("uses the inverse mean of the slowest 1%, rounding sample count up", () => {
  const stats = analyze([...Array(99).fill(10), 25, 75]);
  assert.equal(stats.lowFPS, 20);
  assert.equal(stats.p99, 25);
});

test("flags only captures with at least 300 frames and 15 seconds as eligible", () => {
  assert.equal(analyze(Array(299).fill(100)).eligible, false);
  assert.equal(analyze(Array(300).fill(49)).eligible, false);
  assert.equal(analyze(Array(300).fill(50)).eligible, true);
});

test("requires two distinct eligible caps and aggregates repeated runs by median", () => {
  const stats = analyze(Array(1000).fill(20));
  const result = compare([
    { cap: 60, stats: { ...stats, averageFPS: 45 } },
    { cap: 60, stats: { ...stats, averageFPS: 55 } },
    { cap: 60, stats: { ...stats, averageFPS: 500 } },
    { cap: 90, stats: analyze([11, 11]) },
    { cap: null, stats },
    { cap: 12.5, stats },
  ]);
  assert.equal(result.winner, null);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].runs, 3);
  assert.equal(result.groups[0].averageFPS, 55);
});

test("prefers the faster measured run when pacing is comparable", () => {
  const slower = analyze(Array(900).fill(30));
  const faster = analyze(Array(1200).fill(20));
  assert.equal(compare([{ cap: 60, stats: faster }, { cap: 40, stats: slower }]).winner.cap, 60);
});

test("uses P99 ratio and then 1% low ratio to remove unstable caps", () => {
  const stable = analyze(Array(1200).fill(20));
  const faster = { ...stable, averageFPS: 80, p99Ratio: 1.2 };
  assert.equal(compare([{ cap: 60, stats: stable }, { cap: 90, stats: faster }]).winner.cap, 60);
  const weakLows = { ...faster, p99Ratio: 1.05, lowRatio: 0.90 };
  assert.equal(compare([{ cap: 60, stats: stable }, { cap: 90, stats: weakLows }]).winner.cap, 60);
});

test("synthetic comparison recommends 60 FPS and detects five events at 90 FPS", () => {
  const runs = demo.map(({ cap, csv }) => ({ cap, stats: analyze(parseCSV(csv).frames) }));
  assert.equal(runs[2].stats.events, 5);
  assert.equal(runs[0].stats.events, 0);
  assert.equal(runs[1].stats.events, 0);
  const { winner } = compare(runs);
  assert.equal(winner.cap, 60);
  assert.ok(Math.abs(winner.averageFPS - 60) < 0.01);
});
