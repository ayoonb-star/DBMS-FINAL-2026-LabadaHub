const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.ADMIN_APPLICATION_APPROVER_EMAIL = 'labadahub7@gmail.com';
process.env.PUBLIC_API_BASE_URL = 'https://api.example.test/api/v1';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI =
  'https://api.example.test/api/v1/auth/admin-applications/oauth/callback';
process.env.ADMIN_APPLICATION_SECURITY_SECRET = 'A'.repeat(64);

const googleOAuth = require('../src/services/google-approval-oauth');

test('builds a Google authorization URL with exact callback, PKCE, state, and nonce', () => {
  const authorizationUrl = new URL(googleOAuth.createAuthorizationUrl({
    state: 'test-state',
    nonce: 'test-nonce',
    codeChallenge: 'test-code-challenge',
  }));

  assert.equal(authorizationUrl.origin, 'https://accounts.google.com');
  assert.equal(authorizationUrl.pathname, '/o/oauth2/v2/auth');
  assert.equal(authorizationUrl.searchParams.get('client_id'), process.env.GOOGLE_OAUTH_CLIENT_ID);
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), process.env.GOOGLE_OAUTH_REDIRECT_URI);
  assert.equal(authorizationUrl.searchParams.get('response_type'), 'code');
  assert.equal(authorizationUrl.searchParams.get('scope'), 'openid email');
  assert.equal(authorizationUrl.searchParams.get('state'), 'test-state');
  assert.equal(authorizationUrl.searchParams.get('nonce'), 'test-nonce');
  assert.equal(authorizationUrl.searchParams.get('code_challenge'), 'test-code-challenge');
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorizationUrl.searchParams.get('prompt'), 'select_account');
});
