const path = require('node:path');
const dotenv = require('dotenv');
const {
  API_VERSION_PREFIX,
  AUTH_ROUTE_PREFIX,
  ADMIN_APPLICATION_OAUTH_CALLBACK_ROUTE,
} = require('../routes/admin-application-paths');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function parsePort(value, fallback, name) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }

  return port;
}

function parseBoolean(value, fallback, name) {
  if (value === undefined || value === '') {
    return fallback;
  }
  if (value.toLowerCase() === 'true') {
    return true;
  }
  if (value.toLowerCase() === 'false') {
    return false;
  }
  throw new Error(`${name} must be true or false.`);
}

const corsOrigins = (process.env.CORS_ORIGINS ||
  'http://localhost:8081,http://127.0.0.1:8081')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const adminApplicationApproverEmail = 'labadahub7@gmail.com';
const configuredAdminApproverEmail = process.env.ADMIN_APPLICATION_APPROVER_EMAIL
  ? process.env.ADMIN_APPLICATION_APPROVER_EMAIL.trim().toLowerCase()
  : adminApplicationApproverEmail;
if (configuredAdminApproverEmail !== adminApplicationApproverEmail) {
  throw new Error('ADMIN_APPLICATION_APPROVER_EMAIL must be the authorized LabadaHub mailbox.');
}

function parsePublicApiBaseUrl(value) {
  if (value === undefined || value === '') {
    return '';
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PUBLIC_API_BASE_URL must be an absolute HTTP or HTTPS URL.');
  }
  const isLoopbackHttp = url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!isLoopbackHttp && url.protocol !== 'https:') || url.search || url.hash) {
    throw new Error('PUBLIC_API_BASE_URL must be HTTPS (or local loopback HTTP) without a query or fragment.');
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function parseApprovalSecuritySecret(value) {
  if (value === undefined || value === '') {
    return '';
  }
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('ADMIN_APPLICATION_SECURITY_SECRET must be at least 32 bytes.');
  }
  return value;
}

function parseGoogleOAuthRedirectUri(value) {
  if (value === undefined || value === '') {
    return '';
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('GOOGLE_OAUTH_REDIRECT_URI must be an absolute HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) {
    throw new Error('GOOGLE_OAUTH_REDIRECT_URI must be HTTPS without credentials, a query, or a fragment.');
  }
  return url.href;
}

function getApiBaseUrl(baseUrl) {
  return baseUrl.endsWith(API_VERSION_PREFIX)
    ? baseUrl
    : `${baseUrl}${API_VERSION_PREFIX}`;
}

const publicApiBaseUrl = parsePublicApiBaseUrl(process.env.PUBLIC_API_BASE_URL);
const googleOAuthClientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
const googleOAuthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const googleOAuthRedirectUri = parseGoogleOAuthRedirectUri(process.env.GOOGLE_OAUTH_REDIRECT_URI);
const adminApplicationSecuritySecret = parseApprovalSecuritySecret(
  process.env.ADMIN_APPLICATION_SECURITY_SECRET,
);
const expectedGoogleOAuthRedirectUri = publicApiBaseUrl
  ? `${getApiBaseUrl(publicApiBaseUrl)}${AUTH_ROUTE_PREFIX}${ADMIN_APPLICATION_OAUTH_CALLBACK_ROUTE}`
  : '';
if (
  googleOAuthRedirectUri &&
  expectedGoogleOAuthRedirectUri &&
  googleOAuthRedirectUri !== expectedGoogleOAuthRedirectUri
) {
  throw new Error('GOOGLE_OAUTH_REDIRECT_URI must match the configured public API callback URL.');
}

module.exports = {
  port: parsePort(process.env.PORT, 5000, 'PORT'),
  corsOrigins,
  adminApplicationApproverEmail,
  publicApiBaseUrl,
  googleOAuthClientId,
  googleOAuthClientSecret,
  googleOAuthRedirectUri,
  adminApplicationSecuritySecret,
  adminApplicationApprovalConfigured: Boolean(
    publicApiBaseUrl &&
    googleOAuthClientId &&
    googleOAuthClientSecret &&
    googleOAuthRedirectUri &&
    adminApplicationSecuritySecret,
  ),
  database: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    name: process.env.DB_NAME,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parsePort(process.env.SMTP_PORT, 465, 'SMTP_PORT'),
    secure: parseBoolean(process.env.SMTP_SECURE, true, 'SMTP_SECURE'),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
  firstAdminEmail: process.env.FIRST_ADMIN_EMAIL
    ? process.env.FIRST_ADMIN_EMAIL.trim().toLowerCase()
    : '',
};
