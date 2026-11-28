const crypto = require('node:crypto');
const db = require('../config/db');
const {
  adminApplicationApproverEmail,
  adminApplicationApprovalConfigured,
  publicApiBaseUrl,
} = require('../config/env');
const adminApplicationController = require('./admin-application-controller');
const googleOAuth = require('../services/google-approval-oauth');
const {
  approvalTokenDigest,
  verifyActionSignature,
  signCookie,
  verifyCookie,
  readCookie,
  writeCookie,
  clearCookie,
} = require('../services/admin-application-approval-security');
const {
  API_VERSION_PREFIX,
  AUTH_ROUTE_PREFIX,
  ADMIN_APPLICATION_ACTION_ROUTE,
  ADMIN_APPLICATION_DECISION_ROUTE,
  ADMIN_APPLICATION_OAUTH_CALLBACK_ROUTE,
  ADMIN_APPLICATION_CONFIRMATION_ROUTE,
} = require('../routes/admin-application-paths');

const OAUTH_COOKIE_NAME = 'lh_admin_approval_oauth';
const SESSION_COOKIE_NAME = 'lh_admin_approval_session';
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;
const SESSION_COOKIE_MAX_AGE_SECONDS = 10 * 60;
const API_BASE_PATH = publicApiBaseUrl
  ? new URL(publicApiBaseUrl.endsWith(API_VERSION_PREFIX)
    ? publicApiBaseUrl
    : `${publicApiBaseUrl}${API_VERSION_PREFIX}`).pathname.replace(/\/+$/, '')
  : API_VERSION_PREFIX;
const AUTH_PREFIX_PATH = `${API_BASE_PATH}${AUTH_ROUTE_PREFIX}`;
const OAUTH_CALLBACK_PATH = `${AUTH_PREFIX_PATH}${ADMIN_APPLICATION_OAUTH_CALLBACK_ROUTE}`;
const ACTION_BASE_PATH = `${AUTH_PREFIX_PATH}${ADMIN_APPLICATION_ACTION_ROUTE}`;
const DECISION_PATH = `${AUTH_PREFIX_PATH}${ADMIN_APPLICATION_DECISION_ROUTE}`;
const CONFIRMATION_PATH = `${AUTH_PREFIX_PATH}${ADMIN_APPLICATION_CONFIRMATION_ROUTE}`;

function setPrivatePageHeaders(res, nonce) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': [
      "default-src 'none'",
      nonce ? `script-src 'nonce-${nonce}'` : '',
      "connect-src 'self'",
      "style-src 'unsafe-inline'",
      "form-action 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].filter(Boolean).join('; '),
  });
}

function page(title, content) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font-family:Arial,sans-serif;max-width:34rem;margin:10vh auto;padding:0 1.25rem;color:#202124}button{border:0;border-radius:4px;background:#188038;color:white;font-size:1rem;font-weight:bold;padding:.8rem 1.2rem;cursor:pointer}</style></head><body><main><h1>${title}</h1>${content}</main></body></html>`;
}

function genericError(res, status, message) {
  setPrivatePageHeaders(res);
  return res.status(status).type('html').send(page('LabadaHub Admin approval', `<p>${message}</p>`));
}

function getCookiePath(routePath) {
  return `${AUTH_PREFIX_PATH}${routePath}`;
}

function isSameOrigin(req) {
  if (!publicApiBaseUrl) {
    return false;
  }
  const expectedOrigin = new URL(publicApiBaseUrl).origin;
  return req.get('Origin') === expectedOrigin;
}

function makePkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier, 'utf8').digest('base64url');
}

function validDecision(value) {
  return value === 'approve' || value === 'decline';
}

function safeOAuthFailureCode(error) {
  const knownCodes = new Set([
    'access_denied',
    'invalid_client',
    'invalid_grant',
    'unauthorized_client',
    'GOOGLE_ID_TOKEN_MISSING',
  ]);
  return knownCodes.has(error && error.code) ? error.code : 'OAUTH_ERROR';
}

function safeFailureCode(error) {
  if (error && typeof error.code === 'string' && /^ER_[A-Z0-9_]{1,40}$/.test(error.code)) {
    return error.code;
  }
  return safeOAuthFailureCode(error);
}

function verifyApprovalSession(req) {
  const cookie = readCookie(req, SESSION_COOKIE_NAME);
  const session = verifyCookie(SESSION_COOKIE_NAME, cookie);
  if (
    !session ||
    session.email !== adminApplicationApproverEmail ||
    session.emailVerified !== true ||
    !Number.isInteger(Number(session.applicationId)) ||
    !validDecision(session.decision) ||
    typeof session.token !== 'string' ||
    !/^[A-Fa-f0-9]{64}$/.test(session.token) ||
    typeof session.csrfToken !== 'string' ||
    !/^[A-Za-z0-9_-]{40,}$/.test(session.csrfToken) ||
    !verifyActionSignature(
      session.applicationId,
      session.decision,
      session.token,
      session.signature,
    )
  ) {
    return null;
  }
  return session;
}

