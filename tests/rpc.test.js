'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRpcClient, resolveRpcUrl, RpcError, DEFAULT_RPC } = require('../src/rpc');
const { createMockRpc, httpError, rpcError, sequence, makeResponse } = require('./helpers/mock-rpc');

const URL_WITH_KEY = 'https://rpc.example.com/?api-key=secret';

function makeClient(handlers, extra = {}) {
  const mock = createMockRpc(handlers);
  const sleeps = [];
  const client = createRpcClient({
    url: URL_WITH_KEY,
    fetch: mock.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...extra,
  });
  return { client, mock, sleeps };
}

test('resolveRpcUrl prefers the flag, then the env var, then the default', () => {
  const env = { SOL_EPOCH_RPC: 'https://env.example.com' };
  assert.equal(resolveRpcUrl('https://flag.example.com', env), 'https://flag.example.com');
  assert.equal(resolveRpcUrl(null, env), 'https://env.example.com');
  assert.equal(resolveRpcUrl(null, {}), DEFAULT_RPC);
});

test('call sends a JSON-RPC request and returns the result', async () => {
  const { client, mock } = makeClient({ getVersion: { 'solana-core': '2.0.0' } });
  const result = await client.call('getVersion');
  assert.deepEqual(result, { 'solana-core': '2.0.0' });
  assert.equal(mock.calls[0].method, 'getVersion');
  assert.deepEqual(mock.calls[0].params, []);
});

test('call passes params through', async () => {
  const { client, mock } = makeClient({ getBalance: 5 });
  await client.call('getBalance', ['abc']);
  assert.deepEqual(mock.calls[0].params, ['abc']);
});

test('retries on 429 with exponential backoff', async () => {
  const { client, mock, sleeps } = makeClient({
    getHealth: sequence([httpError(429), httpError(429), 'ok']),
  });
  assert.equal(await client.call('getHealth'), 'ok');
  assert.deepEqual(sleeps, [500, 1000]);
  assert.equal(mock.calls.length, 3);
});

test('honors the Retry-After header', async () => {
  const { client, sleeps } = makeClient({
    getHealth: sequence([httpError(429, { 'retry-after': '2' }), 'ok']),
  });
  assert.equal(await client.call('getHealth'), 'ok');
  assert.deepEqual(sleeps, [2000]);
});

test('gives up after maxRetries and does not leak the URL', async () => {
  const { client, mock, sleeps } = makeClient({ getHealth: httpError(429) }, { maxRetries: 2 });
  await assert.rejects(client.call('getHealth'), (err) => {
    assert.ok(err instanceof RpcError);
    assert.equal(err.status, 429);
    assert.match(err.message, /rpc\.example\.com/);
    assert.ok(!err.message.includes('secret'));
    return true;
  });
  assert.equal(sleeps.length, 2);
  assert.equal(mock.calls.length, 3);
});

test('other HTTP errors are not retried and show the hostname only', async () => {
  const { client, mock } = makeClient({ getHealth: httpError(500) });
  await assert.rejects(client.call('getHealth'), (err) => {
    assert.match(err.message, /HTTP 500/);
    assert.ok(!err.message.includes('secret'));
    return true;
  });
  assert.equal(mock.calls.length, 1);
});

test('RPC-level errors surface the message and code', async () => {
  const { client } = makeClient({ getBalance: rpcError(-32602, 'Invalid param') });
  await assert.rejects(client.call('getBalance'), (err) => {
    assert.ok(err instanceof RpcError);
    assert.equal(err.code, -32602);
    assert.match(err.message, /Invalid param/);
    return true;
  });
});

test('unknown methods come back as RPC errors', async () => {
  const { client } = makeClient({});
  await assert.rejects(client.call('nope'), /Method not found/);
});

test('network failures do not leak the URL', async () => {
  const client = createRpcClient({
    url: URL_WITH_KEY,
    fetch: async () => {
      throw new Error(`connect ECONNREFUSED ${URL_WITH_KEY}`);
    },
  });
  await assert.rejects(client.call('getHealth'), (err) => {
    assert.equal(err.message, 'Could not reach rpc.example.com');
    return true;
  });
});

test('an unparseable response body is reported cleanly', async () => {
  const response = makeResponse({});
  response.json = async () => {
    throw new SyntaxError('Unexpected token');
  };
  const client = createRpcClient({ url: URL_WITH_KEY, fetch: async () => response });
  await assert.rejects(client.call('getHealth'), /invalid response/);
});