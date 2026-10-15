'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchEpochSchedule, epochBounds, describeEpoch } = require('../src/schedule');
const { createRpcClient, RpcError } = require('../src/rpc');
const { createMockRpc } = require('./helpers/mock-rpc');

const MAINNET = {
  firstNormalEpoch: 0,
  firstNormalSlot: 0,
  leaderScheduleSlotOffset: 432000,
  slotsPerEpoch: 432000,
  warmup: false,
};

const WARMUP = {
  firstNormalEpoch: 14,
  firstNormalSlot: 524256,
  leaderScheduleSlotOffset: 432000,
  slotsPerEpoch: 432000,
  warmup: true,
};

function clientFor(handlers) {
  const mock = createMockRpc(handlers);
  return {
    client: createRpcClient({ url: 'https://rpc.example.com/?api-key=secret', fetch: mock.fetch }),
    mock,
  };
}

test('reads the schedule and keeps what the maths needs', async () => {
  const { client, mock } = clientFor({ getEpochSchedule: MAINNET });
  assert.deepEqual(await fetchEpochSchedule(client), {
    slotsPerEpoch: 432000,
    firstNormalEpoch: 0,
    firstNormalSlot: 0,
  });
  assert.equal(mock.calls[0].method, 'getEpochSchedule');
});

test('an unexpected schedule is an RpcError that names only the host', async () => {
  const bad = [
    null,
    {},
    { ...MAINNET, slotsPerEpoch: 0 },
    { ...MAINNET, slotsPerEpoch: '432000' },
    { ...MAINNET, firstNormalEpoch: -1 },
    { ...MAINNET, firstNormalSlot: 1.5 },
  ];
  for (const response of bad) {
    const { client } = clientFor({ getEpochSchedule: response });
    await assert.rejects(fetchEpochSchedule(client), (err) => {
      assert.ok(err instanceof RpcError);
      assert.match(err.message, /rpc\.example\.com returned an unexpected epoch schedule/);
      assert.ok(!err.message.includes('secret'));
      return true;
    });
  }
});

test('normal epochs are slotsPerEpoch long and start one after the other', () => {
  const schedule = { slotsPerEpoch: 432000, firstNormalEpoch: 0, firstNormalSlot: 0 };
  assert.deepEqual(epochBounds(schedule, 1058), {
    epoch: 1058,
    firstSlot: 457056000,
    lastSlot: 457487999,
    slotsInEpoch: 432000,
  });
  assert.equal(epochBounds(schedule, 1059).firstSlot, epochBounds(schedule, 1058).lastSlot + 1);
  assert.equal(epochBounds(schedule, 0).firstSlot, 0);
});

test('warmup epochs start at 32 slots and double until the normal length', () => {
  const schedule = { slotsPerEpoch: 432000, firstNormalEpoch: 14, firstNormalSlot: 524256 };
  assert.deepEqual(epochBounds(schedule, 0), { epoch: 0, firstSlot: 0, lastSlot: 31, slotsInEpoch: 32 });
  assert.deepEqual(epochBounds(schedule, 1), { epoch: 1, firstSlot: 32, lastSlot: 95, slotsInEpoch: 64 });
  assert.deepEqual(epochBounds(schedule, 2), { epoch: 2, firstSlot: 96, lastSlot: 223, slotsInEpoch: 128 });
  const last = epochBounds(schedule, 13);
  assert.equal(last.slotsInEpoch, 262144);
  assert.equal(last.lastSlot, 524255);
  assert.equal(epochBounds(schedule, 14).firstSlot, 524256);
  assert.equal(epochBounds(schedule, 14).slotsInEpoch, 432000);
});

test('the warmup schedule reads back through fetchEpochSchedule', async () => {
  const { client } = clientFor({ getEpochSchedule: WARMUP });
  const schedule = await fetchEpochSchedule(client);
  assert.equal(epochBounds(schedule, 14).firstSlot, 524256);
});

test('describeEpoch for a finished epoch counts the slots since it ended', () => {
  const schedule = { slotsPerEpoch: 432000, firstNormalEpoch: 0, firstNormalSlot: 0 };
  const result = describeEpoch(epochBounds(schedule, 1057), { epoch: 1058, slot: 457192028 });
  assert.deepEqual(result, {
    epoch: 1057,
    status: 'finished',
    firstSlot: 456624000,
    lastSlot: 457055999,
    slotsInEpoch: 432000,
    slotsSinceEnd: 136029,
    slotsUntilStart: null,
    currentEpoch: 1058,
    currentSlot: 457192028,
  });
});

test('describeEpoch for an upcoming epoch counts the slots until it starts', () => {
  const schedule = { slotsPerEpoch: 432000, firstNormalEpoch: 0, firstNormalSlot: 0 };
  const result = describeEpoch(epochBounds(schedule, 1060), { epoch: 1058, slot: 457192028 });
  assert.equal(result.status, 'upcoming');
  assert.equal(result.firstSlot, 457920000);
  assert.equal(result.slotsUntilStart, 727972);
  assert.equal(result.slotsSinceEnd, null);
});