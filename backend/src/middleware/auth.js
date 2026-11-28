const jwt = require('jsonwebtoken');
const db = require('../config/db');

exports.authenticate = async (req, res, next) => {
  const authorization = req.headers.authorization;
  const match = typeof authorization === 'string'
    ? /^Bearer\s+([^\s]+)$/i.exec(authorization)
    : null;
  if (!match) {
    return res.status(401).json({ message: 'A bearer token is required' });
  }

  let claims;
  try {
    claims = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  const subject = claims.sub === undefined ? claims.id : claims.sub;
  const userId = String(subject);
  if (!/^[1-9]\d*$/.test(userId)) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    const [rows] = await db.query(
      `SELECT id, full_name, email, phone, role
       FROM users
       WHERE id = ? AND is_active = TRUE
       LIMIT 1`,
      [userId],
    );
    if (!rows.length) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    req.user = rows[0];
    return next();
  } catch (error) {
    return next(error);
  }
};

exports.authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};