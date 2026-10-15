'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../src/cli');
const { CLEAR_SCREEN } = require('../src/watch');
const { createMockRpc, httpError, sequence } = require('./helpers/mock-rpc');
const { version } = require('../package.json');

// Epoch 812 starts at slot 350,784,000 (812 * 432,000), so slotIndex 182,785 is slot 350,966,785.
const EPOCH = {
  epoch: 812,
  absoluteSlot: 350966785,
  slotIndex: 182785,
  slotsInEpoch: 432000,
  blockHeight: 330000000,
};

const SCHEDULE = {
  firstNormalEpoch: 0,
  firstNormalSlot: 0,
  leaderScheduleSlotOffset: 432000,
  slotsPerEpoch: 432000,
  warmup: false,
};

// 150 slots a minute is 400 ms per slot.
const SAMPLES = [150, 150, 150].map((numSlots) => ({
  slot: 350966785,
  numTransactions: 100000,
  numSlots,
  samplePeriodSecs: 60,
}));

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

function sink(extra = {}) {
  return {
    data: '',
    write(chunk) {
      this.data += chunk;
    },
    ...extra,
  };
}

function ioFor(handlers, extra = {}) {
  const mock = createMockRpc(handlers);
  const stdout = sink();
  const stderr = sink();
  const io = { stdout, stderr, fetch: mock.fetch, env: {}, now: () => NOW, ...extra };
  return { io, mock, stdout, stderr };
}

const GOOD = {
  getEpochInfo: EPOCH,
  getRecentPerformanceSamples: SAMPLES,
  getEpochSchedule: SCHEDULE,
};

// Aborts after the given number of refreshes, so a watch run ends by itself.
function stopAfter(frames) {
  const controller = new AbortController();
  const sleeps = [];
  return {
    signal: controller.signal,
    sleeps,
    sleep: async (ms) => {
      sleeps.push(ms);
      if (sleeps.length >= frames) controller.abort();
    },
  };
}

test('--help prints usage and exits 0', async () => {
  const stdout = sink();
  const code = await run(['--help'], { stdout, stderr: sink() });
  assert.equal(code, 0);
  assert.match(stdout.data, /Usage:/);
  for (const option of ['--epoch', '--watch', '--interval', '--rpc', '--json']) {
    assert.ok(stdout.data.includes(option), `help mentions ${option}`);
  }
});

test('--version prints the package version', async () => {
  const stdout = sink();
  const code = await run(['--version'], { stdout, stderr: sink() });
  assert.equal(code, 0);
  assert.equal(stdout.data.trim(), version);
});

test('usage errors exit 2 and print to stderr', async () => {
  const stdout = sink();
  const stderr = sink();
  const code = await run(['--nope'], { stdout, stderr });
  assert.equal(code, 2);
  assert.equal(stdout.data, '');
  assert.match(stderr.data, /Error: Unknown option: --nope/);
  assert.match(stderr.data, /Usage:/);
});

test('conflicting options are usage errors too', async () => {
  const stderr = sink();
  const code = await run(['--watch', '--epoch', '5'], { stdout: sink(), stderr });
  assert.equal(code, 2);
  assert.match(stderr.data, /--watch cannot be combined with --epoch/);
});

test('prints the epoch with the time left and exits 0', async () => {
  const { io, mock, stdout, stderr } = ioFor(GOOD);
  const code = await run([], io);
  assert.equal(code, 0);
  assert.equal(stderr.data, '');
  assert.match(stdout.data, /Epoch      812/);
  assert.match(stdout.data, /Progress   42\.31% \(182,785 of 432,000 slots\)/);
  assert.match(stdout.data, /Remaining  249,215 slots/);
  assert.match(stdout.data, /Slot time  400 ms \(avg over last 3m\)/);
  assert.match(stdout.data, /Time left  ~1d 3h 41m/);
  assert.match(stdout.data, /Ends       2026-10-16 15:41 UTC/);
  assert.deepEqual(
    mock.calls.map((call) => call.method),
    ['getEpochInfo', 'getRecentPerformanceSamples']
  );
  assert.equal(mock.calls[0].url, 'https://api.mainnet-beta.solana.com');
});

test('--json prints machine-readable output with the estimate', async () => {
  const { io, stdout } = ioFor(GOOD);
  const code = await run(['--json'], io);
  assert.equal(code, 0);
  const out = JSON.parse(stdout.data);
  assert.equal(out.epoch, 812);
  assert.equal(out.slotsRemaining, 249215);
  assert.equal(out.slotTimeMs, 400);
  assert.equal(out.secondsRemaining, 99686);
  assert.equal(out.endsAt, '2026-10-16T15:41:26.000Z');
  assert.equal(out.rpc, 'api.mainnet-beta.solana.com');
});

