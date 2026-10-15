'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchSlotTime, buildEstimate, SAMPLE_LIMIT } = require('../src/estimate');
const { createRpcClient, RpcError } = require('../src/rpc');
const { createMockRpc } = require('./helpers/mock-rpc');

function clientFor(handlers) {
  const mock = createMockRpc(handlers);
  const client = createRpcClient({
    url: 'https://rpc.example.com/?api-key=secret',
    fetch: mock.fetch,
  });
  return { client, mock };
}

function sample(numSlots, samplePeriodSecs = 60) {
  return { slot: 457190000, numTransactions: 100000, numSlots, samplePeriodSecs };
}

test('asks for the recent samples and averages the slot time', async () => {
  const { client, mock } = clientFor({
    getRecentPerformanceSamples: [sample(150), sample(150), sample(150)],
  });
  const slotTime = await fetchSlotTime(client);
  assert.equal(slotTime.msPerSlot, 400);
  assert.equal(slotTime.windowSecs, 180);
  assert.equal(mock.calls[0].method, 'getRecentPerformanceSamples');
  assert.deepEqual(mock.calls[0].params, [SAMPLE_LIMIT]);
});

test('weights by slots, so a slow minute counts for what it covered', async () => {
  const { client } = clientFor({
    getRecentPerformanceSamples: [sample(100), sample(200)],
  });
  const slotTime = await fetchSlotTime(client);
  assert.equal(slotTime.msPerSlot, 400);
  assert.equal(slotTime.windowSecs, 120);
});

test('skips samples that are unusable', async () => {
  const { client } = clientFor({
    getRecentPerformanceSamples: [
      null,
      { numSlots: 0, samplePeriodSecs: 60 },
      { numSlots: 150, samplePeriodSecs: 0 },
      { numSlots: '150', samplePeriodSecs: 60 },
      sample(120),
    ],
  });
  const slotTime = await fetchSlotTime(client);
  assert.equal(slotTime.msPerSlot, 500);
  assert.equal(slotTime.windowSecs, 60);
});

test('no usable samples is an RpcError that names only the host', async () => {
  for (const response of [[], null, {}, [{ numSlots: 0, samplePeriodSecs: 60 }]]) {
    const { client } = clientFor({ getRecentPerformanceSamples: response });
    await assert.rejects(fetchSlotTime(client), (err) => {
      assert.ok(err instanceof RpcError);
      assert.match(err.message, /rpc\.example\.com returned no usable slot time samples/);
      assert.ok(!err.message.includes('secret'));
      return true;
    });
  }
});

test('buildEstimate turns slots left into a time and an end date', () => {
  const now = Date.UTC(2026, 9, 15, 12, 0, 0);
  const estimate = buildEstimate(249215, { msPerSlot: 400, windowSecs: 1800 }, now);
  assert.deepEqual(estimate, {
    slotTimeMs: 400,
    windowSecs: 1800,
    secondsRemaining: 99686,
    endsAt: '2026-10-16T15:41:26.000Z',
  });
});

test('buildEstimate rounds the slot time but not the maths behind the end date', () => {
  const now = Date.UTC(2026, 9, 15, 12, 0, 0);
  const estimate = buildEstimate(1000, { msPerSlot: 400.6, windowSecs: 60 }, now);
  assert.equal(estimate.slotTimeMs, 401);
  assert.equal(estimate.secondsRemaining, 401);
  assert.equal(estimate.endsAt, '2026-10-15T12:06:40.600Z');
});