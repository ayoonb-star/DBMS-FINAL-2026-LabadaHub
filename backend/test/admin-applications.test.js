const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.FIRST_ADMIN_EMAIL = 'justinaceejay08@gmail.com';
process.env.ADMIN_APPLICATION_APPROVER_EMAIL = 'labadahub7@gmail.com';
process.env.PUBLIC_API_BASE_URL = 'https://api.example.test';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI =
  'https://api.example.test/api/v1/auth/admin-applications/oauth/callback';
process.env.ADMIN_APPLICATION_SECURITY_SECRET = crypto.randomBytes(32).toString('hex');
process.env.CORS_ORIGINS = 'https://api.example.test,http://localhost:8081';

const app = require('../src/app');
const db = require('../src/config/db');
const { adminApplicationApproverEmail } = require('../src/config/env');
const emailService = require('../src/services/email-service');
const googleOAuth = require('../src/services/google-approval-oauth');
const { createActionSignature } = require('../src/services/admin-application-approval-security');

const APPROVER_EMAIL = 'labadahub7@gmail.com';
const users = [];
const authenticatedUsers = [];
const applications = [];
const bootstrapState = {};
let nextUserId = 1;
let nextApplicationId = 1;
let nextAuthenticatedUserId = 1000;
let server;
let baseUrl;
let nextRequestIp = 1;
let sentApprovalRequests = [];
let sentVerificationCodes = [];
let sentRejections = [];
let failApprovalEmail = false;
let failVerificationEmail = false;
let failRejectionEmail = false;
let transactionQueue = Promise.resolve();
let oauthIdentity = {
  email: 'labadahub7@gmail.com',
  emailVerified: true,
};
let oauthFailure;

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function createConnection() {
  return {
    async beginTransaction() {
      const previousTransaction = transactionQueue;
      let releaseTransaction;
      transactionQueue = new Promise((resolve) => {
        releaseTransaction = resolve;
      });
      await previousTransaction;
      this.releaseTransaction = releaseTransaction;
    },
    async commit() {
      if (this.releaseTransaction) {
        this.releaseTransaction();
        this.releaseTransaction = null;
      }
    },
    async rollback() {
      if (this.releaseTransaction) {
        this.releaseTransaction();
        this.releaseTransaction = null;
      }
    },
    release() {},
    async query(sql, values = []) {
      const statement = normalizeSql(sql);

      if (statement.includes('from first_admin_bootstrap_state')) {
        return [[{
          singleton_id: 1,
          verification_code_hash: bootstrapState.verificationCodeHash,
          verification_expires_at: bootstrapState.verificationExpiresAt,
          failed_attempts: bootstrapState.failedAttempts,
          completed_at: bootstrapState.completedAt,
          admin_user_id: bootstrapState.adminUserId,
          is_expired: 0,
          is_rate_limited: 0,
        }], []];
      }

      if (statement.startsWith('select id, full_name, email, phone, role from users where id = ?')) {
        const user = authenticatedUsers.find((item) =>
          String(item.id) === String(values[0]) && item.is_active,
        );
        return [user ? [{
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        }] : [], []];
      }

      if (statement.startsWith('select id from users where email = ?')) {
        return [users.filter((user) => user.email === values[0]).map(({ id }) => ({ id })), []];
      }

      if (
        statement.includes('from admin_applications') &&
        statement.includes('where id = ?') &&
        statement.includes('for update')
      ) {
        const application = applications.find((item) => item.id === Number(values[0]));
        return [application ? [{
          id: application.id,
          full_name: application.fullName,
          email: application.email,
          status: application.status,
        }] : [], []];
      }

      if (statement.includes('from admin_applications') && statement.includes('where active_email = ?')) {
        const application = applications.find((item) =>
          ['pending_approval', 'pending_verification'].includes(item.status) &&
          item.email === values[0],
        );
        const expired = application && (
          application.status === 'pending_approval'
            ? application.approvalExpiresAt <= Date.now()
            : application.verificationDeadlineAt <= Date.now()
        );
        return [application ? [{
          id: application.id,
          status: application.status,
          is_expired: expired ? 1 : 0,
        }] : [], []];
      }

      if (
        statement.includes('from admin_applications') &&
        statement.includes('where email = ?') &&
        statement.includes('order by id desc')
      ) {
        const latest = applications
          .filter((item) => item.email === values[0])
          .sort((left, right) => right.id - left.id)[0];
        return [latest ? [{
          id: latest.id,
          is_rate_limited: Date.now() - latest.createdAt < 60_000 ? 1 : 0,
        }] : [], []];
      }

      if (
        statement.includes('from admin_applications') &&
        statement.includes('where approval_token_hash = ?')
      ) {
        const application = applications.find((item) =>
          item.approvalTokenHash === values[0] && item.status === 'pending_approval',
        );
        return [application ? [{
          id: application.id,
          full_name: application.fullName,
          email: application.email,
          is_expired: application.approvalExpiresAt <= Date.now() ? 1 : 0,
        }] : [], []];
      }

      if (
        statement.includes('from admin_applications') &&
        statement.includes("where email = ? and status = 'pending_verification'")
      ) {
        const application = applications.find((item) =>
          item.email === values[0] && item.status === 'pending_verification',
        );
        if (!application) {
          return [[], []];
        }
        if (statement.includes('verification_last_sent_at >')) {
          return [[{
            id: application.id,
            email: application.email,
            is_deadline_expired: application.verificationDeadlineAt <= Date.now() ? 1 : 0,
            is_rate_limited: Date.now() - application.verificationLastSentAt < 60_000 ? 1 : 0,
            verification_resend_count: application.verificationResendCount,
          }], []];
        }
        return [[{
          id: application.id,
          full_name: application.fullName,
          email: application.email,
          password_hash: application.passwordHash,
          verification_code_hash: application.verificationCodeHash,
          verification_failed_attempts: application.verificationFailedAttempts,
          is_code_expired: application.verificationExpiresAt !== null &&
            application.verificationExpiresAt <= Date.now() ? 1 : 0,
          is_deadline_expired: application.verificationDeadlineAt <= Date.now() ? 1 : 0,
        }], []];
      }

      if (statement.startsWith('insert into admin_applications')) {
        const [fullName, email, passwordHash, approvalTokenHash] = values;
        const application = {
          id: nextApplicationId++,
          fullName,
          email,
          passwordHash,
          status: 'pending_approval',
          approvalTokenHash,
          approvalExpiresAt: Date.now() + 48 * 60 * 60 * 1000,
          approvedAt: null,
          rejectedAt: null,
          verificationCodeHash: null,
          verificationExpiresAt: null,
          verificationDeadlineAt: null,
          verificationFailedAttempts: 0,
          verificationResendCount: 0,
          verificationLastSentAt: null,
          completedAt: null,
          adminUserId: null,
          createdAt: Date.now(),
        };
        applications.push(application);
        return [{ insertId: application.id, affectedRows: 1 }, []];
      }

      if (
        statement.startsWith('update admin_applications set approval_token_hash = ?') &&
        statement.includes("status = 'pending_approval'")
      ) {
        const [approvalTokenHash, id] = values;
        const application = applications.find((item) =>
          item.id === Number(id) && item.status === 'pending_approval',
        );
        if (!application) {
          return [{ affectedRows: 0 }, []];
        }
        application.approvalTokenHash = approvalTokenHash;
        application.approvalExpiresAt = Date.now() + 48 * 60 * 60 * 1000;
        return [{ affectedRows: 1 }, []];
      }

      if (statement.startsWith("update admin_applications set status = 'pending_verification'")) {
        const [codeHash, id] = values;
        const application = applications.find((item) =>
          item.id === id && item.status === 'pending_approval',
        );
        if (!application) {
          return [{ affectedRows: 0 }, []];
        }
        application.status = 'pending_verification';
        application.approvalTokenHash = null;
        application.approvalExpiresAt = null;
        application.approvedAt = Date.now();
        application.verificationCodeHash = codeHash;
        application.verificationExpiresAt = Date.now() + 15 * 60 * 1000;
        application.verificationDeadlineAt = Date.now() + 24 * 60 * 60 * 1000;
        application.verificationFailedAttempts = 0;
        application.verificationResendCount = 0;
        application.verificationLastSentAt = Date.now();
        return [{ affectedRows: 1 }, []];
      }

      if (statement.startsWith("update admin_applications set status = 'rejected'")) {
        const [id] = values;
        const application = applications.find((item) => item.id === id);
        if (!application) {
          return [{ affectedRows: 0 }, []];
        }
        application.status = 'rejected';
        application.passwordHash = null;
        application.approvalTokenHash = null;
        application.approvalExpiresAt = null;
        application.rejectedAt = Date.now();
        return [{ affectedRows: 1 }, []];
      }

      if (statement.startsWith("update admin_applications set status = 'completed'")) {
        const [userId, id] = values;
        const application = applications.find((item) =>
          item.id === id && item.status === 'pending_verification',
        );
        if (!application) {
          return [{ affectedRows: 0 }, []];
        }
        application.status = 'completed';
        application.passwordHash = null;
        application.verificationCodeHash = null;
        application.verificationExpiresAt = null;
        application.verificationDeadlineAt = null;
        application.verificationFailedAttempts = 0;
        application.completedAt = Date.now();
        application.adminUserId = userId;
        return [{ affectedRows: 1 }, []];
      }

      if (statement.startsWith("update admin_applications set status = 'email_failed'")) {
        const [id, hash] = values;
        const application = applications.find((item) =>
          item.id === id && item.approvalTokenHash === hash && item.status === 'pending_approval',
        );
        if (!application) {
          return [{ affectedRows: 0 }, []];
        }
        application.status = 'email_failed';
        application.passwordHash = null;
        application.approvalTokenHash = null;
        application.approvalExpiresAt = null;
        return [{ affectedRows: 1 }, []];
      }

      if (statement.startsWith("update admin_applications set status = 'expired'")) {
        const id = statement.includes('verification_failed_attempts = ?')
          ? values[1]
          : values[0];
        const application = applications.find((item) => item.id === id);
        if (!application) {
          return [{ affectedRows: 0 }, []];
        }
        application.status = 'expired';
        application.passwordHash = null;
        application.approvalTokenHash = null;
        application.approvalExpiresAt = null;
        application.verificationCodeHash = null;
        application.verificationExpiresAt = null;
        application.verificationDeadlineAt = null;
        if (statement.includes('verification_failed_attempts = ?')) {
          application.verificationFailedAttempts = values[0];
        }
        return [{ affectedRows: 1 }, []];
      }

      if (statement.startsWith('update admin_applications set verification_failed_attempts = ?')) {
        const [attempts, id] = values;
        const application = applications.find((item) => item.id === id);
        if (!application) {
          return [{ affectedRows: 0 }, []];
        }
        application.verificationFailedAttempts = attempts;
        return [{ affectedRows: 1 }, []];
      }

      if (statement.startsWith('update admin_applications set verification_code_hash = ?')) {
        const [codeHash, id] = values;
        const application = applications.find((item) =>
          item.id === id && item.status === 'pending_verification',
        );
        if (!application || application.verificationResendCount >= 3) {
          return [{ affectedRows: 0 }, []];
        }
        application.verificationCodeHash = codeHash;
        application.verificationExpiresAt = Date.now() + 15 * 60 * 1000;
        application.verificationFailedAttempts = 0;
        application.verificationResendCount += 1;
        application.verificationLastSentAt = Date.now();
        return [{ affectedRows: 1 }, []];
      }

      if (statement.startsWith('update admin_applications set verification_code_hash = null')) {
        const [id, hash] = values;
        const application = applications.find((item) =>
          item.id === id && item.verificationCodeHash === hash,
        );
        if (!application) {
          return [{ affectedRows: 0 }, []];
        }
        application.verificationCodeHash = null;
        application.verificationExpiresAt = null;
        return [{ affectedRows: 1 }, []];
      }

      if (statement.startsWith('update admin_applications set status = \'expired\'')) {
        return [{ affectedRows: 0 }, []];
      }

      if (statement.startsWith('insert into users')) {
        const [fullName, email, passwordHash] = values;
        if (users.some((user) => user.email === email)) {
          const error = new Error('Duplicate email');
          error.code = 'ER_DUP_ENTRY';
          throw error;
        }
        const user = {
          id: nextUserId++,
          full_name: fullName,
          email,
          phone: null,
          password_hash: passwordHash,
          role: 'admin',
          is_active: true,
        };
        users.push(user);
        return [{ insertId: user.id, affectedRows: 1 }, []];
      }

      if (statement.startsWith('update first_admin_bootstrap_state')) {
        bootstrapState.verificationCodeHash = null;
        bootstrapState.verificationExpiresAt = null;
        bootstrapState.failedAttempts = 0;
        bootstrapState.completedAt = bootstrapState.completedAt || Date.now();
        bootstrapState.adminUserId = bootstrapState.adminUserId || values[0];
        return [{ affectedRows: 1 }, []];
      }

      throw new Error(`Unexpected admin application test query: ${statement}`);
    },
  };
}

