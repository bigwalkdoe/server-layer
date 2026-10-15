'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { closedPort, startTcpListener } = require('./helpers/net');
const { probeTcp } = require('../lib/probe');

test('resolves true when something is listening', async (t) => {
  const listener = await startTcpListener();
  t.after(listener.close);

  assert.equal(await probeTcp('127.0.0.1', listener.port, 1000), true);
});

test('resolves false when nothing is listening', async () => {
  const port = await closedPort();

  assert.equal(await probeTcp('127.0.0.1', port, 1000), false);
});

test('resolves false when the host does not resolve', async () => {
  assert.equal(await probeTcp('no-such-host.invalid', 5432, 1000), false);
});

test('never rejects', async () => {
  const port = await closedPort();

  const result = await probeTcp('127.0.0.1', port, 1000).then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );

  assert.equal(result.ok, true, `probeTcp rejected: ${result.error}`);
});