test('--rpc beats SOL_EPOCH_RPC, which beats the default', async () => {
  const env = { SOL_EPOCH_RPC: 'https://env.example.com' };

  const fromEnv = ioFor(GOOD, { env });
  await run([], fromEnv.io);
  assert.equal(fromEnv.mock.calls[0].url, 'https://env.example.com');

  const fromFlag = ioFor(GOOD, { env });
  await run(['--rpc', 'https://flag.example.com'], fromFlag.io);
  assert.equal(fromFlag.mock.calls[0].url, 'https://flag.example.com');
  assert.equal(fromFlag.mock.calls[1].url, 'https://flag.example.com');
});

test('an epoch failure exits 1, prints to stderr and never leaks the URL', async () => {
  const { io, mock, stdout, stderr } = ioFor({ getEpochInfo: httpError(500) });
  const code = await run(['--rpc', 'https://rpc.example.com/?api-key=secret'], io);
  assert.equal(code, 1);
  assert.equal(stdout.data, '');
  assert.match(stderr.data, /Error: rpc\.example\.com returned HTTP 500/);
  assert.ok(!stderr.data.includes('secret'));
  assert.equal(mock.calls.length, 1);
});

test('if the slot times fail the epoch still prints, with a warning and exit 0', async () => {
  const { io, stdout, stderr } = ioFor({
    getEpochInfo: EPOCH,
    getRecentPerformanceSamples: httpError(500),
  });
  const code = await run(['--rpc', 'https://rpc.example.com/?api-key=secret'], io);
  assert.equal(code, 0);
  assert.match(stdout.data, /Epoch      812/);
  assert.match(stdout.data, /Time left  unknown/);
  assert.match(stderr.data, /Warning: could not estimate the time left/);
  assert.match(stderr.data, /rpc\.example\.com returned HTTP 500/);
  assert.ok(!stderr.data.includes('secret'));
});

test('--json with no estimate keeps the fields as null', async () => {
  const { io, stdout } = ioFor({ getEpochInfo: EPOCH, getRecentPerformanceSamples: [] });
  const code = await run(['--json'], io);
  assert.equal(code, 0);
  const out = JSON.parse(stdout.data);
  assert.equal(out.epoch, 812);
  assert.equal(out.slotTimeMs, null);
  assert.equal(out.secondsRemaining, null);
  assert.equal(out.endsAt, null);
});

test('a rate limited RPC retries and then succeeds', async () => {
  let calls = 0;
  const { io, stdout } = ioFor(
    {
      getEpochInfo: () => (calls++ === 0 ? httpError(429) : EPOCH),
      getRecentPerformanceSamples: SAMPLES,
    },
    { sleep: async () => {} }
  );
  const code = await run([], io);
  assert.equal(code, 0);
  assert.match(stdout.data, /Epoch      812/);
  assert.match(stdout.data, /Time left  ~1d 3h 41m/);
});

test('--epoch with the current epoch prints the normal output', async () => {
  const normal = ioFor(GOOD);
  await run([], normal.io);
  const same = ioFor(GOOD);
  const code = await run(['--epoch', '812'], same.io);
  assert.equal(code, 0);
  assert.equal(same.stdout.data, normal.stdout.data);
  assert.ok(!same.mock.calls.some((call) => call.method === 'getEpochSchedule'));
});

test('--epoch for a finished epoch shows its range and how long ago it ended', async () => {
  const { io, mock, stdout, stderr } = ioFor(GOOD);
  const code = await run(['--epoch', '811'], io);
  assert.equal(code, 0);
  assert.equal(stderr.data, '');
  assert.match(stdout.data, /Epoch      811 \(finished\)/);
  assert.match(stdout.data, /Slots      432,000 \(350,352,000 to 350,783,999\)/);
  assert.match(stdout.data, /Ended      182,786 slots ago/);
  assert.match(stdout.data, /Current    epoch 812 at slot 350,966,785/);
  assert.deepEqual(
    mock.calls.map((call) => call.method),
    ['getEpochInfo', 'getEpochSchedule']
  );
});

test('--epoch for an upcoming epoch estimates when it starts', async () => {
  const { io, mock, stdout } = ioFor(GOOD);
  const code = await run(['--epoch', '814'], io);
  assert.equal(code, 0);
  assert.match(stdout.data, /Epoch      814 \(upcoming\)/);
  assert.match(stdout.data, /Slots      432,000 \(351,648,000 to 352,079,999\)/);
  assert.match(stdout.data, /Starts in  ~3d 3h 41m \(681,215 slots\)/);
  assert.match(stdout.data, /Starts at  2026-10-18 15:41 UTC/);
  assert.deepEqual(
    mock.calls.map((call) => call.method),
    ['getEpochInfo', 'getEpochSchedule', 'getRecentPerformanceSamples']
  );
});