db.getConnection = async () => createConnection();
db.query = async (sql, values = []) => createConnection().query(sql, values);

async function request(path, {
  method = 'GET',
  body,
  headers: extraHeaders = {},
  contentType,
  redirect,
} = {}) {
  const headers = {
    'X-Forwarded-For': `198.51.${Math.floor(nextRequestIp / 256)}.${nextRequestIp % 256}`,
    ...extraHeaders,
  };
  nextRequestIp += 1;
  let requestBody;
  if (body !== undefined) {
    const bodyType = contentType || 'application/json';
    headers['Content-Type'] = bodyType;
    requestBody = bodyType === 'application/x-www-form-urlencoded'
      ? new URLSearchParams(body)
      : JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: requestBody,
    redirect,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text.startsWith('{') ? JSON.parse(text) : text,
    headers: response.headers,
  };
}

async function submitApplication(email = 'applicant@example.com') {
  return request('/api/v1/auth/admin-applications', {
    method: 'POST',
    body: {
      name: 'Pending Admin',
      email,
      password: 'LaundryPass123',
    },
  });
}

async function decide(token, decision = 'approve') {
  const action = decision === 'reject' ? 'decline' : decision;
  const flow = await prepareDecision(token, action);
  if (!flow.csrfToken) {
    return flow.response;
  }
  return submitPreparedDecision(flow);
}

