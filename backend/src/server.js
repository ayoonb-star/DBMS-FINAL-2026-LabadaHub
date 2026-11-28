const app = require('./app');
const { port } = require('./config/env');
const db = require('./config/db');

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`LabadaHub API listening on port ${port}`);
});

server.on('error', (error) => {
  console.error(`API server failed to start: ${error.code || error.name}`);
  process.exitCode = 1;
});

function shutdown() {
  server.close(() => {
    db.end().catch((error) => {
      console.error(`Database pool shutdown failed: ${error.code || error.name}`);
      process.exitCode = 1;
    });
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
