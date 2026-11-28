const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { rateLimit } = require('express-rate-limit');
const authController = require('../controllers/auth-controller');
const adminApplicationController = require('../controllers/admin-application-controller');
const adminApplicationApprovalController = require('../controllers/admin-application-approval-controller');
const { authenticate, authorize } = require('../middleware/auth');
const {
  ADMIN_APPLICATIONS_ROUTE,
  ADMIN_APPLICATION_ACTION_ROUTE,
  ADMIN_APPLICATION_DECISION_ROUTE,
  ADMIN_APPLICATION_OAUTH_CALLBACK_ROUTE,
  ADMIN_APPLICATION_CONFIRMATION_ROUTE,
} = require('./admin-application-paths');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is missing. Add it to backend/.env before starting the server.');
}

function requireObjectBody(req, res, next) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ message: 'Request body must be an object' });
  }

  next();
}

function normalizeRegistrationName(req, _res, next) {
  if (req.body.full_name === undefined && req.body.name !== undefined) {
    req.body.full_name = req.body.name;
  }
  next();
}

function emailRule() {
  return body('email')
    .isString().withMessage('email is required')
    .bail()
    .trim()
    .toLowerCase()
    .isEmail().withMessage('A valid email is required')
    .isLength({ max: 100 }).withMessage('email must be at most 100 characters');
}

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  next();
}

function createRequestLimiter(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many requests. Please try again later.' },
  });
}