async function submitPreparedDecision(flow, csrfToken = flow.csrfToken, origin = 'https://api.example.test') {
  return request('/api/v1/auth/admin-applications/decision', {
    method: 'POST',
    headers: {
      Origin: origin,
      Cookie: flow.sessionCookie,
    },
    contentType: 'application/x-www-form-urlencoded',
    body: { csrfToken },
  });
}

async function prepareDecision(token, decision = 'approve') {
  const application = applications.find((item) => item.approvalTokenHash === sha256(token)) ||
    applications[0];
  assert.ok(application, 'Expected a pending application for the approval token.');
  const signature = createActionSignature(application.id, decision, token);
  const start = await request(
    `/api/v1/auth/admin-applications/action/${application.id}/${decision}/start`,
    {
      method: 'POST',
      headers: { Origin: 'https://api.example.test' },
      body: { token, signature },
    },
  );
  if (start.status !== 200) {
    return { response: start };
  }

  const authorizationUrl = new URL(start.body.authorizationUrl);
  const state = authorizationUrl.searchParams.get('state');
  const nonce = authorizationUrl.searchParams.get('nonce');
  const oauthCookie = cookiePair(start.headers, 'lh_admin_approval_oauth');
  const callback = await request(
    `/api/v1/auth/admin-applications/oauth/callback?code=${encodeURIComponent(nonce)}&state=${encodeURIComponent(state)}`,
    {
      headers: { Cookie: oauthCookie },
      redirect: 'manual',
    },
  );
  if (callback.status !== 303) {
    return { response: callback };
  }
  const sessionCookie = cookiePair(callback.headers, 'lh_admin_approval_session');
  const confirmation = await request(
    '/api/v1/auth/admin-applications/decision/confirm',
    { headers: { Cookie: sessionCookie } },
  );
  const csrfMatch = typeof confirmation.body === 'string'
    ? confirmation.body.match(/name="csrfToken" value="([A-Za-z0-9_-]+)"/)
    : null;
  if (confirmation.status !== 200 || !csrfMatch) {
    return { response: confirmation };
  }
  return {
    response: confirmation,
    sessionCookie,
    csrfToken: csrfMatch[1],
    callback,
  };
}

