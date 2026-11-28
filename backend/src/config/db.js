const mysql = require('mysql2/promise');
const { database } = require('./env');

const REQUIRED_DATABASE_SETTINGS = ['host', 'port', 'user', 'name'];
const TARGET_DATABASE = 'labadahub';
let pool;

function getPool() {
  const missingSettings = REQUIRED_DATABASE_SETTINGS.filter((setting) => {
    const value = database[setting];
    return value === undefined || value === null || value === '';
  });

  if (database.password === undefined) {
    missingSettings.push('password');
  }

  if (missingSettings.length > 0) {
    const error = new Error('Database configuration is incomplete.');
    error.code = 'DB_CONFIG_MISSING';
    throw error;
  }

  const port = Number(database.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('DB_PORT must be an integer between 1 and 65535.');
    error.code = 'DB_CONFIG_INVALID';
    throw error;
  }

  if (database.name !== TARGET_DATABASE) {
    const error = new Error(`DB_NAME must be ${TARGET_DATABASE}.`);
    error.code = 'DB_NAME_MISMATCH';
    throw error;
  }

  if (!pool) {
    pool = mysql.createPool({
      host: database.host,
      port,
      user: database.user,
      password: database.password,
      database: database.name,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000,
      decimalNumbers: false,
      multipleStatements: false,
    });
  }

  return pool;
}

async function checkDatabaseHealth() {
  const connection = await getPool().getConnection();
  try {
    await connection.query('SELECT 1');
    return true;
  } finally {
    connection.release();
  }
}

module.exports = {
  query: (...args) => getPool().query(...args),
  getConnection: () => getPool().getConnection(),
  checkDatabaseHealth,
  end: async () => {
    if (pool) {
      await pool.end();
      pool = undefined;
    }
  },
};