'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchEpochInfo, percentDone } = require('../src/epoch');
const { createRpcClient, RpcError } = require('../src/rpc');
const { createMockRpc } = require('./helpers/mock-rpc');

const RAW = {
  epoch: 812,
  absoluteSlot: 351000000,
  slotIndex: 182785,
  slotsInEpoch: 432000,
  blockHeight: 330000000,
  transactionCount: 123456789,
};

function clientFor(handlers) {
  const mock = createMockRpc(handlers);
  return createRpcClient({ url: 'https://rpc.example.com/?api-key=secret', fetch: mock.fetch });
}

test('reads the epoch and works out progress and slots left', async () => {
  const info = await fetchEpochInfo(clientFor({ getEpochInfo: RAW }));
  assert.deepEqual(info, {
    epoch: 812,
    slot: 351000000,
    slotIndex: 182785,
    slotsInEpoch: 432000,
    slotsRemaining: 249215,
    progress: 42.31,
    blockHeight: 330000000,
  });
});

test('blockHeight is null when the node does not report it', async () => {
  const { blockHeight, ...rest } = RAW;
  const info = await fetchEpochInfo(clientFor({ getEpochInfo: rest }));
  assert.equal(info.blockHeight, null);
});

test('progress is floored so it never reads 100.00% early', () => {
  assert.equal(percentDone(0, 432000), 0);
  assert.equal(percentDone(431999, 432000), 99.99);
  assert.equal(percentDone(216000, 432000), 50);
});

test('the first slot of an epoch has the whole epoch left', async () => {
  const info = await fetchEpochInfo(clientFor({ getEpochInfo: { ...RAW, slotIndex: 0 } }));
  assert.equal(info.progress, 0);
  assert.equal(info.slotsRemaining, 432000);
});

test('an unexpected response is an RpcError that names only the host', async () => {
  const bad = [
    null,
    {},
    { ...RAW, epoch: '812' },
    { ...RAW, slotsInEpoch: 0 },
    { ...RAW, slotIndex: 432000 },
    { ...RAW, slotIndex: -1 },
    { ...RAW, absoluteSlot: 1.5 },
  ];
  for (const response of bad) {
    await assert.rejects(fetchEpochInfo(clientFor({ getEpochInfo: response })), (err) => {
      assert.ok(err instanceof RpcError);
      assert.match(err.message, /rpc\.example\.com returned an unexpected epoch response/);
      assert.ok(!err.message.includes('secret'));
      return true;
    });
  }
});