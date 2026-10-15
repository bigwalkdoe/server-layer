'use strict';

const net = require('net');

/** Start a TCP listener on an ephemeral port; stands in for a reachable peer. */
async function startTcpListener() {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}

/** Reserve a port and give it back, so we know nothing is listening on it. */
async function closedPort() {
  const listener = await startTcpListener();
  const { port } = listener;
  await listener.close();
  return port;
}

/** Poll until `predicate` is true or the deadline passes. */
async function waitUntil(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Swallow log output so test runs stay pristine. */
const silentLogger = { log() {}, error() {} };

module.exports = { startTcpListener, closedPort, waitUntil, silentLogger };