function cookiePair(headers, name) {
  const setCookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie') || ''];
  const line = setCookies.find((value) => value.startsWith(`${name}=`));
  assert.ok(line, `Expected ${name} cookie.`);
  return line.split(';')[0];
}

async function verify(email, code) {
  return request('/api/v1/auth/admin-applications/verify', {
    method: 'POST',
    body: { email, verificationCode: code },
  });
}

function sentApprovalToken() {
  return sentApprovalRequests[0].token;
}

function authorizationHeaders(role = 'admin') {
  const id = nextAuthenticatedUserId++;
  authenticatedUsers.push({
    id,
    full_name: 'Authenticated User',
    email: `${role}-${id}@example.com`,
    phone: null,
    role,
    is_active: true,
  });
  const token = jwt.sign(
    { sub: String(id) },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
  return { Authorization: `Bearer ${token}` };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

before(async () => {
  app.set('trust proxy', 'loopback');
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
  users.length = 0;
  authenticatedUsers.length = 0;
  applications.length = 0;
  Object.assign(bootstrapState, {
    verificationCodeHash: null,
    verificationExpiresAt: null,
    failedAttempts: 0,
    completedAt: null,
    adminUserId: null,
  });
  nextUserId = 1;
  nextApplicationId = 1;
  sentApprovalRequests = [];
  sentVerificationCodes = [];
  sentRejections = [];
  failApprovalEmail = false;
  failVerificationEmail = false;
  failRejectionEmail = false;
  oauthIdentity = {
    email: 'labadahub7@gmail.com',
    emailVerified: true,
  };
  oauthFailure = null;
  transactionQueue = Promise.resolve();

  emailService.sendAdminApplicationApprovalRequest = async (application, token) => {
    sentApprovalRequests.push({
      to: APPROVER_EMAIL,
      application,
      token,
    });
    if (failApprovalEmail) {
      throw new Error('Mock approval email failure');
    }
  };
  emailService.sendAdminApplicationVerification = async (email, code) => {
    sentVerificationCodes.push({ email, code });
    if (failVerificationEmail) {
      throw new Error('Mock verification email failure');
    }
  };
  emailService.sendAdminApplicationRejection = async (email) => {
    sentRejections.push(email);
    if (failRejectionEmail) {
      throw new Error('Mock rejection email failure');
    }
  };
  googleOAuth.createAuthorizationUrl = async ({ state, nonce, codeChallenge }) => {
    return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&nonce=${nonce}&code_challenge=${codeChallenge}`;
  };
  googleOAuth.exchangeAuthorizationCode = async (code, codeVerifier) => {
    assert.match(code, /^[A-Za-z0-9_-]{40,}$/);
    assert.match(codeVerifier, /^[A-Za-z0-9_-]{40,}$/);
    if (oauthFailure) {
      throw oauthFailure;
    }
    return code;
  };
  googleOAuth.verifyIdentity = async (idToken) => {
    return { ...oauthIdentity, nonce: idToken };
  };
});

test('creates a hashed pending application and emails only the authorized approver', async () => {
  const response = await submitApplication();
  const application = applications[0];
  const approvalToken = sentApprovalToken();

  assert.equal(response.status, 202);
  assert.equal(applications.length, 1);
  assert.equal(application.status, 'pending_approval');
  assert.equal(application.email, 'applicant@example.com');
  assert.equal(await bcrypt.compare('LaundryPass123', application.passwordHash), true);
  assert.notEqual(application.passwordHash, 'LaundryPass123');
  assert.match(approvalToken, /^[A-F0-9]{64}$/);
  assert.equal(application.approvalTokenHash, sha256(approvalToken));
  assert.notEqual(application.approvalTokenHash, approvalToken);
  assert.equal(sentApprovalRequests[0].to, 'labadahub7@gmail.com');
  assert.equal(sentApprovalRequests[0].application.email, application.email);
  assert.equal(users.length, 0);
  assert.equal(JSON.stringify(response.body).includes(approvalToken), false);
  assert.equal(JSON.stringify(response.body).includes(application.passwordHash), false);
});

test('approval-email resend requires an authenticated Admin', async () => {
  await submitApplication();
  const application = applications[0];
  const originalTokenHash = application.approvalTokenHash;
  const path = `/api/v1/auth/admin-applications/${application.id}/resend-approval`;

  const unauthenticated = await request(path, { method: 'POST' });
  const staff = await request(path, {
    method: 'POST',
    headers: authorizationHeaders('staff'),
  });

  assert.equal(unauthenticated.status, 401);
  assert.equal(staff.status, 403);
  assert.equal(application.status, 'pending_approval');
  assert.equal(application.approvalTokenHash, originalTokenHash);
  assert.equal(sentApprovalRequests.length, 1);
});

test('approval-email resend rejects applications outside pending_approval', async () => {
  await submitApplication();
  const application = applications[0];
  const originalTokenHash = application.approvalTokenHash;
  const originalExpiry = application.approvalExpiresAt;
  application.status = 'pending_verification';

  const response = await request(
    `/api/v1/auth/admin-applications/${application.id}/resend-approval`,
    {
      method: 'POST',
      headers: authorizationHeaders(),
    },
  );

  assert.equal(response.status, 409);
  assert.equal(application.status, 'pending_verification');
  assert.equal(application.approvalTokenHash, originalTokenHash);
  assert.equal(application.approvalExpiresAt, originalExpiry);
  assert.equal(sentApprovalRequests.length, 1);
});

test('approval-email resend rotates the token and expiry without changing application status', async () => {
  await submitApplication();
  const application = applications[0];
  const originalTokenHash = application.approvalTokenHash;
  const originalExpiry = application.approvalExpiresAt;
  const resendStartedAt = Date.now();

  const response = await request(
    `/api/v1/auth/admin-applications/${application.id}/resend-approval`,
    {
      method: 'POST',
      headers: authorizationHeaders(),
    },
  );

  const resentEmail = sentApprovalRequests[1];
  const expectedExpiry = resendStartedAt + 48 * 60 * 60 * 1000;
  assert.equal(response.status, 202);
  assert.match(response.body.message, /delivery is not confirmed/);
  assert.equal(applications.length, 1);
  assert.equal(users.length, 0);
  assert.equal(application.status, 'pending_approval');
  assert.notEqual(application.approvalTokenHash, originalTokenHash);
  assert.notEqual(resentEmail.token, sentApprovalRequests[0].token);
  assert.equal(application.approvalTokenHash, sha256(resentEmail.token));
  assert.equal(resentEmail.to, adminApplicationApproverEmail);
  assert.equal(resentEmail.application.email, application.email);
  assert.ok(application.approvalExpiresAt >= expectedExpiry - 1000);
  assert.ok(application.approvalExpiresAt > originalExpiry);
  assert.equal(JSON.stringify(response.body).includes(resentEmail.token), false);

  const previousTokenDecision = await decide(sentApprovalRequests[0].token);
  assert.equal(previousTokenDecision.status, 410);
  assert.equal(application.status, 'pending_approval');
});

test('approval-email resend failure leaves the application pending', async () => {
  await submitApplication();
  const application = applications[0];
  const originalTokenHash = application.approvalTokenHash;
  failApprovalEmail = true;

  const response = await request(
    `/api/v1/auth/admin-applications/${application.id}/resend-approval`,
    {
      method: 'POST',
      headers: authorizationHeaders(),
    },
  );

  assert.equal(response.status, 502);
  assert.equal(application.status, 'pending_approval');
  assert.notEqual(application.approvalTokenHash, originalTokenHash);
  assert.equal(application.approvalTokenHash, sha256(sentApprovalRequests[1].token));
});

test('approval-email resend is rate-limited per Admin and application', async () => {
  await submitApplication();
  const application = applications[0];
  const headers = authorizationHeaders();
  const path = `/api/v1/auth/admin-applications/${application.id}/resend-approval`;

  const responses = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    responses.push(await request(path, { method: 'POST', headers }));
  }
  const tokenHashAfterLimit = application.approvalTokenHash;
  const limited = await request(path, { method: 'POST', headers });

  assert.deepEqual(responses.map(({ status }) => status), [202, 202, 202, 202, 202]);
  assert.equal(limited.status, 429);
  assert.equal(application.approvalTokenHash, tokenHashAfterLimit);
  assert.equal(application.status, 'pending_approval');
  assert.equal(sentApprovalRequests.length, 6);
});

test('does not send an approval request when the applicant address aliases the approver mailbox', async () => {
  const responses = await Promise.all([
    submitApplication(APPROVER_EMAIL),
    submitApplication('labadahub7+applicant@gmail.com'),
    submitApplication('labada.hub7@googlemail.com'),
  ]);

  assert.deepEqual(responses.map(({ status }) => status), [202, 202, 202]);
  assert.equal(applications.length, 0);
  assert.equal(sentApprovalRequests.length, 0);
  assert.equal(users.length, 0);
});

test('scanner GETs only render the action shell and never mutate an application', async () => {
  await submitApplication();
  const token = sentApprovalToken();
  const reviewPage = await request('/api/v1/auth/admin-applications/approval');
  const actionPage = await request(
    `/api/v1/auth/admin-applications/action/1/approve#token=${token}`,
  );

  assert.equal(reviewPage.status, 404);
  assert.equal(actionPage.status, 200);
  assert.match(actionPage.body, /Continue to LabadaHub Admin approval/);
  assert.equal(actionPage.headers.get('referrer-policy'), 'no-referrer');
  assert.match(actionPage.headers.get('cache-control'), /no-store/);
  assert.equal(actionPage.body.includes(token), false);
  assert.equal(applications[0].status, 'pending_approval');
  assert.equal(applications[0].approvalTokenHash, sha256(token));
  assert.equal(applications[0].approvalExpiresAt > Date.now(), true);
  assert.equal(sentVerificationCodes.length, 0);
  assert.equal(sentRejections.length, 0);
});

test('scanner GET cannot consume an expired or valid approval token', async () => {
  await submitApplication();
  const token = sentApprovalToken();
  const application = applications[0];
  const originalExpiry = application.approvalExpiresAt;
  application.approvalExpiresAt = Date.now() - 1;

  const expiredAction = await request(
    `/api/v1/auth/admin-applications/action/${application.id}/approve#token=${token}`,
  );

  assert.equal(expiredAction.status, 200);
  assert.equal(application.status, 'pending_approval');
  assert.equal(application.approvalTokenHash, sha256(token));
  assert.equal(application.approvalExpiresAt < originalExpiry, true);
  assert.equal(sentVerificationCodes.length, 0);
  assert.equal(users.length, 0);
});

test('OAuth confirmation GET is read-only and uses secure approver cookies', async () => {
  await submitApplication();
  const token = sentApprovalToken();
  const flow = await prepareDecision(token);
  const application = applications[0];
  const sessionSetCookie = flow.callback.headers.getSetCookie()
    .find((value) => value.startsWith('lh_admin_approval_session='));

  assert.equal(flow.response.status, 200);
  assert.match(flow.response.body, /CONFIRM APPROVE/);
  assert.ok(sessionSetCookie);
  assert.match(sessionSetCookie, /HttpOnly/);
  assert.match(sessionSetCookie, /Secure/);
  assert.match(sessionSetCookie, /SameSite=Lax/);
  assert.equal(application.status, 'pending_approval');
  assert.equal(application.approvalTokenHash, sha256(token));
  assert.equal(sentVerificationCodes.length, 0);
});

test('requires a valid signed action before starting OAuth', async () => {
  await submitApplication();
  const token = sentApprovalToken();
  const response = await request('/api/v1/auth/admin-applications/action/1/approve/start', {
    method: 'POST',
    headers: { Origin: 'https://api.example.test' },
    body: { token, signature: '0'.repeat(64) },
  });

  assert.equal(response.status, 410);
  assert.equal(applications[0].status, 'pending_approval');
  assert.equal(applications[0].approvalTokenHash, sha256(token));
  assert.equal(sentVerificationCodes.length, 0);
});

test('rejects OAuth sign-in when the Google email is not the configured approver', async () => {
  await submitApplication();
  const token = sentApprovalToken();
  oauthIdentity = { email: 'attacker@example.com', emailVerified: true };
  const flow = await prepareDecision(token);

  assert.equal(flow.response.status, 403);
  assert.equal(applications[0].status, 'pending_approval');
  assert.equal(applications[0].approvalTokenHash, sha256(token));
  assert.equal(sentVerificationCodes.length, 0);
});

test('rejects OAuth sign-in when the Google email is unverified', async () => {
  await submitApplication();
  const token = sentApprovalToken();
  oauthIdentity = { email: adminApplicationApproverEmail, emailVerified: false };
  const flow = await prepareDecision(token);

  assert.equal(flow.response.status, 403);
  assert.equal(applications[0].status, 'pending_approval');
  assert.equal(applications[0].approvalTokenHash, sha256(token));
  assert.equal(sentVerificationCodes.length, 0);
});

test('OAuth errors never log or return the approval token', async () => {
  await submitApplication();
  const token = sentApprovalToken();
  oauthFailure = Object.assign(new Error(token), { code: token });
  const originalError = console.error;
  const errorLogs = [];
  console.error = (...args) => errorLogs.push(args);
  let flow;
  try {
    flow = await prepareDecision(token);
  } finally {
    console.error = originalError;
  }

  assert.equal(flow.response.status, 403);
  assert.equal(JSON.stringify(errorLogs).includes(token), false);
  assert.equal(String(flow.response.body).includes(token), false);
  assert.equal(applications[0].status, 'pending_approval');
  assert.equal(applications[0].approvalTokenHash, sha256(token));
});

test('requires same-origin POST and CSRF token for a final decision', async () => {
  await submitApplication();
  const token = sentApprovalToken();
  const missingSession = await request('/api/v1/auth/admin-applications/decision', {
    method: 'POST',
    headers: { Origin: 'https://api.example.test' },
    contentType: 'application/x-www-form-urlencoded',
    body: { csrfToken: 'invalid' },
  });
  assert.equal(missingSession.status, 403);

  const flow = await prepareDecision(token);
  const invalidOrigin = await submitPreparedDecision(flow, flow.csrfToken, 'https://attacker.example');
  assert.equal(invalidOrigin.status, 403);
  const invalidCsrf = await request('/api/v1/auth/admin-applications/decision', {
    method: 'POST',
    headers: {
      Origin: 'https://api.example.test',
      Cookie: flow.sessionCookie,
    },
    contentType: 'application/x-www-form-urlencoded',
    body: { csrfToken: 'invalid' },
  });

  assert.equal(invalidCsrf.status, 403);
  assert.equal(applications[0].status, 'pending_approval');
  assert.equal(applications[0].approvalTokenHash, sha256(token));
  assert.equal(sentVerificationCodes.length, 0);
});

test('approval sends a verification code and creates the Admin only after verification', async () => {
  await submitApplication();
  const token = sentApprovalToken();
  const approval = await decide(token);
  const application = applications[0];
  const sentCode = sentVerificationCodes[0].code;
  const normalizedCode = sentCode.replace(/-/g, '');

  assert.equal(approval.status, 200);
  assert.match(approval.body, /Decision recorded/);
  assert.equal(application.status, 'pending_verification');
  assert.equal(sentVerificationCodes[0].email, application.email);
  assert.match(sentCode, /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2}$/);
  assert.equal(application.verificationCodeHash, sha256(normalizedCode));
  assert.equal(users.length, 0);
  assert.equal(JSON.stringify(approval.body).includes(sentCode), false);

  const completion = await verify(application.email, sentCode.toLowerCase());

  assert.equal(completion.status, 201);
  assert.equal(users.length, 1);
  assert.equal(users[0].role, 'admin');
  assert.equal(await bcrypt.compare('LaundryPass123', users[0].password_hash), true);
  assert.equal(application.status, 'completed');
  assert.equal(application.passwordHash, null);
  assert.equal(application.approvalTokenHash, null);
  assert.equal(application.verificationCodeHash, null);
  assert.equal(bootstrapState.completedAt !== null, true);
  assert.equal(bootstrapState.adminUserId, users[0].id);
  assert.equal(jwt.verify(completion.body.token, process.env.JWT_SECRET).role, 'admin');
  assert.equal(Object.hasOwn(completion.body.user, 'password_hash'), false);

  const reusedCode = await verify(application.email, sentCode);
  assert.equal(reusedCode.status, 403);
  assert.equal(users.length, 1);
});

test('rejects an application and prevents later verification', async () => {
  await submitApplication();
  const response = await decide(sentApprovalToken(), 'reject');
  const application = applications[0];

  assert.equal(response.status, 200);
  assert.equal(application.status, 'rejected');
  assert.equal(application.passwordHash, null);
  assert.equal(application.approvalTokenHash, null);
  assert.deepEqual(sentRejections, ['applicant@example.com']);
  assert.equal(users.length, 0);

  const completion = await verify(application.email, 'A'.repeat(12));
  assert.equal(completion.status, 403);
  assert.equal(users.length, 0);
});

test('expires and consumes approval tokens after a single decision', async () => {
  await submitApplication();
  const token = sentApprovalToken();
  const pendingDecision = await prepareDecision(token);
  assert.equal(pendingDecision.csrfToken.length > 0, true);
  applications[0].approvalExpiresAt = Date.now() - 1;

  const expired = await submitPreparedDecision(pendingDecision);
  assert.equal(expired.status, 410);
  assert.equal(applications[0].status, 'expired');
  assert.equal(applications[0].approvalTokenHash, null);

  await submitApplication('another@example.com');
  const validToken = sentApprovalRequests[1].token;
  const approved = await decide(validToken);
  const reused = await decide(validToken);

  assert.equal(approved.status, 200);
  assert.equal(reused.status, 410);
  assert.equal(sentVerificationCodes.length, 1);
});

test('prevents concurrent approval decisions from consuming the same token twice', async () => {
  await submitApplication();
  const token = sentApprovalToken();

  const results = await Promise.all([decide(token), decide(token)]);

  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 410]);
  assert.equal(applications[0].status, 'pending_verification');
  assert.equal(sentVerificationCodes.length, 1);
});

