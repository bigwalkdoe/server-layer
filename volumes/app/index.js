const http = require('http');

const PORT = process.env.PORT || 3000;

// Simple HTTP server without external dependencies
const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString()
    }));
  } else if (req.url === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Server Layer Application',
      timestamp: new Date().toISOString(),
      database: { status: 'configured', host: process.env.DB_HOST },
      redis: { status: 'configured', host: process.env.REDIS_HOST }
    }));
  } else if (req.url === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Hello from Server Layer!',
      timestamp: new Date().toISOString(),
      random: Math.random()
    }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
      <head><title>Server Layer App</title></head>
      <body>
      <h1>Server Layer Application</h1>
      <p>Status: Running</p>
      <p>Endpoints:</p>
      <ul>
      <li><a href="/health">/health</a></li>
      <li><a href="/api/info">/api/info</a></li>
      <li><a href="/api/data">/api/data</a></li>
      </ul>
      </body>
      </html>
    `);
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
