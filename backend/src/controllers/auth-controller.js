const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { firstAdminEmail } = require('../config/env');
const emailService = require('../services/email-service');
const {
  generateVerificationCode,
  formatVerificationCode,
  verificationCodeDigest,
} = require('../utils/verification-code');

const JWT_LIFETIME = '8h';
const FIRST_ADMIN_CODE_TTL_MINUTES = 15;
const FIRST_ADMIN_REQUEST_COOLDOWN_SECONDS = 60;
const FIRST_ADMIN_MAX_FAILED_ATTEMPTS = 5;
let dummyPasswordHash;

function databaseRole(role) {
  return role === 'client' ? 'customer' : role;
}

function publicRole(role) {
  return role === 'customer' ? 'client' : role;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.full_name,
    email: user.email,
    phone: user.phone || null,
    role: publicRole(user.role),
  };
}

function issueToken(user) {
  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    {
      algorithm: 'HS256',
      subject: String(user.id),
      expiresIn: JWT_LIFETIME,
    },
  );

  return { token, user: publicUser(user) };
}

function invitationDigest(code) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase(), 'utf8').digest('hex');
}

async function lockFirstAdminBootstrapState(connection) {
  const [rows] = await connection.query(
    `SELECT singleton_id, verification_code_hash, verification_expires_at,
            failed_attempts, completed_at, admin_user_id,
            (verification_expires_at IS NOT NULL
              AND verification_expires_at <= CURRENT_TIMESTAMP) AS is_expired,
            (last_requested_at IS NOT NULL
              AND last_requested_at >
                DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${FIRST_ADMIN_REQUEST_COOLDOWN_SECONDS} SECOND))
              AS is_rate_limited
     FROM first_admin_bootstrap_state
     WHERE singleton_id = 1
     FOR UPDATE`,
  );
  const state = rows[0];
  if (!state) {
    const error = new Error('First Admin bootstrap migration is not initialized.');
    error.code = 'FIRST_ADMIN_BOOTSTRAP_NOT_INITIALIZED';
    throw error;
  }
  return state;
}

async function hasAdminAccount(connection) {
  const [rows] = await connection.query(
    `SELECT id
     FROM users
     WHERE role = 'admin'
     LIMIT 1
     FOR UPDATE`,
  );
  return rows.length > 0;
}

function getDummyPasswordHash() {
  if (!dummyPasswordHash) {
    dummyPasswordHash = bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  }
  return dummyPasswordHash;
}

