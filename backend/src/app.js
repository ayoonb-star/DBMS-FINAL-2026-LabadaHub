const express = require('express');
const cors = require('cors');
const {
  corsOrigins,
  publicApiBaseUrl,
} = require('./config/env');
const {
  API_VERSION_PREFIX,
  AUTH_ROUTE_PREFIX,
} = require('./routes/admin-application-paths');
const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');
const notFound = require('./middleware/not-found');
const errorHandler = require('./middleware/error-handler');

const app = express();
const allowedOrigins = new Set(corsOrigins);

app.disable('x-powered-by');
app.use(cors((req, callback) => {
  const origin = req.get('Origin');
  const apiOrigin = publicApiBaseUrl ? new URL(publicApiBaseUrl).origin : '';
  const isAllowed = !origin ||
    allowedOrigins.has(origin) ||
    origin === apiOrigin;

  if (!isAllowed) {
    const error = new Error('Origin is not allowed by CORS.');
    error.code = 'CORS_ORIGIN_DENIED';
    error.status = 403;
    return callback(error);
  }

  callback(null, {
    origin: origin || false,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}));
app.use(express.json({ limit: '1mb' }));

app.use(`${API_VERSION_PREFIX}${AUTH_ROUTE_PREFIX}`, authRoutes);
app.use(API_VERSION_PREFIX, healthRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
