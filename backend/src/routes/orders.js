const router = require('express').Router();
const QRCode = require('qrcode');
const crypto = require('crypto');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const STATUSES = ['Booked','Received','Washing','Drying',
  'Ironing and Folding','Ready for Claim','Completed','Cancelled'];

router.post('/', authenticate, authorize('customer'), async (req, res) => {
  const serviceId = Number(req.body.service_id);
  const slotId = Number(req.body.slot_id);
  const quantity = Number(req.body.est_weight);

  if (!Number.isInteger(serviceId) || serviceId <= 0)
    return res.status(400).json({ message: 'Valid service_id is required' });
  if (!Number.isInteger(slotId) || slotId <= 0)
    return res.status(400).json({ message: 'Valid slot_id is required' });
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 9999.99)
    return res.status(400).json({ message: 'Quantity must be greater than 0 and at most 9999.99' });
  if (Math.abs(quantity * 100 - Math.round(quantity * 100)) > 1e-6)
    return res.status(400).json({ message: 'Quantity can have at most 2 decimal places' });

  const conn = await db.getConnection();
  try {
    const [[service]] = await conn.query(
      'SELECT pricing_type, price FROM services WHERE id = ? AND is_active = TRUE',
      [serviceId]);
    if (!service)
      return res.status(404).json({ message: 'Service not found' });

    if (service.pricing_type === 'per_item' && !Number.isInteger(quantity))
      return res.status(400).json({ message: 'Number of items must be a whole number' });

    const estimate = Math.round(Number(service.price) * quantity * 100) / 100;

    await conn.beginTransaction();

    const [[slot]] = await conn.query(
      `SELECT max_bookings, TIMESTAMP(slot_date, start_time) AS starts_at
       FROM time_slots WHERE id = ? FOR UPDATE`, [slotId]);
    if (!slot) {
      await conn.rollback();
      return res.status(404).json({ message: 'Time slot not found' });
    }
    if (new Date(slot.starts_at) <= new Date()) {
      await conn.rollback();
      return res.status(400).json({ message: 'Time slot has already started' });
    }

    const [[{ booked }]] = await conn.query(
      `SELECT COUNT(*) AS booked FROM orders
       WHERE slot_id = ? AND status <> 'Cancelled'`, [slotId]);
    if (booked >= slot.max_bookings) {
      await conn.rollback();
      return res.status(409).json({ message: 'Time slot is full' });
    }

    let orderNo, orderId;
    for (let attempt = 0; attempt < 5; attempt++) {
      orderNo = 'LDR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      try {
        const [result] = await conn.query(
          `INSERT INTO orders (order_no, customer_id, service_id, slot_id, est_weight, total_price)
           VALUES (?,?,?,?,?,?)`,
          [orderNo, req.user.id, serviceId, slotId, quantity, estimate]);
        orderId = result.insertId;
        break;
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY' || attempt === 4) throw err;
      }
    }

    await conn.query(
      'INSERT INTO order_status_history (order_id, status, updated_by) VALUES (?,?,?)',
      [orderId, 'Booked', req.user.id]);
    await conn.commit();

    let qr = null;
    try {
      qr = await QRCode.toDataURL(orderNo);
    } catch (qrErr) {
      console.error('QR generation failed for', orderNo, qrErr);
    }

    res.status(201).json({
      order_no: orderNo,
      pricing_type: service.pricing_type,
      quantity,
      total_price: estimate,
      qr
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
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