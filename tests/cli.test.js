'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../src/cli');
const { version } = require('../package.json');

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

test('a plain run parses fine (reading the epoch comes in a later PR)', async () => {
  const stderr = sink();
  const code = await run([], { stdout: sink(), stderr });
  assert.equal(code, 1);
  assert.match(stderr.data, /not implemented yet/);
});