async function findPendingApplication(applicationId, token) {
  const [rows] = await db.query(
    `SELECT id, (approval_expires_at <= CURRENT_TIMESTAMP) AS is_expired
     FROM admin_applications
     WHERE approval_token_hash = ? AND id = ? AND status = 'pending_approval'
     LIMIT 1`,
    [approvalTokenDigest(token), applicationId],
  );
  return rows[0] || null;
}

async function renderActionPage(req, res) {
  const { applicationId, decision } = req.params;
  if (!/^[1-9]\d*$/.test(applicationId) || !validDecision(decision)) {
    return genericError(res, 404, 'This approval action is unavailable.');
  }
  const nonce = crypto.randomBytes(18).toString('base64');
  const startUrl = `${ACTION_BASE_PATH}/${applicationId}/${decision}/start`;
  setPrivatePageHeaders(res, nonce);
  return res.type('html').send(page(
    'Continue to LabadaHub Admin approval',
    `<p>Sign in with the authorized LabadaHub approver account to confirm this action.</p>
     <p id="approval-status">Preparing secure sign-in...</p>
     <script nonce="${nonce}">
       (async () => {
         const status = document.getElementById('approval-status');
         const fragment = new URLSearchParams(window.location.hash.slice(1));
         const token = fragment.get('token') || '';
         const signature = fragment.get('signature') || '';
         window.history.replaceState(null, '', window.location.pathname);
         if (!/^[A-Fa-f0-9]{64}$/.test(token) || !/^[A-Fa-f0-9]{64}$/.test(signature)) {
           status.textContent = 'This approval link is invalid or expired.';
           return;
         }
         try {
           const response = await fetch(${JSON.stringify(startUrl)}, {
             method: 'POST',
             credentials: 'same-origin',
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify({token, signature})
           });
           const result = await response.json();
           if (!response.ok || typeof result.authorizationUrl !== 'string') {
             throw new Error('Sign-in could not be started.');
           }
           const authUrl = new URL(result.authorizationUrl);
           if (authUrl.origin !== 'https://accounts.google.com') {
             throw new Error('Sign-in could not be started.');
           }
           window.location.replace(authUrl.href);
         } catch {
           status.textContent = 'Secure sign-in could not be started. Please reopen the email action.';
         }
       })();
     </script>`,
  ));
}

async function startOAuthFlow(req, res) {
  if (!adminApplicationApprovalConfigured || !googleOAuth.isConfigured()) {
    return res.status(503).json({ message: 'Admin application approval is not configured.' });
  }
  if (!isSameOrigin(req)) {
    return res.status(403).json({ message: 'This approval action is not authorized.' });
  }

  const applicationId = Number(req.params.applicationId);
  const { decision } = req.params;
  const { token, signature } = req.body || {};
  if (
    !Number.isSafeInteger(applicationId) ||
    applicationId < 1 ||
    !validDecision(decision) ||
    typeof token !== 'string' ||
    !/^[A-Fa-f0-9]{64}$/.test(token) ||
    !verifyActionSignature(applicationId, decision, token, signature)
  ) {
    return res.status(410).json({ message: 'This approval action is invalid or expired.' });
  }

  try {
    const application = await findPendingApplication(applicationId, token);
    if (!application || Number(application.is_expired) === 1) {
      return res.status(410).json({ message: 'This approval action is invalid or expired.' });
    }

    const state = crypto.randomBytes(32).toString('base64url');
    const nonce = crypto.randomBytes(32).toString('base64url');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const authorizationUrl = await googleOAuth.createAuthorizationUrl({
      state,
      nonce,
      codeChallenge: makePkceChallenge(codeVerifier),
    });
    const payload = {
      applicationId,
      decision,
      token: token.toUpperCase(),
      signature: signature.toUpperCase(),
      state,
      nonce,
      codeVerifier,
      expiresAt: Date.now() + OAUTH_COOKIE_MAX_AGE_SECONDS * 1000,
    };
    writeCookie(
      res,
      OAUTH_COOKIE_NAME,
      signCookie(OAUTH_COOKIE_NAME, payload),
      OAUTH_CALLBACK_PATH,
      OAUTH_COOKIE_MAX_AGE_SECONDS,
    );
    return res.json({ authorizationUrl });
  } catch (error) {
    console.error('Admin application OAuth initiation failed.', {
      code: safeFailureCode(error),
    });
    return res.status(503).json({ message: 'Secure sign-in could not be started.' });
  }
}

