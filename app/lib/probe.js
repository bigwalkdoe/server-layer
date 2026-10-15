'use strict';

const net = require('net');

/**
 * Is anything accepting TCP connections at host:port?
 *
 * This is a reachability probe, not an authentication check: a successful
 * connect proves the peer is up and listening, but not that our credentials
 * are valid. Never rejects.
 *
 * @returns {Promise<boolean>}
 */
function probeTcp(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;

    const done = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    const socket = net.createConnection({ host, port: Number(port) });
    timer = setTimeout(() => done(false), timeoutMs);

    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

module.exports = { probeTcp };
