const router = require('express').Router();
const QRCode = require('qrcode');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const STATUSES = ['Booked','Received','Washing','Drying',
  'Ironing and Folding','Ready for Claim','Completed','Cancelled'];

router.post('/', authenticate, authorize('customer'), async (req, res) => {
  const { service_id, slot_id, est_weight } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[slot]] = await conn.query(
      'SELECT max_bookings FROM time_slots WHERE id = ? FOR UPDATE', [slot_id]);
    const [[{ booked }]] = await conn.query(
      `SELECT COUNT(*) AS booked FROM orders
       WHERE slot_id = ? AND status <> 'Cancelled'`, [slot_id]);
    if (!slot || booked >= slot.max_bookings) {
      await conn.rollback();
      return res.status(409).json({ message: 'Time slot is full or not found' });
    }

    const [[service]] = await conn.query(
      'SELECT price FROM services WHERE id = ? AND is_active = TRUE', [service_id]);
    if (!service) {
      await conn.rollback();
      return res.status(404).json({ message: 'Service not found' });
    }

    const estimate = service.price * est_weight;
    const orderNo = 'LDR-' + Date.now().toString().slice(-8);

    const [result] = await conn.query(
      `INSERT INTO orders (order_no, customer_id, service_id, slot_id, est_weight, total_price)
       VALUES (?,?,?,?,?,?)`,
      [orderNo, req.user.id, service_id, slot_id, est_weight, estimate]);

    await conn.query(
      'INSERT INTO order_status_history (order_id, status, updated_by) VALUES (?,?,?)',
      [result.insertId, 'Booked', req.user.id]);
    await conn.commit();

    const qr = await QRCode.toDataURL(orderNo);
    res.status(201).json({ order_no: orderNo, total_price: estimate, qr });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Booking failed' });
  } finally {
    conn.release();
  }
});

router.patch('/:orderNo/status', authenticate, authorize('staff','admin'),
  async (req, res) => {
    const { status, actual_weight } = req.body;
    if (!STATUSES.includes(status))
      return res.status(400).json({ message: 'Invalid status' });

    const [[order]] = await db.query(
      'SELECT o.id, s.price FROM orders o JOIN services s ON s.id = o.service_id WHERE o.order_no = ?',
      [req.params.orderNo]);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (status === 'Received' && actual_weight) {
      await db.query('UPDATE orders SET actual_weight=?, total_price=? WHERE id=?',
        [actual_weight, actual_weight * order.price, order.id]);
    }
    await db.query('UPDATE orders SET status=? WHERE id=?', [status, order.id]);
    await db.query(
      'INSERT INTO order_status_history (order_id, status, updated_by) VALUES (?,?,?)',
      [order.id, status, req.user.id]);
    res.json({ message: 'Status updated' });
  });

router.get('/mine', authenticate, authorize('customer'), async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json(rows);
});

module.exports = router;