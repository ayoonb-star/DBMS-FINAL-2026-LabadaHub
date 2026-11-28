const crypto = require('node:crypto');

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 12;

function generateVerificationCode() {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function formatVerificationCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}

function verificationCodeDigest(code) {
  const normalizedCode = code.trim().replace(/-/g, '').toUpperCase();
  return crypto.createHash('sha256').update(normalizedCode, 'utf8').digest('hex');
}

module.exports = {
  generateVerificationCode,
  formatVerificationCode,
  verificationCodeDigest,
};
