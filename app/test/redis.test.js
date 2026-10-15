'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startFakeRedis } = require('./helpers/fake-redis');
const { closedPort, waitUntil } = require('./helpers/net');
const { createRedisClient } = require('../lib/redis');

test('ping resolves true when the server replies +PONG', async (t) => {
  const fake = await startFakeRedis(() => '+PONG\r\n');
  t.after(fake.close);

  const redis = createRedisClient({ host: '127.0.0.1', port: fake.port });

  assert.equal(await redis.ping(), true);
  assert.deepEqual(fake.requests, [['PING']]);
});

test('authenticates before issuing the command when a password is configured', async (t) => {
  const fake = await startFakeRedis(() => '+OK\r\n');
  t.after(fake.close);

  const redis = createRedisClient({ host: '127.0.0.1', port: fake.port, password: 's3cret' });

  await redis.ping();

  assert.deepEqual(fake.requests, [['AUTH', 's3cret'], ['PING']]);
});

test('does not authenticate when no password is configured', async (t) => {
  const fake = await startFakeRedis(() => '+PONG\r\n');
  t.after(fake.close);

  await createRedisClient({ host: '127.0.0.1', port: fake.port }).ping();

  assert.deepEqual(fake.requests, [['PING']]);
});

test('get returns the stored value', async (t) => {
  const fake = await startFakeRedis(() => '$5\r\nhello\r\n');
  t.after(fake.close);

  const redis = createRedisClient({ host: '127.0.0.1', port: fake.port });

  assert.equal(await redis.get('greeting'), 'hello');
  assert.deepEqual(fake.requests, [['GET', 'greeting']]);
});

test('get returns null for a nil reply', async (t) => {
  const fake = await startFakeRedis(() => '$-1\r\n');
  t.after(fake.close);

  const redis = createRedisClient({ host: '127.0.0.1', port: fake.port });

  assert.equal(await redis.get('missing'), null);
});

test('setex sends the key, ttl and value', async (t) => {
  const fake = await startFakeRedis(() => '+OK\r\n');
  t.after(fake.close);

  const redis = createRedisClient({ host: '127.0.0.1', port: fake.port });

  assert.equal(await redis.setex('counter', 30, '2'), true);
  assert.deepEqual(fake.requests, [['SETEX', 'counter', '30', '2']]);
});

test('surfaces a Redis error reply as a rejection', async (t) => {
  const fake = await startFakeRedis(() => '-WRONGTYPE Operation against a key holding the wrong kind of value\r\n');
  t.after(fake.close);

  const redis = createRedisClient({ host: '127.0.0.1', port: fake.port });

  await assert.rejects(redis.ping(), /WRONGTYPE/);
});

test('rejects with the server message when authentication fails', async (t) => {
  const fake = await startFakeRedis(() => '-ERR invalid password\r\n');
  t.after(fake.close);

  const redis = createRedisClient({ host: '127.0.0.1', port: fake.port, password: 'wrong' });

  await assert.rejects(redis.ping(), /invalid password/);
});

test('rejects rather than hanging when nothing is listening', async () => {
  const port = await closedPort();
  const redis = createRedisClient({ host: '127.0.0.1', port, timeoutMs: 500 });

  await assert.rejects(redis.ping(), /ECONNREFUSED|timed out/i);
});

test('does not leak a socket per command', async (t) => {
  const fake = await startFakeRedis(() => '+PONG\r\n');
  t.after(fake.close);

  const redis = createRedisClient({ host: '127.0.0.1', port: fake.port });
  await redis.ping();
  await redis.ping();
  await redis.ping();

  assert.equal(fake.requests.length, 3);
  assert.ok(
    await waitUntil(() => fake.openSockets() === 0),
    `expected sockets to be closed, still open: ${fake.openSockets()}`,
  );
});
