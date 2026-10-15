'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../src/cli');
const { createMockRpc, httpError } = require('./helpers/mock-rpc');
const { version } = require('../package.json');

const EPOCH = {
  epoch: 812,
  absoluteSlot: 351000000,
  slotIndex: 182785,
  slotsInEpoch: 432000,
  blockHeight: 330000000,
};

// 150 slots a minute is 400 ms per slot.
const SAMPLES = [150, 150, 150].map((numSlots) => ({
  slot: 351000000,
  numTransactions: 100000,
  numSlots,
  samplePeriodSecs: 60,
}));

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0);

function sink() {
  return {
    data: '',
    write(chunk) {
      this.data += chunk;
    },
  };
}

function ioFor(handlers, extra = {}) {
  const mock = createMockRpc(handlers);
  const stdout = sink();
  const stderr = sink();
  const io = { stdout, stderr, fetch: mock.fetch, env: {}, now: () => NOW, ...extra };
  return { io, mock, stdout, stderr };
}

const GOOD = { getEpochInfo: EPOCH, getRecentPerformanceSamples: SAMPLES };

test('--help prints usage and exits 0', async () => {
  const stdout = sink();
  const code = await run(['--help'], { stdout, stderr: sink() });
  assert.equal(code, 0);
  assert.match(stdout.data, /Usage:/);
  assert.match(stdout.data, /--rpc/);
  assert.match(stdout.data, /--json/);
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