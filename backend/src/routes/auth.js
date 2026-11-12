
const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');

router.post('/register',
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('full_name').trim().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { full_name, email, phone, password } = req.body;

    const [exists] = await db.query(
      'SELECT id FROM users WHERE email = ?', [email]
    );

    if (exists.length)
      return res.status(409).json({ message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);

    await db.query(
      'INSERT INTO users (full_name, email, phone, password_hash) VALUES (?,?,?,?)',
      [full_name, email, phone, hash]
    );

    res.status(201).json({ message: 'Registered successfully' });
  }
);

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await db.query(
    'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
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
    user: {
      id: user.id,
      name: user.full_name,
      role: user.role
    }
  });
});

module.exports = router;