test('blocks invalid verification codes after five attempts', async () => {
  await submitApplication();
  await decide(sentApprovalToken());
  const application = applications[0];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await verify(application.email, 'Z'.repeat(12));
    assert.equal(response.status, attempt === 4 ? 429 : 403);
  }

  assert.equal(application.status, 'expired');
  assert.equal(application.passwordHash, null);
  assert.equal(users.length, 0);
});

test('rejects an expired verification code while allowing a cooldown-qualified resend', async () => {
  await submitApplication();
  await decide(sentApprovalToken());
  const application = applications[0];
  const expiredCode = sentVerificationCodes[0].code;
  application.verificationExpiresAt = Date.now() - 1;

  const expired = await verify(application.email, expiredCode);
  assert.equal(expired.status, 403);
  assert.equal(users.length, 0);

  application.verificationLastSentAt = Date.now() - 61_000;
  const resend = await request('/api/v1/auth/admin-applications/resend', {
    method: 'POST',
    body: { email: application.email },
  });
  assert.equal(resend.status, 202);
  assert.equal(sentVerificationCodes.length, 2);
  assert.notEqual(application.verificationCodeHash, null);
});

test('prevents concurrent verification from creating multiple Admin accounts', async () => {
  await submitApplication();
  await decide(sentApprovalToken());
  const application = applications[0];
  const code = sentVerificationCodes[0].code;

  const responses = await Promise.all([
    verify(application.email, code),
    verify(application.email, code),
  ]);

  assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 403]);
  assert.equal(users.filter((user) => user.role === 'admin').length, 1);
});

