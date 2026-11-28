const nodemailer = require('nodemailer');
const {
  adminApplicationApproverEmail,
  publicApiBaseUrl,
  smtp,
} = require('../config/env');
const {
  API_VERSION_PREFIX,
  AUTH_ROUTE_PREFIX,
  ADMIN_APPLICATION_ACTION_ROUTE,
} = require('../routes/admin-application-paths');
const {
  createActionSignature,
} = require('./admin-application-approval-security');
const {
  adminApplicationApprovalConfigured,
} = require('../config/env');

function createTransporter() {
  if (!smtp.host || !smtp.user || !smtp.password || !smtp.from) {
    throw new Error('SMTP configuration is incomplete.');
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.password,
    },
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function isSafeLogValue(value, pattern, maxLength) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    pattern.test(value);
}

function safeRecipient(recipient) {
  return isSafeLogValue(recipient, /^[^\s@<>]+@[^\s@<>]+$/, 254)
    ? recipient
    : 'unavailable';
}

function safeMessageId(messageId) {
  return isSafeLogValue(messageId, /^[A-Za-z0-9@._+<>-]+$/, 255)
    ? messageId
    : 'unavailable';
}

function safeSmtpErrorDetails(error) {
  const details = {
    code: isSafeLogValue(error && error.code, /^[A-Za-z0-9_-]+$/, 40)
      ? error.code
      : 'UNKNOWN',
    command: isSafeLogValue(error && error.command, /^[A-Za-z0-9 _-]+$/, 40)
      ? error.command
      : 'UNKNOWN',
  };
  if (Number.isInteger(error && error.responseCode)) {
    details.responseCode = error.responseCode;
  }
  return details;
}

function getAdminApiBaseUrl() {
  const baseUrl = publicApiBaseUrl.replace(/\/+$/, '');
  return baseUrl.endsWith(API_VERSION_PREFIX)
    ? baseUrl
    : `${baseUrl}${API_VERSION_PREFIX}`;
}

async function sendAdminApplicationEmail(operation, message) {
  const recipient = safeRecipient(message.to);

  try {
    const transporter = createTransporter();
    const result = await transporter.sendMail(message);
    const recipientAccepted = typeof message.to === 'string' &&
      Array.isArray(result.accepted) &&
      result.accepted.some((address) =>
        typeof address === 'string' &&
        address.toLowerCase() === message.to.toLowerCase(),
      );
    if (!recipientAccepted) {
      const error = new Error('SMTP did not accept the recipient.');
      error.code = 'SMTP_RECIPIENT_NOT_ACCEPTED';
      throw error;
    }

    console.info('Admin application email accepted by SMTP; mailbox delivery is unconfirmed.', {
      operation,
      recipient,
      messageId: safeMessageId(result.messageId),
    });
    return result;
  } catch (error) {
    console.error('Admin application SMTP submission failed.', {
      operation,
      recipient,
      ...safeSmtpErrorDetails(error),
    });
    throw error;
  }
}

async function sendAdminApplicationApprovalRequest(application, approvalToken) {
  if (!publicApiBaseUrl || !adminApplicationApprovalConfigured) {
    console.error('Admin application email configuration is incomplete.', {
      operation: 'approval_request',
      recipient: safeRecipient(adminApplicationApproverEmail),
      code: 'APPROVAL_OAUTH_CONFIGURATION_MISSING',
    });
    throw new Error('Admin application approval email configuration is incomplete.');
  }
  if (!Number.isSafeInteger(Number(application.id)) || Number(application.id) < 1) {
    throw new Error('Admin application ID is required for approval actions.');
  }
  const actionUrl = (decision) => {
    const signature = createActionSignature(application.id, decision, approvalToken);
    return `${getAdminApiBaseUrl()}${AUTH_ROUTE_PREFIX}${ADMIN_APPLICATION_ACTION_ROUTE}/${application.id}/${decision}#token=${approvalToken}&signature=${signature}`;
  };
  const approveUrl = actionUrl('approve');
  const declineUrl = actionUrl('decline');
  const safeName = escapeHtml(application.fullName);
  const safeEmail = escapeHtml(application.email);
  const safeApproveUrl = escapeHtml(approveUrl);
  const safeDeclineUrl = escapeHtml(declineUrl);

  await sendAdminApplicationEmail('approval_request', {
    from: smtp.from,
    to: adminApplicationApproverEmail,
    subject: 'LabadaHub Admin application requires review',
    text: [
      'An applicant requested a LabadaHub Admin account.',
      `Name: ${application.fullName}`,
      `Email: ${application.email}`,
      '',
      `APPROVE: ${approveUrl}`,
      `DECLINE: ${declineUrl}`,
      'These actions expire after 48 hours.',
    ].join('\n'),
    html: [
      '<p>An applicant requested a LabadaHub Admin account.</p>',
      `<p><strong>Name:</strong> ${safeName}<br><strong>Email:</strong> ${safeEmail}</p>`,
      `<p><a href="${safeApproveUrl}" style="display:inline-block;background:#188038;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px;font-weight:bold">APPROVE</a></p>`,
      `<p><a href="${safeDeclineUrl}" style="display:inline-block;background:#b3261e;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px;font-weight:bold">DECLINE</a></p>`,
      '<p>These actions expire after 48 hours.</p>',
    ].join(''),
  });
}

async function sendAdminApplicationVerification(recipientEmail, verificationCode, expiresInMinutes) {
  await sendAdminApplicationEmail('verification_code', {
    from: smtp.from,
    to: recipientEmail,
    subject: 'LabadaHub Admin application approved',
    text: [
      'Your LabadaHub Admin application was approved.',
      '',
      `Email verification code: ${verificationCode}`,
      `This code expires in ${expiresInMinutes} minutes and can be used once.`,
      'Enter this code in the LabadaHub Admin application screen to finish registration.',
    ].join('\n'),
    html: [
      '<p>Your LabadaHub Admin application was approved.</p>',
      `<p><strong>Email verification code:</strong> ${verificationCode}</p>`,
      `<p>This code expires in ${expiresInMinutes} minutes and can be used once.</p>`,
      '<p>Enter this code in the LabadaHub Admin application screen to finish registration.</p>',
    ].join(''),
  });
}

async function sendAdminApplicationRejection(recipientEmail) {
  await sendAdminApplicationEmail('rejection_notice', {
    from: smtp.from,
    to: recipientEmail,
    subject: 'LabadaHub Admin application update',
    text: 'Your LabadaHub Admin application was not approved.',
    html: '<p>Your LabadaHub Admin application was not approved.</p>',
  });
}

async function sendFirstAdminVerification(recipientEmail, verificationCode, expiresInMinutes) {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: smtp.from,
    to: recipientEmail,
    subject: 'LabadaHub First Admin verification',
    text: [
      'A First Admin account setup was requested for this email address.',
      '',
      `Verification code: ${verificationCode}`,
      `This code expires in ${expiresInMinutes} minutes and can be used only once.`,
      'If you did not request this, you can ignore this message.',
    ].join('\n'),
    html: [
      '<p>A First Admin account setup was requested for this email address.</p>',
      `<p><strong>Verification code:</strong> ${verificationCode}</p>`,
      `<p>This code expires in ${expiresInMinutes} minutes and can be used only once.</p>`,
      '<p>If you did not request this, you can ignore this message.</p>',
    ].join(''),
  });
}

module.exports = {
  sendAdminApplicationApprovalRequest,
  sendAdminApplicationVerification,
  sendAdminApplicationRejection,
  sendFirstAdminVerification,
};
