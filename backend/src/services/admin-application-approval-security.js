const crypto = require('node:crypto');
const { adminApplicationSecuritySecret } = require('../config/env');

function approvalTokenDigest(token) {
  return crypto.createHash('sha256').update(token.trim().toUpperCase(), 'utf8').digest('hex');
}

function hmac(scope, value, encoding = 'hex') {
  if (!adminApplicationSecuritySecret) {
    throw new Error('Admin application approval security is not configured.');
  }
  return crypto.createHmac('sha256', adminApplicationSecuritySecret)
    .update(`${scope}:${value}`, 'utf8')
    .digest(encoding);
}

function createActionSignature(applicationId, decision, token) {
  return hmac(
    'admin-application-action-v1',
    `${applicationId}:${decision}:${token.trim().toUpperCase()}`,
  );
}

function verifyActionSignature(applicationId, decision, token, signature) {
  if (typeof signature !== 'string' || !/^[A-Fa-f0-9]{64}$/.test(signature)) {
    return false;
  }
  const expected = Buffer.from(createActionSignature(applicationId, decision, token), 'hex');
  const actual = Buffer.from(signature, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function signCookie(name, payload) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${hmac(`cookie-${name}`, encoded, 'base64url')}`;
}

function verifyCookie(name, value) {
  if (typeof value !== 'string') {
    return null;
  }
  const separator = value.lastIndexOf('.');
  if (separator <= 0) {
    return null;
  }
  const encoded = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  const expectedSignature = hmac(`cookie-${name}`, encoded, 'base64url');
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return payload && Number(payload.expiresAt) > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (typeof header !== 'string') {
    return null;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }
    return part.slice(separator + 1).trim();
  }
  return null;
}

function writeCookie(res, name, value, path, maxAge) {
  res.append(
    'Set-Cookie',
    `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
  );
}

function clearCookie(res, name, path) {
  writeCookie(res, name, '', path, 0);
}

module.exports = {
  approvalTokenDigest,
  createActionSignature,
  verifyActionSignature,
  signCookie,
  verifyCookie,
  readCookie,
  writeCookie,
  clearCookie,
};
