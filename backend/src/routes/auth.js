const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');

// Refuse to start without a JWT secret (dotenv is loaded in app.js before this file)
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is missing. Add it to backend/.env before starting the server.');
}

const emailRule = body('email')
  .isString().withMessage('email is required')
  .bail()
  .trim()
  .toLowerCase()
  .isEmail().withMessage('A valid email is required')
  .isLength({ max: 100 }).withMessage('email must be at most 100 characters');

const registerRules = [
  body('full_name')
    .isString().withMessage('full_name is required')
    .bail()
    .trim()
    .notEmpty().withMessage('full_name is required')
    .isLength({ max: 100 }).withMessage('full_name must be at most 100 characters'),
  emailRule,
  body('phone')
    .optional({ values: 'falsy' })
    .isString().withMessage('phone must be text')
    .bail()
    .trim()
    .matches(/^\+?[0-9 -]{7,19}$/).withMessage('phone must be 7 to 19 digits (spaces, dashes and a leading + allowed)'),
  body('password')
    .isString().withMessage('password is required')
    .bail()
    .isLength({ min: 8 }).withMessage('password must be at least 8 characters')
    .custom((v) => Buffer.byteLength(v, 'utf8') <= 72)
    .withMessage('password is too long (max 72 bytes)')
];

const loginRules = [
  emailRule,
    body('password').isString().withMessage('password is required').bail()
    .notEmpty().withMessage('password is required')
];

const firstError = (req) => {
  const errors = validationResult(req);
  return errors.isEmpty() ? null : errors.array()[0].msg;
};

router.post('/register', registerRules, async (req, res) => {
  const problem = firstError(req);
  if (problem) return res.status(400).json({ message: problem });

  const { full_name, email, phone, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (full_name, email, phone, password_hash) VALUES (?,?,?,?)',
      [full_name, email, phone || null, hash]
    );
    res.status(201).json({ message: 'Registered successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ message: 'Email already registered' });
    console.error(err);
    res.status(500).json({ message: 'Registration failed' });
  }
});

router.post('/login', loginRules, async (req, res) => {
  const problem = firstError(req);
  if (problem) return res.status(400).json({ message: problem });

  const { email, password } = req.body;
  try {
    const [rows] = await db.query(
      'SELECT id, full_name, password_hash, role FROM users WHERE email = ? AND is_active = TRUE',
      [email]
    );
    if (!rows.length)
      return res.status(401).json({ message: 'Invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.full_name, role: user.role }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed' });
  }
});

module.exports = router;