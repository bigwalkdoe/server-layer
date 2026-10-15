'use strict';

// Minimal RESP (REdis Serialization Protocol) test double.
//
// This is a *real* TCP server that speaks real RESP, not a stub of the client
// library. Tests therefore exercise the client's actual socket handling,
// framing and reply parsing.

const net = require('net');

function parseRequests(buf) {
  const commands = [];
  let i = 0;
  for (;;) {
    if (i >= buf.length || buf[i] !== 0x2a /* '*' */) break;
    const nl = buf.indexOf('\r\n', i);
    if (nl === -1) break;
    const argc = Number(buf.subarray(i + 1, nl).toString());
    if (!Number.isInteger(argc) || argc < 0) break;

    const args = [];
    let j = nl + 2;
    let complete = true;
    for (let k = 0; k < argc; k += 1) {
      if (j >= buf.length || buf[j] !== 0x24 /* '$' */) { complete = false; break; }
      const lenEnd = buf.indexOf('\r\n', j);
      if (lenEnd === -1) { complete = false; break; }
      const len = Number(buf.subarray(j + 1, lenEnd).toString());
      if (!Number.isInteger(len) || len < 0) { complete = false; break; }
      const start = lenEnd + 2;
      const end = start + len;
      if (end + 2 > buf.length) { complete = false; break; }
      args.push(buf.subarray(start, end).toString('utf8'));
      j = end + 2;
    }
    if (!complete) break;
    commands.push(args);
    i = j;
  }
  return { commands, rest: buf.subarray(i) };
}

// Default behaviour: enough of Redis to support the app's expectations.
function defaultHandler(store, password) {
  return (command) => {
    const [name, ...args] = command;
    switch (String(name).toUpperCase()) {
      case 'AUTH':
        if (password === undefined) return '-ERR Client sent AUTH, but no password is set\r\n';
        return args[0] === password ? '+OK\r\n' : '-ERR invalid password\r\n';
      case 'PING':
        if (password !== undefined && !store.authenticated) return '-NOAUTH Authentication required.\r\n';
        return '+PONG\r\n';
      case 'GET': {
        if (password !== undefined && !store.authenticated) return '-NOAUTH Authentication required.\r\n';
        const value = store.values.get(args[0]);
        if (value === undefined) return '$-1\r\n';
        return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
      }
      case 'SETEX': {
        if (password !== undefined && !store.authenticated) return '-NOAUTH Authentication required.\r\n';
        store.values.set(args[0], args[2]);
        store.expiries.set(args[0], Number(args[1]));
        return '+OK\r\n';
      }
      default:
        return `-ERR unknown command '${name}'\r\n`;
    }
  };
}

/**
 * Start a RESP-speaking server on an ephemeral port.
 * @param {(command: string[], index: number) => string|undefined} [handler]
 * @param {{password?: string}} [options]
 */
async function startFakeRedis(handler, options = {}) {
  const store = { values: new Map(), expiries: new Map(), authenticated: false };
  const requests = [];
  const sockets = new Set();
  const effective = handler
    || ((command) => {
      const reply = defaultHandler(store, options.password)(command);
      if (command[0].toUpperCase() === 'AUTH' && reply === '+OK\r\n') store.authenticated = true;
      return reply;
    });

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const { commands, rest } = parseRequests(buf);
      buf = rest;
      commands.forEach((command, index) => {
        requests.push(command);
        const reply = effective(command, index);
        if (typeof reply === 'string') socket.write(reply);
      });
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  return {
    port: server.address().port,
    requests,
    store,
    openSockets: () => sockets.size,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}

module.exports = { startFakeRedis, parseRequests };
