const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.FIRST_ADMIN_EMAIL = 'justinaceejay08@gmail.com';

const app = require('../src/app');
const db = require('../src/config/db');
const emailService = require('../src/services/email-service');

const users = [];
const invitations = [];
const bootstrapState = {};
let nextUserId = 1;
let nextInvitationId = 1;
let server;
let baseUrl;
let sentFirstAdminCodes = [];
let failFirstAdminEmailDelivery = false;
let transactionQueue = Promise.resolve();

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
          is_expired: bootstrapState.verificationExpiresAt !== null &&
            bootstrapState.verificationExpiresAt <= Date.now() ? 1 : 0,
          is_rate_limited: bootstrapState.lastRequestedAt !== null &&
            Date.now() - bootstrapState.lastRequestedAt < 60_000 ? 1 : 0,
        }], []];
      }

      if (statement.startsWith("select id from users where role = 'admin'")) {
        return [users.filter((user) => user.role === 'admin').map(({ id }) => ({ id })), []];
      }

      if (statement.startsWith('select id from users where email = ?')) {
        return [users.filter((user) => user.email === values[0]).map(({ id }) => ({ id })), []];
      }

      if (statement.startsWith('update first_admin_bootstrap_state')) {
        if (statement.includes('set verification_code_hash = ?')) {
          bootstrapState.verificationCodeHash = values[0];
          bootstrapState.verificationExpiresAt = Date.now() + 15 * 60 * 1000;
          bootstrapState.failedAttempts = 0;
          bootstrapState.lastRequestedAt = Date.now();
          return [{ affectedRows: 1 }, []];
        }
        if (statement.includes('set failed_attempts = ?')) {
          bootstrapState.failedAttempts = values[0];
          return [{ affectedRows: 1 }, []];
        }
        if (statement.includes('admin_user_id = ?')) {
          bootstrapState.verificationCodeHash = null;
          bootstrapState.verificationExpiresAt = null;
          bootstrapState.failedAttempts = 0;
          bootstrapState.completedAt = bootstrapState.completedAt || Date.now();
          bootstrapState.adminUserId = bootstrapState.adminUserId || values[0];
          return [{ affectedRows: 1 }, []];
        }
        if (statement.includes('admin_user_id = coalesce')) {
          bootstrapState.verificationCodeHash = null;
          bootstrapState.verificationExpiresAt = null;
          bootstrapState.failedAttempts = 0;
          bootstrapState.completedAt = bootstrapState.completedAt || Date.now();
          bootstrapState.adminUserId = bootstrapState.adminUserId || values[0];
          return [{ affectedRows: 1 }, []];
        }
      }

      if (statement.startsWith('select id, invited_email, role from staff_invitations')) {
        const invitation = invitations.find((item) =>
          item.codeHash === values[0] &&
          !item.redeemedAt &&
          !item.revokedAt &&
          item.expiresAt > Date.now(),
        );
        return [invitation ? [{
          id: invitation.id,
          invited_email: invitation.invitedEmail,
          role: invitation.role,
        }] : [], []];
      }

      if (statement.startsWith('insert into users')) {
        const isFirstAdmin = statement.includes("'admin')");
        const [fullName, email, phone, passwordHash, role] = isFirstAdmin
          ? [...values, 'admin']
          : values;
        if (users.some((user) => user.email === email)) {
          const error = new Error('Duplicate email');
          error.code = 'ER_DUP_ENTRY';
          throw error;
        }

        const user = {
          id: nextUserId++,
          full_name: fullName,
          email,
          phone,
          password_hash: passwordHash,
          role,
          is_active: true,
        };
        users.push(user);
        return [{ insertId: user.id, affectedRows: 1 }, []];
      }

      if (statement.startsWith('insert into staff_invitations')) {
        const role = statement.includes("'admin'") ? 'admin' : 'staff';
        const [codeHash, invitedEmail, createdBy] = role === 'admin'
          ? values
          : [values[0], null, values[1]];
        const invitation = {
          id: nextInvitationId++,
          codeHash,
          invitedEmail,
          role,
          createdBy,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        };
        invitations.push(invitation);
        return [{ insertId: invitation.id, affectedRows: 1 }, []];
      }

      if (statement.startsWith('update staff_invitations') && statement.includes('set revoked_at')) {
        const [id] = values;
        const invitation = invitations.find((item) => item.id === id);
        if (!invitation || invitation.redeemedAt || invitation.revokedAt) {
          return [{ affectedRows: 0 }, []];
        }
        invitation.revokedAt = Date.now();
        return [{ affectedRows: 1 }, []];
      }

      if (statement.startsWith('update staff_invitations')) {
        const [redeemedBy, id] = values;
        const invitation = invitations.find((item) => item.id === id && !item.redeemedAt);
        if (!invitation) {
          return [{ affectedRows: 0 }, []];
        }
        invitation.redeemedBy = redeemedBy;
        invitation.redeemedAt = Date.now();
        return [{ affectedRows: 1 }, []];
      }

      throw new Error(`Unexpected test database query: ${statement}`);
    },
  };
}

