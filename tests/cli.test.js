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

function sink() {
  return {
    data: '',
    write(chunk) {
      this.data += chunk;
    },
  };
}

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

test('prints the current epoch and exits 0', async () => {
  const mock = createMockRpc({ getEpochInfo: EPOCH });
  const stdout = sink();
  const code = await run([], { stdout, stderr: sink(), fetch: mock.fetch, env: {} });
  assert.equal(code, 0);
  assert.match(stdout.data, /Epoch      812/);
  assert.match(stdout.data, /Progress   42\.31% \(182,785 of 432,000 slots\)/);
  assert.match(stdout.data, /Remaining  249,215 slots/);
  assert.equal(mock.calls[0].method, 'getEpochInfo');
  assert.equal(mock.calls[0].url, 'https://api.mainnet-beta.solana.com');
});

test('--json prints machine-readable output', async () => {
  const mock = createMockRpc({ getEpochInfo: EPOCH });
  const stdout = sink();
  const code = await run(['--json'], { stdout, stderr: sink(), fetch: mock.fetch, env: {} });
  assert.equal(code, 0);
  const out = JSON.parse(stdout.data);
  assert.equal(out.epoch, 812);
  assert.equal(out.slotsRemaining, 249215);
  assert.equal(out.rpc, 'api.mainnet-beta.solana.com');
});

test('--rpc beats SOL_EPOCH_RPC, which beats the default', async () => {
  const env = { SOL_EPOCH_RPC: 'https://env.example.com' };

  const fromEnv = createMockRpc({ getEpochInfo: EPOCH });
  await run([], { stdout: sink(), stderr: sink(), fetch: fromEnv.fetch, env });
  assert.equal(fromEnv.calls[0].url, 'https://env.example.com');

  const fromFlag = createMockRpc({ getEpochInfo: EPOCH });
  await run(['--rpc', 'https://flag.example.com'], {
    stdout: sink(),
    stderr: sink(),
    fetch: fromFlag.fetch,
    env,
  });
  assert.equal(fromFlag.calls[0].url, 'https://flag.example.com');
});

test('an RPC failure exits 1, prints to stderr and never leaks the URL', async () => {
  const mock = createMockRpc({ getEpochInfo: httpError(500) });
  const stdout = sink();
  const stderr = sink();
  const code = await run(['--rpc', 'https://rpc.example.com/?api-key=secret'], {
    stdout,
    stderr,
    fetch: mock.fetch,
    env: {},
  });
  assert.equal(code, 1);
  assert.equal(stdout.data, '');
  assert.match(stderr.data, /Error: rpc\.example\.com returned HTTP 500/);
  assert.ok(!stderr.data.includes('secret'));
});

test('a rate limited RPC retries and then succeeds', async () => {
  let calls = 0;
  const mock = createMockRpc({
    getEpochInfo: () => (calls++ === 0 ? httpError(429) : EPOCH),
  });
  const stdout = sink();
  const code = await run([], {
    stdout,
    stderr: sink(),
    fetch: mock.fetch,
    sleep: async () => {},
    env: {},
  });
  assert.equal(code, 0);
  assert.match(stdout.data, /Epoch      812/);
});