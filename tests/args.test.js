'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, UsageError } = require('../src/args');

test('no arguments gives the defaults', () => {
  assert.deepEqual(parseArgs([]), { json: false, help: false, version: false });
});

test('parses --json', () => {
  assert.equal(parseArgs(['--json']).json, true);
});

test('--json does not take a value', () => {
  assert.throws(() => parseArgs(['--json=yes']), /does not take a value/);
});

test('--help and --version work in both forms', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs(['--version']).version, true);
  assert.equal(parseArgs(['-v']).version, true);
});

test('unknown options are usage errors', () => {
  assert.throws(() => parseArgs(['--nope']), /Unknown option: --nope/);
  assert.throws(() => parseArgs(['-x']), /Unknown option: -x/);
  assert.throws(() => parseArgs(['--nope=1']), /Unknown option: --nope/);
});

test('positional arguments are usage errors', () => {
  assert.throws(() => parseArgs(['mainnet']), /Unexpected argument: mainnet/);
  assert.throws(() => parseArgs(['mainnet']), UsageError);
});