test('enforces verification resend cooldown and maximum resends', async () => {
  await submitApplication();
  await decide(sentApprovalToken());

  const tooSoon = await request('/api/v1/auth/admin-applications/resend', {
    method: 'POST',
    body: { email: 'applicant@example.com' },
  });
  assert.equal(tooSoon.status, 202);
  assert.equal(sentVerificationCodes.length, 1);

  for (let resend = 0; resend < 3; resend += 1) {
    applications[0].verificationLastSentAt = Date.now() - 61_000;
    const response = await request('/api/v1/auth/admin-applications/resend', {
      method: 'POST',
      body: { email: 'applicant@example.com' },
    });
    assert.equal(response.status, 202);
  }
  applications[0].verificationLastSentAt = Date.now() - 61_000;
  const overLimit = await request('/api/v1/auth/admin-applications/resend', {
    method: 'POST',
    body: { email: 'applicant@example.com' },
  });

  assert.equal(overLimit.status, 202);
  assert.equal(applications[0].verificationResendCount, 3);
  assert.equal(sentVerificationCodes.length, 4);
});

test('deduplicates concurrent and repeated applications for the same email', async () => {
  const responses = await Promise.all([
    submitApplication('duplicate@example.com'),
    submitApplication('duplicate@example.com'),
  ]);

  assert.deepEqual(responses.map(({ status }) => status), [202, 202]);
  assert.equal(applications.length, 1);
  assert.equal(sentApprovalRequests.length, 1);
});

