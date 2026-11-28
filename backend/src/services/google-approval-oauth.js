const { OAuth2Client } = require('google-auth-library');
const {
  adminApplicationApprovalConfigured,
  googleOAuthClientId,
  googleOAuthClientSecret,
  googleOAuthRedirectUri,
} = require('../config/env');

let client;

function isConfigured() {
  return adminApplicationApprovalConfigured;
}

function getClient() {
  if (!isConfigured()) {
    throw new Error('Admin application Google OAuth is not configured.');
  }
  if (!client) {
    client = new OAuth2Client(
      googleOAuthClientId,
      googleOAuthClientSecret,
      googleOAuthRedirectUri,
    );
  }
  return client;
}

function createAuthorizationUrl({ state, nonce, codeChallenge }) {
  return getClient().generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    response_type: 'code',
    scope: ['openid', 'email'],
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
}

async function exchangeAuthorizationCode(code, codeVerifier) {
  const { tokens } = await getClient().getToken({
    code,
    codeVerifier,
    redirect_uri: googleOAuthRedirectUri,
  });
  if (!tokens.id_token) {
    const error = new Error('Google did not return an ID token.');
    error.code = 'GOOGLE_ID_TOKEN_MISSING';
    throw error;
  }
  return tokens.id_token;
}

async function verifyIdentity(idToken) {
  const ticket = await getClient().verifyIdToken({
    idToken,
    audience: googleOAuthClientId,
  });
  const payload = ticket.getPayload();
  return {
    email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '',
    emailVerified: payload.email_verified === true,
    nonce: typeof payload.nonce === 'string' ? payload.nonce : '',
  };
}

module.exports = {
  isConfigured,
  createAuthorizationUrl,
  exchangeAuthorizationCode,
  verifyIdentity,
};