async function register(req, res, next) {
  const { full_name, email, password } = req.body;
  const phone = req.body.phone ? req.body.phone.trim() : null;
  const role = databaseRole(req.body.role || 'customer');
  if (role === 'admin') {
    return res.status(403).json({ message: 'Admin accounts require an approved email application.' });
  }

  let connection;
  let transactionStarted = false;

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    if (existingUsers.length > 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Email already registered' });
    }

    let invitation = null;
    if (role === 'staff' || role === 'admin') {
      const code = typeof req.body.inviteCode === 'string' ? req.body.inviteCode.trim() : '';
      if (!code) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(403).json({ message: 'A valid invitation code is required for this role' });
      }

      const [invitations] = await connection.query(
        `SELECT id, invited_email, role
         FROM staff_invitations
         WHERE code_hash = ?
           AND redeemed_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > CURRENT_TIMESTAMP
         FOR UPDATE`,
        [invitationDigest(code)],
      );
      invitation = invitations[0];
      if (
        !invitation ||
        invitation.role !== role ||
        (role === 'admin' && !invitation.invited_email) ||
        (invitation.invited_email &&
          invitation.invited_email.toLowerCase() !== email.toLowerCase())
      ) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(403).json({ message: 'A valid invitation code is required for this role' });
      }
    }

    const [insertResult] = await connection.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role)
       VALUES (?, ?, ?, ?, ?)`,
      [full_name.trim(), email, phone, passwordHash, role],
    );

    const user = {
      id: insertResult.insertId,
      full_name: full_name.trim(),
      email,
      phone,
      role,
    };

    if (invitation) {
      const [redeemResult] = await connection.query(
        `UPDATE staff_invitations
         SET redeemed_by = ?, redeemed_at = CURRENT_TIMESTAMP
         WHERE id = ? AND redeemed_at IS NULL AND revoked_at IS NULL`,
        [user.id, invitation.id],
      );
      if (redeemResult.affectedRows !== 1) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({ message: 'Invitation is no longer available' });
      }
    }

    await connection.commit();
    transactionStarted = false;
    return res.status(201).json(issueToken(user));
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(`Registration rollback failed: ${rollbackError.code || rollbackError.name}`);
      }
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email already registered' });
    }

    return next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function requestFirstAdminVerification(req, res, next) {
  if (!firstAdminEmail) {
    return res.status(503).json({ message: 'First Admin bootstrap is not configured.' });
  }

  const email = req.body.email.trim().toLowerCase();
  if (email !== firstAdminEmail) {
    return res.status(403).json({ message: 'This email is not eligible for First Admin setup.' });
  }

  let connection;
  let transactionStarted = false;
  let code;
  let codeHash;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const state = await lockFirstAdminBootstrapState(connection);
    if (state.completed_at || await hasAdminAccount(connection)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'First Admin setup is no longer available.' });
    }

    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1 FOR UPDATE',
      [email],
    );
    if (existingUsers.length > 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'An account already exists for the First Admin email.' });
    }

    if (Number(state.is_rate_limited) === 1) {
      await connection.rollback();
      transactionStarted = false;
      res.set('Retry-After', String(FIRST_ADMIN_REQUEST_COOLDOWN_SECONDS));
      return res.status(429).json({ message: 'Please wait before requesting another verification code.' });
    }

    code = generateVerificationCode();
    codeHash = verificationCodeDigest(code);
    const [challengeResult] = await connection.query(
      `UPDATE first_admin_bootstrap_state
       SET verification_code_hash = ?,
           verification_expires_at =
             DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${FIRST_ADMIN_CODE_TTL_MINUTES} MINUTE),
           failed_attempts = 0,
           last_requested_at = CURRENT_TIMESTAMP
       WHERE singleton_id = 1 AND completed_at IS NULL`,
      [codeHash],
    );
    if (challengeResult.affectedRows !== 1) {
      const stateError = new Error('First Admin bootstrap state could not be updated.');
      stateError.code = 'FIRST_ADMIN_BOOTSTRAP_STATE_UPDATE_FAILED';
      throw stateError;
    }
    await connection.commit();
    transactionStarted = false;

    try {
      await emailService.sendFirstAdminVerification(
        email,
        formatVerificationCode(code),
        FIRST_ADMIN_CODE_TTL_MINUTES,
      );
    } catch {
      const [clearResult] = await db.query(
        `UPDATE first_admin_bootstrap_state
         SET verification_code_hash = NULL,
             verification_expires_at = NULL
         WHERE singleton_id = 1
           AND verification_code_hash = ?
           AND completed_at IS NULL`,
        [codeHash],
      );
      if (clearResult.affectedRows !== 1) {
        const clearError = new Error('First Admin verification code could not be invalidated after email delivery failed.');
        clearError.code = 'FIRST_ADMIN_CODE_INVALIDATION_FAILED';
        throw clearError;
      }
      return res.status(502).json({ message: 'Could not send the verification email. Please try again later.' });
    }

    return res.status(202).json({
      message: 'If eligible, a verification code has been emailed to the configured First Admin address.',
      expires_in_minutes: FIRST_ADMIN_CODE_TTL_MINUTES,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(`First Admin request rollback failed: ${rollbackError.code || rollbackError.name}`);
      }
    }
    return next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function completeFirstAdminBootstrap(req, res, next) {
  if (!firstAdminEmail) {
    return res.status(503).json({ message: 'First Admin bootstrap is not configured.' });
  }

  const { full_name, password, verificationCode } = req.body;
  const email = req.body.email.trim().toLowerCase();
  if (email !== firstAdminEmail) {
    return res.status(403).json({ message: 'First Admin verification could not be completed.' });
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const state = await lockFirstAdminBootstrapState(connection);
    if (state.completed_at || await hasAdminAccount(connection)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'First Admin setup is no longer available.' });
    }

    if (Number(state.failed_attempts) >= FIRST_ADMIN_MAX_FAILED_ATTEMPTS) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(429).json({ message: 'Too many verification attempts. Request a new code later.' });
    }

    if (!state.verification_code_hash || Number(state.is_expired) === 1) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(403).json({ message: 'The verification code is invalid or expired.' });
    }

    const suppliedHash = Buffer.from(verificationCodeDigest(verificationCode), 'hex');
    const storedHash = Buffer.from(state.verification_code_hash, 'hex');
    const codeMatches = storedHash.length === suppliedHash.length &&
      crypto.timingSafeEqual(storedHash, suppliedHash);

    if (!codeMatches) {
      const failedAttempts = Number(state.failed_attempts) + 1;
      const [attemptResult] = await connection.query(
        `UPDATE first_admin_bootstrap_state
         SET failed_attempts = ?
         WHERE singleton_id = 1 AND completed_at IS NULL`,
        [failedAttempts],
      );
      if (attemptResult.affectedRows !== 1) {
        const stateError = new Error('First Admin verification attempt could not be recorded.');
        stateError.code = 'FIRST_ADMIN_BOOTSTRAP_STATE_UPDATE_FAILED';
        throw stateError;
      }
      await connection.commit();
      transactionStarted = false;
      if (failedAttempts >= FIRST_ADMIN_MAX_FAILED_ATTEMPTS) {
        return res.status(429).json({ message: 'Too many verification attempts. Request a new code later.' });
      }
      return res.status(403).json({ message: 'The verification code is invalid or expired.' });
    }

    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1 FOR UPDATE',
      [email],
    );
    if (existingUsers.length > 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'An account already exists for the First Admin email.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [insertResult] = await connection.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role)
       VALUES (?, ?, ?, ?, 'admin')`,
      [full_name.trim(), email, req.body.phone ? req.body.phone.trim() : null, passwordHash],
    );
    const user = {
      id: insertResult.insertId,
      full_name: full_name.trim(),
      email,
      phone: req.body.phone ? req.body.phone.trim() : null,
      role: 'admin',
    };

    const [completionResult] = await connection.query(
      `UPDATE first_admin_bootstrap_state
       SET verification_code_hash = NULL,
           verification_expires_at = NULL,
           failed_attempts = 0,
           completed_at = CURRENT_TIMESTAMP,
           admin_user_id = ?
       WHERE singleton_id = 1
         AND completed_at IS NULL
         AND verification_code_hash = ?`,
      [user.id, state.verification_code_hash],
    );
    if (completionResult.affectedRows !== 1) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'First Admin setup is no longer available.' });
    }

    await connection.commit();
    transactionStarted = false;
    return res.status(201).json(issueToken(user));
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(`First Admin completion rollback failed: ${rollbackError.code || rollbackError.name}`);
      }
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An account already exists for the First Admin email.' });
    }
    return next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function login(req, res, next) {
  const { email, password } = req.body;
  const requestedRole = req.body.role ? databaseRole(req.body.role) : null;

  try {
    const [rows] = await db.query(
      `SELECT id, full_name, email, phone, password_hash, role
       FROM users
       WHERE email = ? AND is_active = TRUE
       LIMIT 1`,
      [email],
    );
    const user = rows[0];

    const storedHash = user ? user.password_hash : await getDummyPasswordHash();
    const passwordMatches = await bcrypt.compare(password, storedHash);
    if (!user || (requestedRole && user.role !== requestedRole) || !passwordMatches) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    return res.json(issueToken(user));
  } catch (error) {
    return next(error);
  }
}

async function createStaffInvitation(req, res, next) {
  const code = `STAFF-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

  try {
    const [result] = await db.query(
      `INSERT INTO staff_invitations
         (code_hash, invited_email, role, created_by, expires_at)
       VALUES (?, NULL, 'staff', ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 7 DAY))`,
      [invitationDigest(code), req.user.id],
    );
    return res.status(201).json({
      id: result.insertId,
      code,
      role: 'staff',
      expires_in_days: 7,
    });
  } catch (error) {
    return next(error);
  }
}

function me(req, res) {
  return res.json({ user: publicUser(req.user) });
}

module.exports = {
  register,
  requestFirstAdminVerification,
  completeFirstAdminBootstrap,
  login,
  createStaffInvitation,
  me,
  issueToken,
  lockFirstAdminBootstrapState,
};