test('invalidates an application when approval email delivery fails', async () => {
  failApprovalEmail = true;
  const response = await submitApplication();

  assert.equal(response.status, 502);
  assert.equal(applications[0].status, 'email_failed');
  assert.equal(applications[0].passwordHash, null);
  assert.equal(applications[0].approvalTokenHash, null);
  assert.equal(JSON.stringify(response.body).includes(sentApprovalToken()), false);

  const retry = await submitApplication();
  assert.equal(retry.status, 429);
  assert.equal(retry.headers.get('retry-after'), '60');
  assert.equal(sentApprovalRequests.length, 1);
});

test('invalidates an undelivered verification code and allows a later resend', async () => {
  await submitApplication();
  failVerificationEmail = true;
  const approval = await decide(sentApprovalToken());

  assert.equal(approval.status, 502);
  assert.equal(applications[0].status, 'pending_verification');
  assert.equal(applications[0].verificationCodeHash, null);

  failVerificationEmail = false;
  applications[0].verificationLastSentAt = Date.now() - 61_000;
  const resend = await request('/api/v1/auth/admin-applications/resend', {
    method: 'POST',
    body: { email: 'applicant@example.com' },
  });

  assert.equal(resend.status, 202);
  assert.equal(sentVerificationCodes.length, 2);
  assert.notEqual(applications[0].verificationCodeHash, null);
});
