'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatHuman,
  formatJson,
  formatLookupHuman,
  formatLookupJson,
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

const FINISHED = {
  epoch: 811,
  status: 'finished',
  firstSlot: 350352000,
  lastSlot: 350783999,
  slotsInEpoch: 432000,
  slotsSinceEnd: 182786,
  slotsUntilStart: null,
  currentEpoch: 812,
  currentSlot: 350966785,
  host: 'rpc.example.com',
  estimate: null,
};

const UPCOMING = {
  epoch: 814,
  status: 'upcoming',
  firstSlot: 351648000,
  lastSlot: 352079999,
  slotsInEpoch: 432000,
  slotsSinceEnd: null,
  slotsUntilStart: 681215,
  currentEpoch: 812,
  currentSlot: 350966785,
  host: 'rpc.example.com',
  estimate: {
    slotTimeMs: 400,
    windowSecs: 1800,
    secondsRemaining: 272486,
    endsAt: '2026-10-18T15:41:26.000Z',
  },
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

test('compact json is a single line that parses to the same thing', () => {
  const compact = formatJson(INFO, { compact: true });
  assert.equal(compact.trim().split('\n').length, 1);
  assert.deepEqual(JSON.parse(compact), JSON.parse(formatJson(INFO)));
  assert.ok(compact.endsWith('\n'));
});

test('lookup human output for a finished epoch', () => {
  assert.equal(
    formatLookupHuman(FINISHED),
    [
      'Epoch      811 (finished)',
      'Slots      432,000 (350,352,000 to 350,783,999)',
      'Ended      182,786 slots ago',
      'Current    epoch 812 at slot 350,966,785',
      'RPC        rpc.example.com',
      '',
    ].join('\n')
  );
});

test('lookup human output for an upcoming epoch with an estimate', () => {
  assert.equal(
    formatLookupHuman(UPCOMING),
    [
      'Epoch      814 (upcoming)',
      'Slots      432,000 (351,648,000 to 352,079,999)',
      'Starts in  ~3d 3h 41m (681,215 slots)',
      'Starts at  2026-10-18 15:41 UTC',
      'Current    epoch 812 at slot 350,966,785',
      'RPC        rpc.example.com',
      '',
    ].join('\n')
  );
});

test('lookup human output for an upcoming epoch without an estimate', () => {
  const text = formatLookupHuman({ ...UPCOMING, estimate: null });
  assert.match(text, /Starts in  681,215 slots \(time unknown\)/);
  assert.ok(!text.includes('Starts at'));
});

test('lookup json has stable fields and nulls for what does not apply', () => {
  assert.deepEqual(JSON.parse(formatLookupJson(FINISHED)), {
    epoch: 811,
    status: 'finished',
    firstSlot: 350352000,
    lastSlot: 350783999,
    slotsInEpoch: 432000,
    slotsSinceEnd: 182786,
    slotsUntilStart: null,
    secondsUntilStart: null,
    startsAt: null,
    currentEpoch: 812,
    currentSlot: 350966785,
    rpc: 'rpc.example.com',
  });
  const upcoming = JSON.parse(formatLookupJson(UPCOMING));
  assert.equal(upcoming.status, 'upcoming');
  assert.equal(upcoming.slotsUntilStart, 681215);
  assert.equal(upcoming.secondsUntilStart, 272486);
  assert.equal(upcoming.startsAt, '2026-10-18T15:41:26.000Z');
  assert.equal(upcoming.slotsSinceEnd, null);
});

test('compact lookup json is a single line', () => {
  assert.equal(formatLookupJson(UPCOMING, { compact: true }).trim().split('\n').length, 1);
});