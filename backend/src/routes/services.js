const router = require('express').Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM services WHERE is_active = TRUE');
  res.json(rows);
});

router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { name, pricing_type, price } = req.body;
  await db.query(
    'INSERT INTO services (name, pricing_type, price) VALUES (?,?,?)',
    [name, pricing_type, price]);
  res.status(201).json({ message: 'Service added' });
});

router.get('/slots', authenticate, async (req, res) => {
  const [rows] = await db.query(
    `SELECT t.*, t.max_bookings - COUNT(o.id) AS remaining
     FROM time_slots t
     LEFT JOIN orders o ON o.slot_id = t.id AND o.status <> 'Cancelled'
     WHERE t.slot_date >= CURDATE()
     GROUP BY t.id
     ORDER BY t.slot_date, t.start_time`);
  res.json(rows);
});

module.exports = router;