db.getConnection = async () => createConnection();
db.query = async (sql, values = []) => {
  const statement = normalizeSql(sql);

  if (statement.startsWith('update first_admin_bootstrap_state')) {
    if (statement.includes('set verification_code_hash = null')) {
      if (bootstrapState.verificationCodeHash !== values[0] || bootstrapState.completedAt) {
        return [{ affectedRows: 0 }, []];
      }
      bootstrapState.verificationCodeHash = null;
      bootstrapState.verificationExpiresAt = null;
      return [{ affectedRows: 1 }, []];
    }
  }

  if (statement.startsWith('insert into staff_invitations')) {
    const role = statement.includes("'admin'") ? 'admin' : 'staff';
    const [codeHash, invitedEmail, createdBy] = role === 'admin'
      ? values
      : [values[0], null, values[1]];
    const invitation = {
      id: nextInvitationId++,
      codeHash,
      invitedEmail,
      role,
      createdBy,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    invitations.push(invitation);
    return [{ insertId: invitation.id, affectedRows: 1 }, []];
  }

  if (statement.startsWith('update staff_invitations')) {
    const [id] = values;
    const invitation = invitations.find((item) => item.id === id);
    if (!invitation || invitation.redeemedAt || invitation.revokedAt) {
      return [{ affectedRows: 0 }, []];
    }
    invitation.revokedAt = Date.now();
    return [{ affectedRows: 1 }, []];
  }

  if (statement.includes('from users where email = ?')) {
    const user = users.find((item) => item.email === values[0] && item.is_active);
    return [user ? [{
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      password_hash: user.password_hash,
      role: user.role,
    }] : [], []];
  }

  if (statement.includes('from users where id = ?')) {
    const user = users.find((item) => String(item.id) === String(values[0]) && item.is_active);
    return [user ? [{
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    }] : [], []];
  }

  throw new Error(`Unexpected test database query: ${statement}`);
};

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    retryAfter: response.headers.get('retry-after'),
  };
}

async function registerCustomer() {
  return request('/api/v1/auth/register', {
    method: 'POST',
    body: {
      name: 'Taylor Example',
      email: 'taylor@example.com',
      password: 'LaundryPass123',
      role: 'client',
    },
  });
}

async function requestFirstAdminCode(email = process.env.FIRST_ADMIN_EMAIL) {
  return request('/api/v1/auth/bootstrap-admin/request', {
    method: 'POST',
    body: { email },
  });
}

async function completeFirstAdmin(code, email = process.env.FIRST_ADMIN_EMAIL) {
  return request('/api/v1/auth/bootstrap-admin/complete', {
    method: 'POST',
    body: {
      name: 'First Admin',
      email,
      password: 'LaundryPass123',
      verificationCode: code,
    },
  });
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
  users.length = 0;
  invitations.length = 0;
  Object.assign(bootstrapState, {
    verificationCodeHash: null,
    verificationExpiresAt: null,
    failedAttempts: 0,
    lastRequestedAt: null,
    completedAt: null,
    adminUserId: null,
  });
  nextUserId = 1;
  nextInvitationId = 1;
  sentFirstAdminCodes = [];
  failFirstAdminEmailDelivery = false;
  transactionQueue = Promise.resolve();
  emailService.sendFirstAdminVerification = async (email, code) => {
    sentFirstAdminCodes.push({ email, code });
    if (failFirstAdminEmailDelivery) {
      throw new Error('Mock SMTP failure');
    }
  };
});

test('registers a customer with a bcrypt hash and returns no password hash', async () => {
  const response = await registerCustomer();

  assert.equal(response.status, 201);
  assert.equal(users.length, 1);
  assert.equal(users[0].role, 'customer');
  assert.notEqual(users[0].password_hash, 'LaundryPass123');
  assert.equal(await bcrypt.compare('LaundryPass123', users[0].password_hash), true);
  assert.equal(response.body.user.name, 'Taylor Example');
  assert.equal(response.body.user.role, 'client');
  assert.equal(Object.hasOwn(response.body.user, 'password_hash'), false);
  assert.equal(typeof response.body.token, 'string');
});

