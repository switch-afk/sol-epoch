'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, UsageError } = require('../src/args');

test('no arguments gives the defaults', () => {
  assert.deepEqual(parseArgs([]), { rpc: null, json: false, help: false, version: false });
});

test('parses --json', () => {
  assert.equal(parseArgs(['--json']).json, true);
});

test('--json does not take a value', () => {
  assert.throws(() => parseArgs(['--json=yes']), /does not take a value/);
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