async function handleOAuthCallback(req, res) {
  if (!adminApplicationApprovalConfigured || !googleOAuth.isConfigured()) {
    clearCookie(res, OAUTH_COOKIE_NAME, OAUTH_CALLBACK_PATH);
    return genericError(res, 503, 'Admin application approval is not configured.');
  }
  const flow = verifyCookie(OAUTH_COOKIE_NAME, readCookie(req, OAUTH_COOKIE_NAME));
  clearCookie(res, OAUTH_COOKIE_NAME, OAUTH_CALLBACK_PATH);
  if (
    !flow ||
    typeof req.query.state !== 'string' ||
    req.query.state !== flow.state ||
    typeof req.query.code !== 'string' ||
    !validDecision(flow.decision) ||
    !verifyActionSignature(flow.applicationId, flow.decision, flow.token, flow.signature)
  ) {
    return genericError(res, 403, 'Google sign-in could not be verified. Reopen the email action.');
  }

  try {
    const idToken = await googleOAuth.exchangeAuthorizationCode(req.query.code, flow.codeVerifier);
    const identity = await googleOAuth.verifyIdentity(idToken);
    if (
      identity.emailVerified !== true ||
      identity.email !== adminApplicationApproverEmail ||
      identity.nonce !== flow.nonce
    ) {
      return genericError(res, 403, 'Sign in with the configured, verified approver account.');
    }

    const session = {
      applicationId: Number(flow.applicationId),
      decision: flow.decision,
      token: flow.token,
      signature: flow.signature,
      email: identity.email,
      emailVerified: true,
      csrfToken: crypto.randomBytes(32).toString('base64url'),
      expiresAt: Date.now() + SESSION_COOKIE_MAX_AGE_SECONDS * 1000,
    };
    writeCookie(
      res,
      SESSION_COOKIE_NAME,
      signCookie(SESSION_COOKIE_NAME, session),
      getCookiePath('/admin-applications'),
      SESSION_COOKIE_MAX_AGE_SECONDS,
    );
    setPrivatePageHeaders(res);
    return res.redirect(303, CONFIRMATION_PATH);
  } catch (error) {
    console.error('Admin application OAuth callback failed.', {
      code: safeOAuthFailureCode(error),
    });
    return genericError(res, 403, 'Google sign-in could not be verified. Reopen the email action.');
  }
}

async function renderConfirmationPage(req, res) {
  if (!adminApplicationApprovalConfigured) {
    return genericError(res, 503, 'Admin application approval is not configured.');
  }
  const session = verifyApprovalSession(req);
  if (!session) {
    return genericError(res, 401, 'Sign in with the authorized approver account to continue.');
  }
  try {
    const application = await findPendingApplication(session.applicationId, session.token);
    if (!application || Number(application.is_expired) === 1) {
      clearCookie(res, SESSION_COOKIE_NAME, getCookiePath('/admin-applications'));
      return genericError(res, 410, 'This approval action is invalid or expired.');
    }
    const action = session.decision === 'approve' ? 'APPROVE' : 'DECLINE';
    setPrivatePageHeaders(res);
    return res.type('html').send(page(
      `Confirm ${action}`,
      `<p>You are signed in as the authorized approver.</p>
       <form method="post" action="${DECISION_PATH}">
         <input type="hidden" name="csrfToken" value="${session.csrfToken}">
         <button type="submit">CONFIRM ${action}</button>
       </form>`,
    ));
  } catch (error) {
    console.error('Admin application approval confirmation check failed.', {
      code: safeFailureCode(error),
    });
    return genericError(res, 503, 'The approval action could not be checked. Please try again.');
  }
}

function equalSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') {
    return false;
  }
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function submitDecision(req, res, next) {
  if (!req.is('application/x-www-form-urlencoded')) {
    return genericError(res, 415, 'Submit this approval action using the confirmation form.');
  }
  if (!adminApplicationApprovalConfigured || !isSameOrigin(req)) {
    return genericError(res, 403, 'This approval action is not authorized.');
  }
  const session = verifyApprovalSession(req);
  if (!session || !equalSecret(req.body && req.body.csrfToken, session.csrfToken)) {
    return genericError(res, 403, 'This approval action is invalid or expired.');
  }

  clearCookie(res, SESSION_COOKIE_NAME, getCookiePath('/admin-applications'));
  req.body = {
    token: session.token,
    decision: session.decision === 'decline' ? 'reject' : 'approve',
  };
  res.json = () => {
    const status = res.statusCode;
    const message = status === 410
      ? 'This approval action is invalid or expired.'
      : status >= 500
        ? 'The decision could not be completed. Please contact support.'
        : status === 502
          ? 'The decision was recorded, but the applicant notification could not be submitted.'
          : 'Decision recorded. Any required applicant verification will be sent separately.';
    setPrivatePageHeaders(res);
    return res.status(status).type('html').send(page('LabadaHub Admin approval', `<p>${message}</p>`));
  };
  req.adminApprovalFlow = true;
  return adminApplicationController.decideAdminApplication(req, res, next);
}

module.exports = {
  renderActionPage,
  startOAuthFlow,
  handleOAuthCallback,
  renderConfirmationPage,
  submitDecision,
};
