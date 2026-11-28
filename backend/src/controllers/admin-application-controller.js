const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const {
  adminApplicationApproverEmail,
  adminApplicationApprovalConfigured,
} = require('../config/env');
const emailService = require('../services/email-service');
const {
  issueToken,
  lockFirstAdminBootstrapState,
} = require('./auth-controller');
const {
  generateVerificationCode,
  formatVerificationCode,
  verificationCodeDigest,
} = require('../utils/verification-code');
const {
  approvalTokenDigest,
} = require('../services/admin-application-approval-security');

const APPROVAL_TOKEN_TTL_HOURS = 48;
const VERIFICATION_CODE_TTL_MINUTES = 15;
const VERIFICATION_DEADLINE_HOURS = 24;
const VERIFICATION_RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFICATION_ATTEMPTS = 5;
const MAX_VERIFICATION_RESENDS = 3;
const SUBMISSION_RESPONSE = 'If eligible, the Admin application has been submitted for review.';
const RESEND_RESPONSE = 'If an approved application is eligible, a verification code will be sent.';
const INVALID_CODE_RESPONSE = 'The verification code is invalid or expired.';

function canonicalMailbox(email) {
  const [localPart, domain] = email.toLowerCase().split('@');
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${localPart.split('+')[0].replace(/\./g, '')}@gmail.com`;
  }
  return `${localPart}@${domain}`;
}

function generateApprovalToken() {
  return crypto.randomBytes(32).toString('hex').toUpperCase();
}

function isTrue(value) {
  return Number(value) === 1;
}

async function requestAdminApplication(req, res, next) {
  const fullName = req.body.full_name.trim();
  const email = req.body.email.trim().toLowerCase();
  if (canonicalMailbox(email) === canonicalMailbox(adminApplicationApproverEmail)) {
    return res.status(202).json({ message: SUBMISSION_RESPONSE });
  }
  const passwordHash = await bcrypt.hash(req.body.password, 10);
  const approvalToken = generateApprovalToken();
  const approvalTokenHash = approvalTokenDigest(approvalToken);
  let connection;
  let transactionStarted = false;
  let applicationId;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1 FOR UPDATE',
      [email],
    );
    if (existingUsers.length > 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(202).json({ message: SUBMISSION_RESPONSE });
    }

    const [activeApplications] = await connection.query(
      `SELECT id, status,
              ((status = 'pending_approval'
                  AND approval_expires_at <= CURRENT_TIMESTAMP)
                OR (status = 'pending_verification'
                  AND verification_deadline_at <= CURRENT_TIMESTAMP)) AS is_expired
       FROM admin_applications
       WHERE active_email = ?
       FOR UPDATE`,
      [email],
    );
    const activeApplication = activeApplications[0];
    if (activeApplication && !isTrue(activeApplication.is_expired)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(202).json({ message: SUBMISSION_RESPONSE });
    }
    if (activeApplication) {
      await connection.query(
        `UPDATE admin_applications
         SET status = 'expired',
             password_hash = NULL,
             approval_token_hash = NULL,
             approval_expires_at = NULL,
             verification_code_hash = NULL,
             verification_expires_at = NULL,
             verification_deadline_at = NULL
         WHERE id = ?`,
        [activeApplication.id],
      );
    }

    const [recentApplications] = await connection.query(
      `SELECT id,
              (created_at > DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${VERIFICATION_RESEND_COOLDOWN_SECONDS} SECOND))
                AS is_rate_limited
       FROM admin_applications
       WHERE email = ?
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [email],
    );
    if (recentApplications[0] && isTrue(recentApplications[0].is_rate_limited)) {
      await connection.rollback();
      transactionStarted = false;
      res.set('Retry-After', String(VERIFICATION_RESEND_COOLDOWN_SECONDS));
      return res.status(429).json({ message: 'Please wait before submitting another application.' });
    }

    const [insertResult] = await connection.query(
      `INSERT INTO admin_applications
         (full_name, email, password_hash, status, approval_token_hash, approval_expires_at)
       VALUES (?, ?, ?, 'pending_approval', ?,
               DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${APPROVAL_TOKEN_TTL_HOURS} HOUR))`,
      [fullName, email, passwordHash, approvalTokenHash],
    );
    applicationId = insertResult.insertId;
    await connection.commit();
    transactionStarted = false;

    try {
      await emailService.sendAdminApplicationApprovalRequest(
        { id: applicationId, fullName, email },
        approvalToken,
      );
    } catch {
      const [failureResult] = await db.query(
        `UPDATE admin_applications
         SET status = 'email_failed',
             password_hash = NULL,
             approval_token_hash = NULL,
             approval_expires_at = NULL
         WHERE id = ? AND approval_token_hash = ? AND status = 'pending_approval'`,
        [applicationId, approvalTokenHash],
      );
      if (failureResult.affectedRows !== 1) {
        const failure = new Error('Failed Admin application could not be invalidated.');
        failure.code = 'ADMIN_APPLICATION_INVALIDATION_FAILED';
        throw failure;
      }
      return res.status(502).json({ message: 'The application could not be submitted. Please try again later.' });
    }

    return res.status(202).json({ message: SUBMISSION_RESPONSE });
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(`Admin application rollback failed: ${rollbackError.code || rollbackError.name}`);
      }
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(202).json({ message: SUBMISSION_RESPONSE });
    }
    return next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function resendAdminApplicationApproval(req, res, next) {
  if (!adminApplicationApprovalConfigured) {
    return res.status(503).json({
      message: 'Admin application approval email is not configured.',
    });
  }
  const approvalToken = generateApprovalToken();
  const approvalTokenHash = approvalTokenDigest(approvalToken);
  let connection;
  let transactionStarted = false;
  let application;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const [rows] = await connection.query(
      `SELECT id, full_name, email, status
       FROM admin_applications
       WHERE id = ?
       FOR UPDATE`,
      [req.params.applicationId],
    );
    application = rows[0];
    if (!application) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Admin application not found.' });
    }
    if (application.status !== 'pending_approval') {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Only pending approval applications can be resent.' });
    }

    const [updateResult] = await connection.query(
      `UPDATE admin_applications
       SET approval_token_hash = ?,
           approval_expires_at =
             DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${APPROVAL_TOKEN_TTL_HOURS} HOUR)
       WHERE id = ? AND status = 'pending_approval'`,
      [approvalTokenHash, application.id],
    );
    if (updateResult.affectedRows !== 1) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'Only pending approval applications can be resent.' });
    }

    await connection.commit();
    transactionStarted = false;

    try {
      await emailService.sendAdminApplicationApprovalRequest(
        { id: application.id, fullName: application.full_name, email: application.email },
        approvalToken,
      );
    } catch {
      return res.status(502).json({
        message: 'The application remains pending, but the approval email could not be submitted.',
      });
    }

    return res.status(202).json({
      message: 'Approval email accepted by SMTP; delivery is not confirmed.',
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(`Admin approval resend rollback failed: ${rollbackError.code || rollbackError.name}`);
      }
    }
    return next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function decideAdminApplication(req, res, next) {
  const tokenHash = approvalTokenDigest(req.body.token);
  const decision = req.body.decision;
  const verificationCode = decision === 'approve' ? generateVerificationCode() : null;
  const verificationCodeHash = verificationCode
    ? verificationCodeDigest(verificationCode)
    : null;
  let connection;
  let transactionStarted = false;
  let application;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT id, full_name, email,
              (approval_expires_at <= CURRENT_TIMESTAMP) AS is_expired
       FROM admin_applications
       WHERE approval_token_hash = ? AND status = 'pending_approval'
       FOR UPDATE`,
      [tokenHash],
    );
    application = rows[0];
    if (!application) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(410).json({ message: 'This approval link is invalid, expired, or already used.' });
    }
    if (isTrue(application.is_expired)) {
      await connection.query(
        `UPDATE admin_applications
         SET status = 'expired',
             password_hash = NULL,
             approval_token_hash = NULL,
             approval_expires_at = NULL
         WHERE id = ? AND status = 'pending_approval'`,
        [application.id],
      );
      await connection.commit();
      transactionStarted = false;
      return res.status(410).json({ message: 'This approval link is invalid, expired, or already used.' });
    }

    if (decision === 'approve') {
      await connection.query(
        `UPDATE admin_applications
         SET status = 'pending_verification',
             approval_token_hash = NULL,
             approval_expires_at = NULL,
             approved_at = CURRENT_TIMESTAMP,
             verification_code_hash = ?,
             verification_expires_at =
               DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${VERIFICATION_CODE_TTL_MINUTES} MINUTE),
             verification_deadline_at =
               DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${VERIFICATION_DEADLINE_HOURS} HOUR),
             verification_failed_attempts = 0,
             verification_resend_count = 0,
             verification_last_sent_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending_approval'`,
        [verificationCodeHash, application.id],
      );
    } else {
      await connection.query(
        `UPDATE admin_applications
         SET status = 'rejected',
             password_hash = NULL,
             approval_token_hash = NULL,
             approval_expires_at = NULL,
             rejected_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending_approval'`,
        [application.id],
      );
    }
    await connection.commit();
    transactionStarted = false;

    try {
      if (decision === 'approve') {
        await emailService.sendAdminApplicationVerification(
          application.email,
          formatVerificationCode(verificationCode),
          VERIFICATION_CODE_TTL_MINUTES,
        );
      } else {
        await emailService.sendAdminApplicationRejection(application.email);
      }
    } catch {
      if (decision === 'approve') {
        const [clearResult] = await db.query(
          `UPDATE admin_applications
           SET verification_code_hash = NULL,
               verification_expires_at = NULL
           WHERE id = ? AND verification_code_hash = ? AND status = 'pending_verification'`,
          [application.id, verificationCodeHash],
        );
        if (clearResult.affectedRows !== 1) {
          const clearError = new Error('Undelivered Admin verification code could not be invalidated.');
          clearError.code = 'ADMIN_VERIFICATION_INVALIDATION_FAILED';
          throw clearError;
        }
      }
      return res.status(502).json({
        message: decision === 'approve'
          ? 'The decision was recorded, but the applicant email could not be sent.'
          : 'The decision was recorded, but the applicant notification could not be sent.',
      });
    }

    return res.json({
      message: decision === 'approve'
        ? 'Approval recorded. SMTP accepted the verification email; delivery is not confirmed.'
        : 'Rejection recorded. SMTP accepted the applicant notification; delivery is not confirmed.',
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(`Admin application decision rollback failed: ${rollbackError.code || rollbackError.name}`);
      }
    }
    return next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function resendAdminApplicationCode(req, res, next) {
  const email = req.body.email.trim().toLowerCase();
  const verificationCode = generateVerificationCode();
  const verificationCodeHash = verificationCodeDigest(verificationCode);
  let connection;
  let transactionStarted = false;
  let application;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(
      `SELECT id, email,
              (verification_deadline_at <= CURRENT_TIMESTAMP) AS is_deadline_expired,
              (verification_last_sent_at >
                DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${VERIFICATION_RESEND_COOLDOWN_SECONDS} SECOND))
                AS is_rate_limited,
              verification_resend_count
       FROM admin_applications
       WHERE email = ? AND status = 'pending_verification'
       FOR UPDATE`,
      [email],
    );
    application = rows[0];
    if (!application) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(202).json({ message: RESEND_RESPONSE });
    }
    if (isTrue(application.is_deadline_expired)) {
      await connection.query(
        `UPDATE admin_applications
         SET status = 'expired',
             password_hash = NULL,
             verification_code_hash = NULL,
             verification_expires_at = NULL,
             verification_deadline_at = NULL
         WHERE id = ? AND status = 'pending_verification'`,
        [application.id],
      );
      await connection.commit();
      transactionStarted = false;
      return res.status(202).json({ message: RESEND_RESPONSE });
    }
    if (
      isTrue(application.is_rate_limited) ||
      Number(application.verification_resend_count) >= MAX_VERIFICATION_RESENDS
    ) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(202).json({ message: RESEND_RESPONSE });
    }

    const [updateResult] = await connection.query(
      `UPDATE admin_applications
       SET verification_code_hash = ?,
           verification_expires_at =
             DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${VERIFICATION_CODE_TTL_MINUTES} MINUTE),
           verification_failed_attempts = 0,
           verification_resend_count = verification_resend_count + 1,
           verification_last_sent_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'pending_verification'
         AND verification_resend_count < ${MAX_VERIFICATION_RESENDS}`,
      [verificationCodeHash, application.id],
    );
    if (updateResult.affectedRows !== 1) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(202).json({ message: RESEND_RESPONSE });
    }
    await connection.commit();
    transactionStarted = false;

    try {
      await emailService.sendAdminApplicationVerification(
        email,
        formatVerificationCode(verificationCode),
        VERIFICATION_CODE_TTL_MINUTES,
      );
    } catch {
      const [clearResult] = await db.query(
        `UPDATE admin_applications
         SET verification_code_hash = NULL,
             verification_expires_at = NULL
         WHERE id = ? AND verification_code_hash = ? AND status = 'pending_verification'`,
        [application.id, verificationCodeHash],
      );
      if (clearResult.affectedRows !== 1) {
        const clearError = new Error('Undelivered Admin verification code could not be invalidated.');
        clearError.code = 'ADMIN_VERIFICATION_INVALIDATION_FAILED';
        throw clearError;
      }
      return res.status(502).json({ message: 'The verification email could not be sent. Please try again later.' });
    }

    return res.status(202).json({ message: RESEND_RESPONSE });
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(`Admin verification resend rollback failed: ${rollbackError.code || rollbackError.name}`);
      }
    }
    return next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function verifyAdminApplication(req, res, next) {
  const email = req.body.email.trim().toLowerCase();
  const { verificationCode } = req.body;
  let connection;
  let transactionStarted = false;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    await lockFirstAdminBootstrapState(connection);

    const [rows] = await connection.query(
      `SELECT id, full_name, email, password_hash, verification_code_hash,
              verification_failed_attempts,
              (verification_expires_at IS NOT NULL
                AND verification_expires_at <= CURRENT_TIMESTAMP) AS is_code_expired,
              (verification_deadline_at IS NOT NULL
                AND verification_deadline_at <= CURRENT_TIMESTAMP) AS is_deadline_expired
       FROM admin_applications
       WHERE email = ? AND status = 'pending_verification'
       FOR UPDATE`,
      [email],
    );
    const application = rows[0];
    if (!application) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(403).json({ message: INVALID_CODE_RESPONSE });
    }

    if (isTrue(application.is_deadline_expired)) {
      await connection.query(
        `UPDATE admin_applications
         SET status = 'expired',
             password_hash = NULL,
             verification_code_hash = NULL,
             verification_expires_at = NULL,
             verification_deadline_at = NULL
         WHERE id = ? AND status = 'pending_verification'`,
        [application.id],
      );
      await connection.commit();
      transactionStarted = false;
      return res.status(403).json({ message: INVALID_CODE_RESPONSE });
    }

    if (Number(application.verification_failed_attempts) >= MAX_VERIFICATION_ATTEMPTS) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(429).json({ message: 'Too many verification attempts. Request a new application.' });
    }

    if (!application.verification_code_hash || isTrue(application.is_code_expired)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(403).json({ message: INVALID_CODE_RESPONSE });
    }

    const suppliedHash = Buffer.from(verificationCodeDigest(verificationCode), 'hex');
    const storedHash = Buffer.from(application.verification_code_hash, 'hex');
    const matches = storedHash.length === suppliedHash.length &&
      crypto.timingSafeEqual(storedHash, suppliedHash);
    if (!matches) {
      const failedAttempts = Number(application.verification_failed_attempts) + 1;
      if (failedAttempts >= MAX_VERIFICATION_ATTEMPTS) {
        await connection.query(
          `UPDATE admin_applications
           SET status = 'expired',
               password_hash = NULL,
               verification_code_hash = NULL,
               verification_expires_at = NULL,
               verification_deadline_at = NULL,
               verification_failed_attempts = ?
           WHERE id = ? AND status = 'pending_verification'`,
          [failedAttempts, application.id],
        );
      } else {
        await connection.query(
          `UPDATE admin_applications
           SET verification_failed_attempts = ?
           WHERE id = ? AND status = 'pending_verification'`,
          [failedAttempts, application.id],
        );
      }
      await connection.commit();
      transactionStarted = false;
      return res.status(failedAttempts >= MAX_VERIFICATION_ATTEMPTS ? 429 : 403).json({
        message: failedAttempts >= MAX_VERIFICATION_ATTEMPTS
          ? 'Too many verification attempts. Request a new application.'
          : INVALID_CODE_RESPONSE,
      });
    }

    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1 FOR UPDATE',
      [email],
    );
    if (existingUsers.length > 0) {
      await connection.query(
        `UPDATE admin_applications
         SET status = 'expired',
             password_hash = NULL,
             verification_code_hash = NULL,
             verification_expires_at = NULL,
             verification_deadline_at = NULL
         WHERE id = ? AND status = 'pending_verification'`,
        [application.id],
      );
      await connection.commit();
      transactionStarted = false;
      return res.status(409).json({ message: 'An account already exists for this email.' });
    }

    const [insertResult] = await connection.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role)
       VALUES (?, ?, NULL, ?, 'admin')`,
      [application.full_name, application.email, application.password_hash],
    );
    const user = {
      id: insertResult.insertId,
      full_name: application.full_name,
      email: application.email,
      phone: null,
      role: 'admin',
    };

    const [completionResult] = await connection.query(
      `UPDATE admin_applications
       SET status = 'completed',
           password_hash = NULL,
           verification_code_hash = NULL,
           verification_expires_at = NULL,
           verification_deadline_at = NULL,
           verification_failed_attempts = 0,
           completed_at = CURRENT_TIMESTAMP,
           admin_user_id = ?
       WHERE id = ? AND status = 'pending_verification'`,
      [user.id, application.id],
    );
    if (completionResult.affectedRows !== 1) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: 'The Admin application is no longer available.' });
    }

    await connection.query(
      `UPDATE first_admin_bootstrap_state
       SET verification_code_hash = NULL,
           verification_expires_at = NULL,
           failed_attempts = 0,
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
           admin_user_id = COALESCE(admin_user_id, ?)
       WHERE singleton_id = 1`,
      [user.id],
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(201).json(issueToken(user));
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(`Admin application verification rollback failed: ${rollbackError.code || rollbackError.name}`);
      }
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An account already exists for this email.' });
    }
    return next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  requestAdminApplication,
  resendAdminApplicationApproval,
  decideAdminApplication,
  resendAdminApplicationCode,
  verifyAdminApplication,
};
