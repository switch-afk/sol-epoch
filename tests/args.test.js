'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, UsageError, MAX_EPOCH } = require('../src/args');

test('no arguments gives the defaults', () => {
  assert.deepEqual(parseArgs([]), {
    rpc: null,
    epoch: null,
    watch: false,
    interval: null,
    json: false,
    help: false,
    version: false,
  });
});

test('parses --json and --watch', () => {
  assert.equal(parseArgs(['--json']).json, true);
  assert.equal(parseArgs(['--watch']).watch, true);
});

test('flags do not take a value', () => {
  assert.throws(() => parseArgs(['--json=yes']), /--json does not take a value/);
  assert.throws(() => parseArgs(['--watch=1']), /--watch does not take a value/);
});

test('parses --rpc in both forms', () => {
  assert.equal(parseArgs(['--rpc', 'https://rpc.example.com']).rpc, 'https://rpc.example.com');
  assert.equal(parseArgs(['--rpc=http://localhost:8899']).rpc, 'http://localhost:8899');
});

test('--rpc needs a value', () => {
  assert.throws(() => parseArgs(['--rpc']), /--rpc needs a URL/);
  assert.throws(() => parseArgs(['--rpc=']), /--rpc needs a URL/);
  assert.throws(() => parseArgs(['--rpc', '--json']), /--rpc needs a URL/);
});

test('--rpc must be an http(s) URL', () => {
  assert.throws(() => parseArgs(['--rpc', 'not a url']), /valid http\(s\) URL/);
  assert.throws(() => parseArgs(['--rpc', 'ftp://rpc.example.com']), /valid http\(s\) URL/);
});

test('--rpc can only be given once', () => {
  assert.throws(
    () => parseArgs(['--rpc', 'https://a.example.com', '--rpc', 'https://b.example.com']),
    /can only be given once/
  );
});

test('parses --epoch as a number in both forms', () => {
  assert.equal(parseArgs(['--epoch', '1060']).epoch, 1060);
  assert.equal(parseArgs(['--epoch=0']).epoch, 0);
  assert.equal(parseArgs(['--epoch', String(MAX_EPOCH)]).epoch, MAX_EPOCH);
});

test('--epoch needs a value', () => {
  assert.throws(() => parseArgs(['--epoch']), /--epoch needs an epoch number/);
  assert.throws(() => parseArgs(['--epoch=']), /--epoch needs an epoch number/);
  assert.throws(() => parseArgs(['--epoch', '-1']), /--epoch needs an epoch number/);
});

test('--epoch must be a whole number in range', () => {
  for (const bad of ['abc', '1.5', '1e3', '0x10', ' 5', String(MAX_EPOCH + 1)]) {
    assert.throws(() => parseArgs(['--epoch', bad]), /--epoch must be a whole number/);
  }
});

test('--epoch can only be given once', () => {
  assert.throws(() => parseArgs(['--epoch', '1', '--epoch', '2']), /can only be given once/);
});

test('parses --interval together with --watch', () => {
  const opts = parseArgs(['--watch', '--interval', '30']);
  assert.equal(opts.watch, true);
  assert.equal(opts.interval, 30);
  assert.equal(parseArgs(['--interval=5', '--watch']).interval, 5);
});

test('--interval must be whole seconds from 1 to 3600', () => {
  for (const bad of ['0', '3601', '2.5', 'soon']) {
    assert.throws(
      () => parseArgs(['--watch', '--interval', bad]),
      /--interval must be a whole number of seconds from 1 to 3600/
    );
  }
  assert.throws(() => parseArgs(['--watch', '--interval']), /--interval needs a number of seconds/);
});

test('--interval only applies together with --watch', () => {
  assert.throws(() => parseArgs(['--interval', '5']), /--interval only applies together with --watch/);
});

test('--watch cannot be combined with --epoch', () => {
  assert.throws(
    () => parseArgs(['--watch', '--epoch', '1060']),
    /--watch cannot be combined with --epoch/
  );
});

test('--help and --version work in both forms, even next to conflicting options', () => {
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs(['--version']).version, true);
  assert.equal(parseArgs(['-v']).version, true);
  assert.equal(parseArgs(['--interval', '5', '--help']).help, true);
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