'use strict';

// Minimal Redis client implementing just the commands this service needs
// (AUTH/PING/GET/SETEX) over a single-purpose TCP connection per command.
//
// Why hand-rolled instead of the `redis` npm package: the sample app stays
// dependency-free, so the image builds offline and the tests run against a real
// RESP server with no install step. Production services should use the
// official client, which adds pooling, reconnection and cluster support.

const net = require('net');

const DEFAULT_TIMEOUT_MS = 2000;

function encodeCommand(args) {
  const chunks = [Buffer.from(`*${args.length}\r\n`, 'utf8')];
  for (const arg of args) {
    const value = Buffer.isBuffer(arg) ? arg : Buffer.from(String(arg), 'utf8');
    chunks.push(Buffer.from(`$${value.length}\r\n`, 'utf8'), value, Buffer.from('\r\n', 'utf8'));
  }
  return Buffer.concat(chunks);
}

/**
 * Parse a single RESP reply from the head of `buffer`.
 * @returns {{value?: unknown, error?: Error, rest: Buffer}|null} null when incomplete
 */
function parseReply(buffer) {
  if (buffer.length === 0) return null;

  const type = buffer[0];
  const lineEnd = buffer.indexOf('\r\n');
  if (lineEnd === -1) return null;

  const line = buffer.subarray(1, lineEnd).toString('utf8');
  const rest = buffer.subarray(lineEnd + 2);

  switch (type) {
    case 0x2b: // '+', simple string
      return { value: line, rest };
    case 0x2d: { // '-', error
      const error = new Error(line);
      error.name = 'RedisError';
      return { error, rest };
    }
    case 0x3a: // ':', integer
      return { value: Number(line), rest };
    case 0x24: { // '$', bulk string
      const length = Number(line);
      if (length === -1) return { value: null, rest };
      const start = lineEnd + 2;
      const end = start + length;
      if (buffer.length < end + 2) return null;
      return { value: buffer.subarray(start, end).toString('utf8'), rest: buffer.subarray(end + 2) };
    }
    default:
      throw new Error(`unsupported Redis reply type: ${JSON.stringify(String.fromCharCode(type))}`);
  }
}

/**
 * @param {{host: string, port: number|string, password?: string, timeoutMs?: number}} options
 */
function createRedisClient({ host, port, password, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  // Send AUTH before the real command when a password is configured.
  const withAuth = (args) => (password === undefined ? [args] : [['AUTH', password], args]);

  async function run(commands) {
    const socket = net.createConnection({ host, port: Number(port) });
    socket.setNoDelay(true);

    let buffer = Buffer.alloc(0);
    const queue = [];
    let notify = null;
    let failure = null;

    const wake = () => {
      if (notify && (queue.length > 0 || failure)) {
        const resolve = notify;
        notify = null;
        resolve();
      }
    };

    const pump = () => {
      try {
        for (;;) {
          const parsed = parseReply(buffer);
          if (!parsed) break;
          buffer = parsed.rest;
          queue.push(parsed);
        }
      } catch (error) {
        failure = error;
      }
      wake();
    };

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      pump();
    });
    socket.on('error', (error) => {
      failure = error;
      wake();
    });
    socket.on('close', () => {
      if (!failure) failure = new Error('redis closed the connection before replying');
      wake();
    });

    const nextReply = () =>
      new Promise((resolve) => {
        if (queue.length > 0 || failure) {
          resolve();
          return;
        }
        notify = resolve;
      });

    const timer = setTimeout(() => {
      if (!failure) failure = new Error(`redis command timed out after ${timeoutMs}ms`);
      wake();
    }, timeoutMs);

    try {
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
      });

      const results = [];
      for (const command of commands) {
        socket.write(encodeCommand(command));
        await nextReply();
        if (queue.length === 0) throw failure || new Error('no reply from redis');
        const reply = queue.shift();
        if (reply.error) throw reply.error;
        results.push(reply.value);
      }
      return results;
    } finally {
      clearTimeout(timer);
      socket.destroy();
    }
  }

  const last = async (commands) => {
    const results = await run(commands);
    return results[results.length - 1];
  };

  return {
    /** @returns {Promise<boolean>} true when the server answered PONG */
    ping: async () => String(await last(withAuth(['PING']))).toUpperCase() === 'PONG',

    /** @returns {Promise<string|null>} null when the key does not exist */
    get: async (key) => last(withAuth(['GET', key])),

    /** @returns {Promise<boolean>} true when the server answered OK */
    setex: async (key, seconds, value) =>
      String(await last(withAuth(['SETEX', key, seconds, value]))).toUpperCase() === 'OK',
  };
}

module.exports = { createRedisClient, encodeCommand, parseReply };