const applicationRequestLimiter = createRequestLimiter(20);
const applicationDecisionLimiter = createRequestLimiter(20);
const applicationResendLimiter = createRequestLimiter(10);
const applicationVerificationLimiter = createRequestLimiter(20);
const applicationApprovalResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user.id}:${req.params.applicationId}`,
  message: { message: 'Too many approval email requests. Please try again later.' },
});

const registerRules = [
  body('full_name')
    .isString().withMessage('name is required')
    .bail()
    .trim()
    .notEmpty().withMessage('name is required')
    .isLength({ max: 100 }).withMessage('name must be at most 100 characters'),
  emailRule(),
  body('phone')
    .optional({ values: 'falsy' })
    .isString().withMessage('phone must be text')
    .bail()
    .trim()
    .matches(/^\+?[0-9 -]{7,19}$/)
    .withMessage('phone must be 7 to 19 digits (spaces, dashes and a leading + allowed)'),
  body('password')
    .isString().withMessage('password is required')
    .bail()
    .isLength({ min: 8 }).withMessage('password must be at least 8 characters')
    .custom((value) => Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('password must be at most 72 bytes'),
  body('role')
    .optional()
    .isIn(['client', 'customer', 'staff', 'admin'])
    .withMessage('role must be client, customer, staff, or admin'),
  body('inviteCode')
    .optional({ values: 'falsy' })
    .isString().withMessage('inviteCode must be text')
    .bail()
    .trim()
    .isLength({ max: 128 }).withMessage('inviteCode must be at most 128 characters'),
];

const firstAdminCompletionRules = [
  body('full_name')
    .isString().withMessage('name is required')
    .bail()
    .trim()
    .notEmpty().withMessage('name is required')
    .isLength({ max: 100 }).withMessage('name must be at most 100 characters'),
  emailRule(),
  body('phone')
    .optional({ values: 'falsy' })
    .isString().withMessage('phone must be text')
    .bail()
    .trim()
    .matches(/^\+?[0-9 -]{7,19}$/)
    .withMessage('phone must be 7 to 19 digits (spaces, dashes and a leading + allowed)'),
  body('password')
    .isString().withMessage('password is required')
    .bail()
    .isLength({ min: 8 }).withMessage('password must be at least 8 characters')
    .custom((value) => Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('password must be at most 72 bytes'),
  body('verificationCode')
    .isString().withMessage('verificationCode is required')
    .bail()
    .trim()
    .matches(/^(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4})$/)
    .withMessage('verificationCode is invalid'),
];

const adminApplicationRules = [
  body('full_name')
    .isString().withMessage('name is required')
    .bail()
    .trim()
    .notEmpty().withMessage('name is required')
    .isLength({ max: 100 }).withMessage('name must be at most 100 characters'),
  emailRule(),
  body('password')
    .isString().withMessage('password is required')
    .bail()
    .isLength({ min: 8 }).withMessage('password must be at least 8 characters')
    .custom((value) => Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('password must be at most 72 bytes'),
];

const adminApplicationVerificationRules = [
  emailRule(),
  body('verificationCode')
    .isString().withMessage('verificationCode is required')
    .bail()
    .trim()
    .matches(/^(?:[A-Za-z0-9]{12}|[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4})$/)
    .withMessage('verificationCode is invalid'),
];

const loginRules = [
  emailRule(),
  body('password')
    .isString().withMessage('password is required')
    .bail()
    .notEmpty().withMessage('password is required'),
  body('role')
    .optional()
    .isIn(['client', 'customer', 'staff', 'admin'])
    .withMessage('role must be client, customer, staff, or admin'),
];

router.post(
  '/register',
  requireObjectBody,
  normalizeRegistrationName,
  registerRules,
  validateRequest,
  authController.register,
);

router.post(
  '/bootstrap-admin/request',
  requireObjectBody,
  emailRule(),
  validateRequest,
  authController.requestFirstAdminVerification,
);

router.post(
  '/bootstrap-admin/complete',
  requireObjectBody,
  normalizeRegistrationName,
  firstAdminCompletionRules,
  validateRequest,
  authController.completeFirstAdminBootstrap,
);

router.post(
  ADMIN_APPLICATIONS_ROUTE,
  applicationRequestLimiter,
  requireObjectBody,
  normalizeRegistrationName,
  adminApplicationRules,
  validateRequest,
  adminApplicationController.requestAdminApplication,
);

router.post(
  '/admin-applications/:applicationId/resend-approval',
  authenticate,
  authorize('admin'),
  applicationApprovalResendLimiter,
  param('applicationId')
    .isInt({ min: 1 })
    .withMessage('applicationId must be a positive integer'),
  validateRequest,
  adminApplicationController.resendAdminApplicationApproval,
);

router.post(
  ADMIN_APPLICATION_DECISION_ROUTE,
  applicationDecisionLimiter,
  express.urlencoded({ extended: false, limit: '2kb' }),
  adminApplicationApprovalController.submitDecision,
);

router.get(
  `${ADMIN_APPLICATION_ACTION_ROUTE}/:applicationId/:decision`,
  param('applicationId').isInt({ min: 1 }),
  param('decision').isIn(['approve', 'decline']),
  validateRequest,
  adminApplicationApprovalController.renderActionPage,
);

router.post(
  `${ADMIN_APPLICATION_ACTION_ROUTE}/:applicationId/:decision/start`,
  applicationDecisionLimiter,
  express.json({ limit: '2kb' }),
  requireObjectBody,
  param('applicationId').isInt({ min: 1 }),
  param('decision').isIn(['approve', 'decline']),
  body('token').isString().matches(/^[A-Fa-f0-9]{64}$/),
  body('signature').isString().matches(/^[A-Fa-f0-9]{64}$/),
  validateRequest,
  adminApplicationApprovalController.startOAuthFlow,
);

router.get(
  ADMIN_APPLICATION_OAUTH_CALLBACK_ROUTE,
  adminApplicationApprovalController.handleOAuthCallback,
);

router.get(
  ADMIN_APPLICATION_CONFIRMATION_ROUTE,
  adminApplicationApprovalController.renderConfirmationPage,
);

router.post(
  '/admin-applications/resend',
  applicationResendLimiter,
  requireObjectBody,
  emailRule(),
  validateRequest,
  adminApplicationController.resendAdminApplicationCode,
);

router.post(
  '/admin-applications/verify',
  applicationVerificationLimiter,
  requireObjectBody,
  adminApplicationVerificationRules,
  validateRequest,
  adminApplicationController.verifyAdminApplication,
);

router.post(
  '/login',
  requireObjectBody,
  loginRules,
  validateRequest,
  authController.login,
);

router.post(
  '/invitations/staff',
  authenticate,
  authorize('admin'),
  requireObjectBody,
  body('role').equals('staff').withMessage('role must be staff'),
  validateRequest,
  authController.createStaffInvitation,
);

router.get('/me', authenticate, authController.me);

module.exports = router;
