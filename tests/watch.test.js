'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { abortableSleep, DEFAULT_INTERVAL_SECS, CLEAR_SCREEN } = require('../src/watch');

test('the default interval and the clear sequence are what the help promises', () => {
  assert.equal(DEFAULT_INTERVAL_SECS, 10);
  assert.equal(CLEAR_SCREEN, '\x1b[H\x1b[2J');
});

test('abortableSleep waits for the time to pass', async () => {
  const started = Date.now();
  await abortableSleep(30, new AbortController().signal);
  assert.ok(Date.now() - started >= 25);
});

test('abortableSleep returns straight away when already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  const started = Date.now();
  await abortableSleep(10000, controller.signal);
  assert.ok(Date.now() - started < 1000);
});

test('abortableSleep wakes up when the signal aborts', async () => {
  const controller = new AbortController();
  const started = Date.now();
  setTimeout(() => controller.abort(), 20);
  await abortableSleep(10000, controller.signal);
  assert.ok(Date.now() - started < 1000);
});

test('abortableSleep works without a signal', async () => {
  await abortableSleep(5);
});