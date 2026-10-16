'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startFakeRedis } = require('./helpers/fake-redis');
const { closedPort, startTcpListener, silentLogger } = require('./helpers/net');
const { createServer, configFromEnv } = require('../server');

async function startApp(t, options = {}) {
  const fakeRedis = await startFakeRedis(undefined, { password: options.redisPassword });
  const postgres = await startTcpListener();

  const server = createServer({
    db: { host: '127.0.0.1', port: postgres.port },
    redis: { host: '127.0.0.1', port: fakeRedis.port, password: options.redisPassword },
    cacheTtlSeconds: 30,
    probeTimeoutMs: 500,
  }, { logger: silentLogger });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  t.after(async () => {
    server.closeAllConnections?.();
    await Promise.all([
      new Promise((resolve) => server.close(resolve)),
      fakeRedis.close(),
      postgres.close(),
    ]);
  });

  return { base: `http://127.0.0.1:${server.address().port}`, fakeRedis, postgres };
}

test('GET /health reports ok without consulting any dependency', async (t) => {
  const { base, fakeRedis } = await startApp(t);

  const response = await fetch(`${base}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(fakeRedis.requests, [], 'liveness must not touch Redis');
});

test('GET /health stays 200 when every dependency is down', async (t) => {
  const port = await closedPort();
  const server = createServer({
    db: { host: '127.0.0.1', port },
    redis: { host: '127.0.0.1', port },
    cacheTtlSeconds: 30,
    probeTimeoutMs: 300,
  }, { logger: silentLogger });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);

  assert.equal(response.status, 200);
});

test('GET /ready is 200 when every dependency is reachable', async (t) => {
  const { base } = await startApp(t);

  const response = await fetch(`${base}/ready`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ready, true);
  assert.deepEqual(body.checks, { postgres: true, redis: true });
});

test('GET /ready is 503 and names the failing dependency when Redis is down', async (t) => {
  const { base, fakeRedis } = await startApp(t);
  await fakeRedis.close();

  const response = await fetch(`${base}/ready`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.ready, false);
  assert.deepEqual(body.checks, { postgres: true, redis: false });
});

test('GET /ready is 503 when PostgreSQL is down', async (t) => {
  const { base, postgres } = await startApp(t);
  await postgres.close();

  const response = await fetch(`${base}/ready`);

  assert.equal(response.status, 503);
  assert.deepEqual((await response.json()).checks, { postgres: false, redis: true });
});

test('GET /api/info reports real dependency reachability', async (t) => {
  const { base } = await startApp(t);

  const body = await (await fetch(`${base}/api/info`)).json();

  assert.equal(body.database.reachable, true);
  assert.equal(body.redis.reachable, true);
  assert.equal(body.database.host, '127.0.0.1');
});

test('GET /api/info reports unmet dependencies as unreachable', async (t) => {
  const { base, postgres, fakeRedis } = await startApp(t);
  await postgres.close();
  await fakeRedis.close();

  const body = await (await fetch(`${base}/api/info`)).json();

  assert.equal(body.database.reachable, false);
  assert.equal(body.redis.reachable, false);
});

test('GET /api/data generates a fresh payload on a cache miss', async (t) => {
  const { base } = await startApp(t);

  const response = await fetch(`${base}/api/data`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.cached, false);
  assert.equal(body.message, 'Hello from Spectre Server Layer!');
  assert.equal(typeof body.random, 'number');
});

test('GET /api/data is served from the cache on the second request', async (t) => {
  const { base } = await startApp(t);

  const first = await (await fetch(`${base}/api/data`)).json();
  const second = await (await fetch(`${base}/api/data`)).json();

  assert.equal(second.cached, true, 'second request should hit the cache');
  assert.equal(second.random, first.random, 'cached payload must be identical');
});

test('GET /api/data still succeeds when Redis is unavailable', async (t) => {
  const { base, fakeRedis } = await startApp(t);
  await fakeRedis.close();

  const response = await fetch(`${base}/api/data`);
  const body = await response.json();

  assert.equal(response.status, 200, 'a cache outage must not take the endpoint down');
  assert.equal(body.cached, false);
  assert.equal(body.redis, 'unavailable');
});

test('unknown paths return a JSON 404', async (t) => {
  const { base } = await startApp(t);

  const response = await fetch(`${base}/nope`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error, 'not_found');
});

test('unsupported methods return 405 with an Allow header', async (t) => {
  const { base } = await startApp(t);

  const response = await fetch(`${base}/health`, { method: 'POST' });

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});

test('configFromEnv applies defaults and reads overrides', () => {
  const defaults = configFromEnv({});

  assert.equal(defaults.port, 3000);
  assert.deepEqual(defaults.db, { host: 'postgres', port: 5432 });
  assert.deepEqual(defaults.redis, { host: 'redis', port: 6379, password: undefined });

  const overridden = configFromEnv({
    PORT: '4000',
    DB_HOST: 'db.internal',
    DB_PORT: '5433',
    REDIS_HOST: 'cache',
    REDIS_PORT: '6380',
    REDIS_PASSWORD: 'hunter2',
    CACHE_TTL_SECONDS: '60',
  });

  assert.equal(overridden.port, 4000);
  assert.deepEqual(overridden.db, { host: 'db.internal', port: 5433 });
  assert.deepEqual(overridden.redis, { host: 'cache', port: 6380, password: 'hunter2' });
  assert.equal(overridden.cacheTtlSeconds, 60);
});
