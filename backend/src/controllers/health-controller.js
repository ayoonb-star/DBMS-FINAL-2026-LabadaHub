const db = require('../config/db');

function getFailureReason(error) {
  if (error.code === 'DB_CONFIG_MISSING') {
    return 'configuration_missing';
  }
  if (error.code === 'DB_CONFIG_INVALID') {
    return 'configuration_invalid';
  }
  if (error.code === 'DB_NAME_MISMATCH') {
    return 'database_target_mismatch';
  }
  if (error.code === 'ER_BAD_DB_ERROR') {
    return 'database_not_found';
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    return 'mysql_unavailable';
  }
  return 'connection_failed';
}

async function getHealth(_req, res) {
  try {
    await db.checkDatabaseHealth();
    return res.status(200).json({
      status: 'ok',
      server: 'up',
      database: 'up',
    });
  } catch (error) {
    const reason = getFailureReason(error);
    console.error(`Database health check failed: ${reason}`);
    return res.status(503).json({
      status: 'degraded',
      server: 'up',
      database: 'down',
      reason,
    });
  }
}

module.exports = { getHealth };
