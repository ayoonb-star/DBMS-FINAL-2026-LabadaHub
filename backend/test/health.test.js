const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');

process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');

const app = require('../src/app');
const db = require('../src/config/db');

let server;
let baseUrl;

async function getHealth() {
  const response = await fetch(`${baseUrl}/api/v1/health`);
  return { status: response.status, body: await response.json() };
}

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  db.checkDatabaseHealth = async () => true;
});

test('reports healthy when the shared database health check succeeds', async () => {
  const response = await getHealth();

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    status: 'ok',
    server: 'up',
    database: 'up',
  });
});

test('reports degraded when the database health check fails', async () => {
  db.checkDatabaseHealth = async () => {
    const error = new Error('Database configuration is incomplete.');
    error.code = 'DB_CONFIG_MISSING';
    throw error;
  };

  const response = await getHealth();

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    status: 'degraded',
    server: 'up',
    database: 'down',
    reason: 'configuration_missing',
  });
});
