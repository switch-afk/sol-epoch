'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatHuman, formatJson, withCommas } = require('../src/format');

const INFO = {
  epoch: 812,
  slot: 351000000,
  slotIndex: 182785,
  slotsInEpoch: 432000,
  slotsRemaining: 249215,
  progress: 42.31,
  blockHeight: 330000000,
  host: 'rpc.example.com',
};

test('withCommas groups thousands', () => {
  assert.equal(withCommas(0), '0');
  assert.equal(withCommas(999), '999');
  assert.equal(withCommas(1000), '1,000');
  assert.equal(withCommas(432000), '432,000');
  assert.equal(withCommas(351000000), '351,000,000');
});

test('human output lists epoch, progress, slots left, slot, block and host', () => {
  assert.equal(
    formatHuman(INFO),
    [
      'Epoch      812',
      'Progress   42.31% (182,785 of 432,000 slots)',
      'Remaining  249,215 slots',
      'Slot       351,000,000',
      'Block      330,000,000',
      'RPC        rpc.example.com',
      '',
    ].join('\n')
  );
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
    blockHeight: 330000000,
    rpc: 'rpc.example.com',
  });
  assert.ok(formatJson(INFO).endsWith('\n'));
});

test('json output keeps blockHeight as null when unknown', () => {
  assert.equal(JSON.parse(formatJson({ ...INFO, blockHeight: null })).blockHeight, null);
});