test('rejects duplicate email registration', async () => {
  const first = await registerCustomer();
  const duplicate = await registerCustomer();

  assert.equal(first.status, 201);
  assert.equal(duplicate.status, 409);
  assert.equal(users.length, 1);
});

test('requires a valid invitation to register staff and redeems it atomically', async () => {
  const code = 'STAFF-ABC123';
  invitations.push({
    id: 21,
    codeHash: crypto.createHash('sha256').update(code).digest('hex'),
    invitedEmail: 'staff@example.com',
    role: 'staff',
    expiresAt: Date.now() + 60_000,
  });

  const response = await request('/api/v1/auth/register', {
    method: 'POST',
    body: {
      name: 'Staff User',
      email: 'staff@example.com',
      password: 'LaundryPass123',
      role: 'staff',
      inviteCode: code.toLowerCase(),
    },
  });

  assert.equal(response.status, 201);
  assert.equal(users[0].role, 'staff');
  assert.equal(invitations[0].redeemedBy, users[0].id);
  assert.equal(Object.hasOwn(response.body.user, 'password_hash'), false);
});

test('preserves Staff code invitations and one-time registration', async () => {
  const admin = {
    id: nextUserId++,
    full_name: 'Admin User',
    email: 'admin@example.com',
    phone: null,
    role: 'admin',
    is_active: true,
  };
  users.push(admin);
  const token = jwt.sign(
    { id: admin.id, role: admin.role },
    process.env.JWT_SECRET,
    { subject: String(admin.id), expiresIn: '1h' },
  );
  const inviteResponse = await request('/api/v1/auth/invitations/staff', {
    method: 'POST',
    token,
    body: { role: 'staff' },
  });

  assert.equal(inviteResponse.status, 201);
  assert.match(inviteResponse.body.code, /^STAFF-[A-F0-9]{12}$/);
  assert.equal(inviteResponse.body.expires_in_days, 7);
  assert.equal(invitations[0].createdBy, admin.id);
  assert.equal(
    invitations[0].codeHash,
    crypto.createHash('sha256').update(inviteResponse.body.code).digest('hex'),
  );

  const registration = await request('/api/v1/auth/register', {
    method: 'POST',
    body: {
      name: 'New Staff',
      email: 'new-staff@example.com',
      password: 'LaundryPass123',
      role: 'staff',
      inviteCode: inviteResponse.body.code,
    },
  });
  assert.equal(registration.status, 201);
  assert.equal(invitations[0].redeemedBy, users[1].id);

  const staffLogin = await request('/api/v1/auth/login', {
    method: 'POST',
    body: {
      email: 'new-staff@example.com',
      password: 'LaundryPass123',
      role: 'staff',
    },
  });
  assert.equal(staffLogin.status, 200);
  assert.equal(staffLogin.body.user.role, 'staff');
});

test('sends a hashed, expiring First Admin code only to the configured email', async () => {
  const response = await requestFirstAdminCode();
  const emailedCode = sentFirstAdminCodes[0].code;
  const normalizedCode = emailedCode.replace(/-/g, '');

  assert.equal(response.status, 202);
  assert.equal(sentFirstAdminCodes.length, 1);
  assert.deepEqual(sentFirstAdminCodes[0].email, process.env.FIRST_ADMIN_EMAIL);
  assert.match(emailedCode, /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){2}$/);
  assert.equal(normalizedCode.length, 12);
  assert.equal(
    bootstrapState.verificationCodeHash,
    crypto.createHash('sha256').update(normalizedCode).digest('hex'),
  );
  assert.notEqual(bootstrapState.verificationCodeHash, normalizedCode);
  assert.ok(bootstrapState.verificationExpiresAt > Date.now());
  assert.ok(bootstrapState.verificationExpiresAt <= Date.now() + 15 * 60 * 1000);
  assert.equal(JSON.stringify(response.body).includes(emailedCode), false);
  assert.equal(Object.hasOwn(response.body, 'verificationCode'), false);
});

test('rejects First Admin requests for any email other than the configured address', async () => {
  const response = await requestFirstAdminCode('someone-else@example.com');

  assert.equal(response.status, 403);
  assert.equal(sentFirstAdminCodes.length, 0);
  assert.equal(bootstrapState.verificationCodeHash, null);
});

