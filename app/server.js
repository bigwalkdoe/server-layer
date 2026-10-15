'use strict';

const http = require('http');

const { createRedisClient } = require('./lib/redis');
const { probeTcp } = require('./lib/probe');

const CACHE_KEY = 'server-layer:api-data';

function configFromEnv(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    db: {
      host: env.DB_HOST || 'postgres',
      port: Number(env.DB_PORT || 5432),
    },
    redis: {
      host: env.REDIS_HOST || 'redis',
      port: Number(env.REDIS_PORT || 6379),
      password: env.REDIS_PASSWORD || undefined,
    },
    cacheTtlSeconds: Number(env.CACHE_TTL_SECONDS || 30),
    probeTimeoutMs: Number(env.PROBE_TIMEOUT_MS || 1000),
  };
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

/**
 * @param {ReturnType<typeof configFromEnv>} config
 * @param {{logger?: {log?: Function, error?: Function}|null}} [options]
 * @returns {http.Server}
 */
function createServer(config, { logger = console } = {}) {
  const redis = createRedisClient(config.redis);

  const writeLog = (level, record) => {
    if (!logger) return;
    const line = JSON.stringify(record);
    if (level === 'error' && typeof logger.error === 'function') logger.error(line);
    else if (typeof logger.log === 'function') logger.log(line);
  };

  // /api/info and /ready report observed reachability, not configuration.
  const checkDependencies = async () => {
    const [postgres, redisOk] = await Promise.all([
      probeTcp(config.db.host, config.db.port, config.probeTimeoutMs),
      redis.ping().then(() => true, () => false),
    ]);
    return { postgres, redis: redisOk };
  };

  // A cache outage must degrade to an uncached response, never a 5xx.
  const readCache = async (key) => {
    try {
      const stored = await redis.get(key);
      return stored === null ? { hit: false, value: null } : { hit: true, value: JSON.parse(stored) };
    } catch (error) {
      return { hit: false, value: null, error };
    }
  };

  const writeCache = async (key, value) => {
    try {
      await redis.setex(key, config.cacheTtlSeconds, JSON.stringify(value));
      return null;
    } catch (error) {
      return error;
    }
  };

  const routes = {
    '/health': {
      // Liveness only: if this process can answer, it is alive.
      handler: async () => ({
        status: 200,
        body: { status: 'ok', uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() },
      }),
    },

    '/ready': {
      // Readiness: can this instance actually serve traffic?
      handler: async () => {
        const checks = await checkDependencies();
        const ready = Object.values(checks).every(Boolean);
        return { status: ready ? 200 : 503, body: { ready, checks, timestamp: new Date().toISOString() } };
      },
    },

    '/api/info': {
      handler: async () => {
        const checks = await checkDependencies();
        return {
          status: 200,
          body: {
            message: 'Server Layer Application',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || null,
            database: { host: config.db.host, port: config.db.port, reachable: checks.postgres },
            redis: { host: config.redis.host, port: config.redis.port, reachable: checks.redis },
          },
        };
      },
    },

    '/api/data': {
      handler: async () => {
        const cached = await readCache(CACHE_KEY);
        if (cached.hit) {
          return {
            status: 200,
            body: { ...cached.value, cached: true, redis: 'ok', timestamp: new Date().toISOString() },
          };
        }

        const payload = {
          message: 'Hello from Server Layer!',
          random: Math.random(),
          generatedAt: new Date().toISOString(),
        };
        const writeError = await writeCache(CACHE_KEY, payload);

        return {
          status: 200,
          body: {
            ...payload,
            cached: false,
            redis: writeError ? 'unavailable' : 'ok',
            timestamp: new Date().toISOString(),
          },
        };
      },
    },
  };

  return http.createServer((req, res) => {
    const startedAt = process.hrtime.bigint();
    const path = new URL(req.url, 'http://localhost').pathname;
    const route = Object.prototype.hasOwnProperty.call(routes, path) ? routes[path] : null;

    const finish = (status) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      writeLog('info', {
        time: new Date().toISOString(),
        method: req.method,
        path,
        status,
        durationMs: Number(durationMs.toFixed(2)),
        remoteAddress: req.socket.remoteAddress,
      });
    };

    if (!route) {
      finish(404);
      sendJson(res, 404, { error: 'not_found', path });
      return;
    }

    if (req.method !== 'GET') {
      finish(405);
      sendJson(res, 405, { error: 'method_not_allowed', method: req.method }, { Allow: 'GET' });
      return;
    }

    route.handler().then(
      ({ status, body }) => {
        finish(status);
        sendJson(res, status, body);
      },
      (error) => {
        writeLog('error', { time: new Date().toISOString(), path, error: error.message, stack: error.stack });
        finish(500);
        sendJson(res, 500, { error: 'internal_error' });
      },
    );
  });
}

if (require.main === module) {
  const config = configFromEnv();
  const server = createServer(config);

  server.listen(config.port, () => {
    console.log(JSON.stringify({
      time: new Date().toISOString(),
      message: 'server listening',
      port: config.port,
      db: `${config.db.host}:${config.db.port}`,
      redis: `${config.redis.host}:${config.redis.port}`,
    }));
  });

  const shutdown = (signal) => {
    console.log(JSON.stringify({ time: new Date().toISOString(), message: `received ${signal}, shutting down` }));
    server.close(() => process.exit(0));
    // Don't hang forever on a stuck keep-alive connection.
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { createServer, configFromEnv, CACHE_KEY };
