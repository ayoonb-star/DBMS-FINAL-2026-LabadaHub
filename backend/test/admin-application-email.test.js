const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const nodemailer = require('nodemailer');

process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.ADMIN_APPLICATION_APPROVER_EMAIL = 'labadahub7@gmail.com';
process.env.PUBLIC_API_BASE_URL = 'https://api.example.test';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI =
  'https://api.example.test/api/v1/auth/admin-applications/oauth/callback';
process.env.ADMIN_APPLICATION_SECURITY_SECRET = crypto.randomBytes(32).toString('hex');
process.env.SMTP_HOST = 'smtp.example.test';
process.env.SMTP_USER = 'smtp-user-placeholder';
process.env.SMTP_PASS = 'smtp-password-placeholder';
process.env.SMTP_FROM = 'LabadaHub <smtp-user-placeholder@example.test>';

const app = require('../src/app');
const emailService = require('../src/services/email-service');
const {
  verifyActionSignature,
} = require('../src/services/admin-application-approval-security');
const originalCreateTransport = nodemailer.createTransport;
let sentMessages = [];
let sendFailure;
let server;
let baseUrl;

async function withCapturedConsole(method, action) {
  const original = console[method];
  const entries = [];
  console[method] = (...args) => entries.push(args);
  try {
    await action();
  } finally {
    console[method] = original;
  }
  return entries;
}

before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  sentMessages = [];
  sendFailure = null;
  nodemailer.createTransport = () => ({
    async sendMail(message) {
      sentMessages.push(message);
      if (sendFailure) {
        throw sendFailure;
      }
      return {
        messageId: '<mock-message-id@example.test>',
        accepted: [message.to],
        rejected: [],
      };
    },
  });
});

after(async () => {
  nodemailer.createTransport = originalCreateTransport;
  if (server && server.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('builds exactly two signed HTTPS approval actions and logs SMTP acceptance', async () => {
  const approvalToken = crypto.randomBytes(32).toString('hex').toUpperCase();
  const infoLogs = await withCapturedConsole('info', async () => {
    await emailService.sendAdminApplicationApprovalRequest(
      { id: 17, fullName: 'Applicant Example', email: 'applicant@example.com' },
      approvalToken,
    );
  });
  const message = sentMessages[0];
  const actionUrls = [...message.html.matchAll(/href="([^"]+)"/g)]
    .map((match) => match[1].replace(/&amp;/g, '&'));

  assert.equal(sentMessages.length, 1);
  assert.equal(message.to, 'labadahub7@gmail.com');
  assert.doesNotMatch(message.text, /AMP-enabled|cannot securely submit/i);
  assert.doesNotMatch(message.html, /AMP-enabled|cannot securely submit|amp4email/i);
  assert.equal(actionUrls.length, 2);
  assert.match(message.html, />APPROVE<\/a>/);
  assert.match(message.html, />DECLINE<\/a>/);
  assert.match(message.text, /APPROVE: https:\/\/api\.example\.test\/api\/v1\/auth\/admin-applications\/action\/17\/approve#/);
  assert.match(message.text, /DECLINE: https:\/\/api\.example\.test\/api\/v1\/auth\/admin-applications\/action\/17\/decline#/);
  assert.doesNotMatch(message.text, /AMP-enabled|cannot securely submit/i);

  const approveUrl = new URL(actionUrls[0]);
  const declineUrl = new URL(actionUrls[1]);
  assert.equal(approveUrl.pathname, `${ADMIN_APPLICATION_ACTION_ROUTE_PATH}/17/approve`);
  assert.equal(declineUrl.pathname, `${ADMIN_APPLICATION_ACTION_ROUTE_PATH}/17/decline`);
  assert.match(approveUrl.hash, new RegExp(`token=${approvalToken}&signature=[A-Fa-f0-9]{64}`));
  assert.match(declineUrl.hash, new RegExp(`token=${approvalToken}&signature=[A-Fa-f0-9]{64}`));
  assert.notEqual(approveUrl.hash, declineUrl.hash);
  const approveParams = new URLSearchParams(approveUrl.hash.slice(1));
  const declineParams = new URLSearchParams(declineUrl.hash.slice(1));
  assert.equal(verifyActionSignature(17, 'approve', approveParams.get('token'), approveParams.get('signature')), true);
  assert.equal(verifyActionSignature(17, 'decline', declineParams.get('token'), declineParams.get('signature')), true);
  assert.equal(verifyActionSignature(17, 'decline', approveParams.get('token'), approveParams.get('signature')), false);
  assert.equal(message.amp, undefined);

  const logText = JSON.stringify(infoLogs);
  assert.match(logText, /accepted by SMTP/);
  assert.match(logText, /delivery is unconfirmed/);
  assert.match(logText, /labadahub7@gmail\.com/);
  assert.match(logText, /mock-message-id@example\.test/);
  assert.doesNotMatch(logText, /\bdelivered\b/i);
});

test('generated HTTPS action URL reaches the mounted scanner-safe page route', async () => {
  await emailService.sendAdminApplicationApprovalRequest(
    { id: 18, fullName: 'Applicant Example', email: 'applicant@example.com' },
    crypto.randomBytes(32).toString('hex').toUpperCase(),
  );
  const actionUrl = [...sentMessages[0].html.matchAll(/href="([^"]+)"/g)][0][1]
    .replace(/&amp;/g, '&');
  const actionPath = new URL(actionUrl).pathname;

  const getResponse = await fetch(`${baseUrl}${actionPath}`, { redirect: 'manual' });
  assert.equal(getResponse.status, 200);
  assert.match(await getResponse.text(), /Sign in with the authorized LabadaHub approver account/);
  assert.match(actionPath, /\/admin-applications\/action\/18\/approve$/);
});

test('logs sanitized SMTP failure details and rethrows the original error', async () => {
  const secrets = [
    process.env.SMTP_PASS,
    'A'.repeat(64),
    'AB12-CD34-EF56',
    'ApplicantPassword-Secret',
  ];
  sendFailure = Object.assign(new Error(secrets.join(' ')), {
    code: 'EAUTH',
    command: 'AUTH PLAIN',
    responseCode: 535,
    response: secrets.join(' '),
  });

  let caughtError;
  const errorLogs = await withCapturedConsole('error', async () => {
    try {
      await emailService.sendAdminApplicationApprovalRequest(
        { id: 19, fullName: 'Applicant Example', email: 'applicant@example.com' },
        secrets[1],
      );
    } catch (error) {
      caughtError = error;
    }
  });
  const logText = JSON.stringify(errorLogs);

  assert.equal(caughtError, sendFailure);
  assert.match(logText, /EAUTH/);
  assert.match(logText, /AUTH PLAIN/);
  assert.match(logText, /535/);
  for (const secret of secrets) {
    assert.equal(logText.includes(secret), false);
  }
});

test('sends the verification code to the applicant with its expiry notice', async () => {
  const code = 'AB12-CD34-EF56';
  await emailService.sendAdminApplicationVerification(
    'applicant@example.com',
    code,
    15,
  );

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, 'applicant@example.com');
  assert.match(sentMessages[0].text, new RegExp(code));
  assert.match(sentMessages[0].text, /expires in 15 minutes/);
});

const ADMIN_APPLICATION_ACTION_ROUTE_PATH =
  '/api/v1/auth/admin-applications/action';