test('completes bootstrap after code verification and returns a JWT only after commit', async () => {
  const codeRequest = await requestFirstAdminCode();
  const code = sentFirstAdminCodes[0].code.replace(/-/g, '').toLowerCase();

  assert.equal(codeRequest.status, 202);
  const completion = await completeFirstAdmin(code);

  assert.equal(completion.status, 201);
  assert.equal(users.length, 1);
  assert.equal(users[0].role, 'admin');
  assert.equal(users[0].email, process.env.FIRST_ADMIN_EMAIL);
  assert.notEqual(users[0].password_hash, 'LaundryPass123');
  assert.equal(await bcrypt.compare('LaundryPass123', users[0].password_hash), true);
  assert.equal(bootstrapState.completedAt !== null, true);
  assert.equal(bootstrapState.adminUserId, users[0].id);
  assert.equal(bootstrapState.verificationCodeHash, null);
  assert.equal(bootstrapState.verificationExpiresAt, null);
  assert.equal(jwt.verify(completion.body.token, process.env.JWT_SECRET).role, 'admin');
  assert.equal(Object.hasOwn(completion.body.user, 'password_hash'), false);
});

test('accepts a First Admin verification code with its emailed hyphens', async () => {
  await requestFirstAdminCode();
  const code = sentFirstAdminCodes[0].code;

  const completion = await completeFirstAdmin(code.toLowerCase());

  assert.equal(completion.status, 201);
  assert.equal(users.filter((user) => user.role === 'admin').length, 1);
});

test('rejects an incorrect First Admin code and increments its failed-attempt count', async () => {
  await requestFirstAdminCode();

  const response = await completeFirstAdmin('0'.repeat(12));

  assert.equal(response.status, 403);
  assert.equal(bootstrapState.failedAttempts, 1);
  assert.equal(users.length, 0);
});

test('requires the configured email when completing First Admin bootstrap', async () => {
  await requestFirstAdminCode();

  const response = await completeFirstAdmin(
    sentFirstAdminCodes[0].code,
    'someone-else@example.com',
  );

  assert.equal(response.status, 403);
  assert.equal(bootstrapState.failedAttempts, 0);
  assert.equal(users.length, 0);
});

test('rejects an expired First Admin code', async () => {
  const code = 'A'.repeat(12);
  bootstrapState.verificationCodeHash = crypto.createHash('sha256').update(code).digest('hex');
  bootstrapState.verificationExpiresAt = Date.now() - 1;

  const response = await completeFirstAdmin(code);

  assert.equal(response.status, 403);
  assert.equal(users.length, 0);
  assert.equal(bootstrapState.completedAt, null);
});

test('blocks First Admin verification after the maximum failed attempts', async () => {
  await requestFirstAdminCode();
  const validCode = sentFirstAdminCodes[0].code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await completeFirstAdmin('F'.repeat(12));
    assert.equal(response.status, attempt === 4 ? 429 : 403);
  }
  const validAfterLimit = await completeFirstAdmin(validCode);

  assert.equal(validAfterLimit.status, 429);
  assert.equal(bootstrapState.failedAttempts, 5);
  assert.equal(users.length, 0);
});

test('rate limits repeated First Admin code requests', async () => {
  const first = await requestFirstAdminCode();
  const repeated = await requestFirstAdminCode();

  assert.equal(first.status, 202);
  assert.equal(repeated.status, 429);
  assert.equal(repeated.body.message, 'Please wait before requesting another verification code.');
  assert.equal(repeated.retryAfter, '60');
  assert.equal(sentFirstAdminCodes.length, 1);
});

test('invalidates an unmailed First Admin code when email delivery fails', async () => {
  failFirstAdminEmailDelivery = true;

  const response = await requestFirstAdminCode();

  assert.equal(response.status, 502);
  assert.equal(bootstrapState.verificationCodeHash, null);
  assert.equal(bootstrapState.verificationExpiresAt, null);
  assert.equal(JSON.stringify(response.body).includes(sentFirstAdminCodes[0].code), false);
});

test('does not allow bootstrap after it has been completed', async () => {
  bootstrapState.completedAt = Date.now();
  bootstrapState.adminUserId = 7;

  const requestResponse = await requestFirstAdminCode();
  const completionResponse = await completeFirstAdmin('B'.repeat(12));

  assert.equal(requestResponse.status, 409);
  assert.equal(completionResponse.status, 409);
  assert.equal(sentFirstAdminCodes.length, 0);
  assert.equal(users.length, 0);
});

