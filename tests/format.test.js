'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatHuman,
  formatJson,
  formatDuration,
  formatUtc,
  withCommas,
} = require('../src/format');

const ESTIMATE = {
  slotTimeMs: 400,
  windowSecs: 1800,
  secondsRemaining: 99686,
  endsAt: '2026-10-16T15:41:26.000Z',
};

const INFO = {
  epoch: 812,
  slot: 351000000,
  slotIndex: 182785,
  slotsInEpoch: 432000,
  slotsRemaining: 249215,
  progress: 42.31,
  blockHeight: 330000000,
  host: 'rpc.example.com',
  estimate: ESTIMATE,
};

test('withCommas groups thousands', () => {
  assert.equal(withCommas(0), '0');
  assert.equal(withCommas(999), '999');
  assert.equal(withCommas(1000), '1,000');
  assert.equal(withCommas(432000), '432,000');
  assert.equal(withCommas(351000000), '351,000,000');
});

test('formatDuration shows days, hours and minutes and drops empty leading units', () => {
  assert.equal(formatDuration(99686), '1d 3h 41m');
  assert.equal(formatDuration(3 * 3600 + 5 * 60), '3h 5m');
  assert.equal(formatDuration(12 * 60), '12m');
  assert.equal(formatDuration(1800), '30m');
  assert.equal(formatDuration(86400 + 300), '1d 0h 5m');
  assert.equal(formatDuration(59), '<1m');
  assert.equal(formatDuration(0), '<1m');
});

test('formatUtc prints minutes in UTC', () => {
  assert.equal(formatUtc('2026-10-16T15:41:26.000Z'), '2026-10-16 15:41 UTC');
});

test('human output lists epoch, progress, time left, slot, block and host', () => {
  assert.equal(
    formatHuman(INFO),
    [
      'Epoch      812',
      'Progress   42.31% (182,785 of 432,000 slots)',
      'Remaining  249,215 slots',
      'Slot time  400 ms (avg over last 30m)',
      'Time left  ~1d 3h 41m',
      'Ends       2026-10-16 15:41 UTC',
      'Slot       351,000,000',
      'Block      330,000,000',
      'RPC        rpc.example.com',
      '',
    ].join('\n')
  );
});

test('human output says the time left is unknown when there is no estimate', () => {
  const text = formatHuman({ ...INFO, estimate: null });
  assert.match(text, /Time left  unknown \(could not read recent slot times\)/);
  assert.ok(!text.includes('Slot time'));
  assert.ok(!text.includes('Ends'));
});

test('human output keeps two decimals and skips the block line when unknown', () => {
  const text = formatHuman({ ...INFO, progress: 50, blockHeight: null });
  assert.match(text, /Progress   50\.00% /);
  assert.ok(!text.includes('Block'));
});

test('json output has stable fields', () => {
  assert.deepEqual(JSON.parse(formatJson(INFO)), {
    epoch: 812,
    slot: 351000000,
    slotIndex: 182785,
    slotsInEpoch: 432000,
    slotsRemaining: 249215,
    progress: 42.31,
    slotTimeMs: 400,
    secondsRemaining: 99686,
    endsAt: '2026-10-16T15:41:26.000Z',
    blockHeight: 330000000,
    rpc: 'rpc.example.com',
  });
  assert.ok(formatJson(INFO).endsWith('\n'));
});

test('json output uses null for the estimate fields and the block height when unknown', () => {
  const out = JSON.parse(formatJson({ ...INFO, estimate: null, blockHeight: null }));
  assert.equal(out.slotTimeMs, null);
  assert.equal(out.secondsRemaining, null);
  assert.equal(out.endsAt, null);
  assert.equal(out.blockHeight, null);
});