test('--epoch for an upcoming epoch still answers when the slot times fail', async () => {
  const { io, stdout, stderr } = ioFor({
    ...GOOD,
    getRecentPerformanceSamples: httpError(500),
  });
  const code = await run(['--epoch', '814'], io);
  assert.equal(code, 0);
  assert.match(stdout.data, /Starts in  681,215 slots \(time unknown\)/);
  assert.match(stderr.data, /Warning: could not estimate when it starts/);
});

test('--epoch --json prints the lookup fields', async () => {
  const { io, stdout } = ioFor(GOOD);
  const code = await run(['--epoch', '811', '--json'], io);
  assert.equal(code, 0);
  const out = JSON.parse(stdout.data);
  assert.equal(out.epoch, 811);
  assert.equal(out.status, 'finished');
  assert.equal(out.slotsSinceEnd, 182786);
  assert.equal(out.startsAt, null);
  assert.equal(out.currentEpoch, 812);
});

test('--epoch fails cleanly when the schedule call fails', async () => {
  const { io, stdout, stderr } = ioFor({ ...GOOD, getEpochSchedule: httpError(500) });
  const code = await run(['--epoch', '811'], io);
  assert.equal(code, 1);
  assert.equal(stdout.data, '');
  assert.match(stderr.data, /Error: api\.mainnet-beta\.solana\.com returned HTTP 500/);
});

test('--watch prints a frame per refresh and separates them when piped', async () => {
  const stop = stopAfter(3);
  const { io, mock, stdout, stderr } = ioFor(GOOD, { signal: stop.signal, sleep: stop.sleep });
  const code = await run(['--watch'], io);
  assert.equal(code, 0);
  assert.equal(stderr.data, '');
  assert.equal(stdout.data.match(/Epoch      812/g).length, 3);
  assert.equal(stdout.data.match(/\n\nEpoch      812/g).length, 2);
  assert.ok(!stdout.data.includes(CLEAR_SCREEN));
  assert.deepEqual(stop.sleeps, [10000, 10000, 10000]);
  assert.equal(mock.calls.filter((call) => call.method === 'getEpochInfo').length, 3);
});

test('--watch --interval sets the pause between refreshes', async () => {
  const stop = stopAfter(2);
  const { io } = ioFor(GOOD, { signal: stop.signal, sleep: stop.sleep });
  await run(['--watch', '--interval', '30'], io);
  assert.deepEqual(stop.sleeps, [30000, 30000]);
});

test('--watch redraws the screen on a terminal', async () => {
  const stop = stopAfter(2);
  const { io, stdout } = ioFor(GOOD, { signal: stop.signal, sleep: stop.sleep });
  io.stdout = sink({ isTTY: true });
  await run(['--watch', '--interval', '5'], io);
  assert.equal(io.stdout.data.split(CLEAR_SCREEN).length - 1, 2);
  assert.match(io.stdout.data, /Refreshing every 5s, Ctrl\+C to stop/);
  assert.equal(stdout.data, '');
});

test('--watch --json prints one compact object per line', async () => {
  const stop = stopAfter(3);
  const { io, stdout } = ioFor(GOOD, { signal: stop.signal, sleep: stop.sleep });
  const code = await run(['--watch', '--json'], io);
  assert.equal(code, 0);
  const lines = stdout.data.trim().split('\n');
  assert.equal(lines.length, 3);
  for (const line of lines) {
    assert.equal(JSON.parse(line).epoch, 812);
  }
});

test('--watch fails straight away when the first refresh fails', async () => {
  const stop = stopAfter(3);
  const { io, stdout, stderr } = ioFor(
    { getEpochInfo: httpError(500) },
    { signal: stop.signal, sleep: stop.sleep }
  );
  const code = await run(['--watch'], io);
  assert.equal(code, 1);
  assert.equal(stdout.data, '');
  assert.match(stderr.data, /Error: api\.mainnet-beta\.solana\.com returned HTTP 500/);
  assert.equal(stop.sleeps.length, 0);
});

test('--watch keeps going when a later refresh fails', async () => {
  const stop = stopAfter(3);
  const { io, stdout, stderr } = ioFor(
    {
      getEpochInfo: sequence([EPOCH, httpError(500), EPOCH]),
      getRecentPerformanceSamples: SAMPLES,
    },
    { signal: stop.signal, sleep: stop.sleep }
  );
  const code = await run(['--watch'], io);
  assert.equal(code, 0);
  assert.equal(stdout.data.match(/Epoch      812/g).length, 2);
  assert.match(stderr.data, /Warning: api\.mainnet-beta\.solana\.com returned HTTP 500, trying again/);
  assert.equal(stop.sleeps.length, 3);
});