test('does not bootstrap when an Admin account already exists', async () => {
  users.push({
    id: nextUserId++,
    full_name: 'Existing Admin',
    email: 'existing-admin@example.com',
    role: 'admin',
    is_active: true,
  });
  const code = 'C'.repeat(12);
  bootstrapState.verificationCodeHash = crypto.createHash('sha256').update(code).digest('hex');
  bootstrapState.verificationExpiresAt = Date.now() + 60_000;

  const requestResponse = await requestFirstAdminCode();
  const completionResponse = await completeFirstAdmin(code);

  assert.equal(requestResponse.status, 409);
  assert.equal(completionResponse.status, 409);
  assert.equal(users.length, 1);
});

test('blocks legacy Admin registration so it cannot bypass application approval', async () => {
  const response = await request('/api/v1/auth/register', {
    method: 'POST',
    body: {
      name: 'Uninvited Admin',
      email: process.env.FIRST_ADMIN_EMAIL,
      password: 'LaundryPass123',
      role: 'admin',
      inviteCode: 'ADMIN-LEGACY-CODE',
    },
  });

  assert.equal(response.status, 403);
  assert.equal(users.length, 0);
});

test('serializes simultaneous First Admin completion attempts', async () => {
  await requestFirstAdminCode();
  const code = sentFirstAdminCodes[0].code;

  const responses = await Promise.all([
    completeFirstAdmin(code),
    completeFirstAdmin(code),
  ]);

  assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409]);
  assert.equal(users.filter((user) => user.role === 'admin').length, 1);
  assert.equal(bootstrapState.adminUserId, users[0].id);
});

test('does not expose the retired manual Admin invitation route', async () => {
  const response = await request('/api/v1/auth/invitations', {
    method: 'POST',
    body: { role: 'admin', email: 'recipient@example.com' },
  });

  assert.equal(response.status, 404);
  assert.equal(invitations.length, 0);
});

test('rejects invalid registration data and invalid invitations', async () => {
  const invalidBody = await request('/api/v1/auth/register', {
    method: 'POST',
    body: { name: '', email: 'not-an-email', password: 'short' },
  });
  const invalidInvite = await request('/api/v1/auth/register', {
    method: 'POST',
    body: {
      name: 'Staff User',
      email: 'staff@example.com',
      password: 'LaundryPass123',
      role: 'staff',
      inviteCode: 'NOT-VALID',
    },
  });

  assert.equal(invalidBody.status, 400);
  assert.equal(invalidInvite.status, 403);
  assert.equal(users.length, 0);
});

test('logs in with valid credentials and rejects invalid credentials', async () => {
  await registerCustomer();
  const valid = await request('/api/v1/auth/login', {
    method: 'POST',
    body: {
      email: 'TAYLOR@example.com',
      password: 'LaundryPass123',
      role: 'client',
    },
  });
  const invalid = await request('/api/v1/auth/login', {
    method: 'POST',
    body: {
      email: 'taylor@example.com',
      password: 'incorrect-password',
      role: 'client',
    },
  });
  const unknownUser = await request('/api/v1/auth/login', {
    method: 'POST',
    body: {
      email: 'missing@example.com',
      password: 'incorrect-password',
    },
  });

  assert.equal(valid.status, 200);
  assert.equal(jwt.verify(valid.body.token, process.env.JWT_SECRET).role, 'customer');
  assert.equal(valid.body.user.role, 'client');
  assert.equal(Object.hasOwn(valid.body.user, 'password_hash'), false);
  assert.equal(invalid.status, 401);
  assert.equal(unknownUser.status, 401);
});

test('protects the current-user endpoint and rejects invalid JWTs', async () => {
  await registerCustomer();
  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { email: 'taylor@example.com', password: 'LaundryPass123' },
  });
  const profile = await request('/api/v1/auth/me', { token: login.body.token });
  const invalid = await request('/api/v1/auth/me', { token: 'not-a-valid-jwt' });
  const anonymous = await request('/api/v1/auth/me');

  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.email, 'taylor@example.com');
  assert.equal(profile.body.user.role, 'client');
  assert.equal(Object.hasOwn(profile.body.user, 'password_hash'), false);
  assert.equal(invalid.status, 401);
  assert.equal(anonymous.status, 401);
});
