const router = require('express').Router();
const QRCode = require('qrcode');
const crypto = require('crypto');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const STATUSES = ['Booked','Received','Washing','Drying',
  'Ironing and Folding','Ready for Claim','Completed','Cancelled'];

// Allowed next statuses for each current status
const TRANSITIONS = {
  'Booked': ['Received', 'Cancelled'],
  'Received': ['Washing', 'Cancelled'],
  'Washing': ['Drying'],
  'Drying': ['Ironing and Folding'],
  'Ironing and Folding': ['Ready for Claim'],
  'Ready for Claim': ['Completed'],
  'Completed': [],
  'Cancelled': []
};

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
            `SELECT max_bookings, is_open, TIMESTAMP(slot_date, start_time) AS starts_at
       FROM time_slots WHERE id = ? FOR UPDATE`, [slotId]);
    if (!slot) {
      await conn.rollback();
      return res.status(404).json({ message: 'Time slot not found' });
    }
        if (!slot.is_open) {
      await conn.rollback();
      return res.status(409).json({ message: 'Time slot is closed' });
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

router.patch('/:orderNo/status', authenticate, authorize('staff', 'admin'),
  async (req, res) => {
    const { status } = req.body;

    // 1. Input validation (before touching the database)
    if (!STATUSES.includes(status))
      return res.status(400).json({ message: 'Invalid status' });

    let remarks = null;
    if (req.body.remarks !== undefined && req.body.remarks !== null && req.body.remarks !== '') {
      if (typeof req.body.remarks !== 'string' || req.body.remarks.trim().length > 255)
        return res.status(400).json({ message: 'Remarks must be text of at most 255 characters' });
      remarks = req.body.remarks.trim();
    }

    let actualWeight = null;
    if (status === 'Received') {
      actualWeight = Number(req.body.actual_weight);
      if (!Number.isFinite(actualWeight) || actualWeight <= 0 || actualWeight > 9999.99)
        return res.status(400).json({
          message: 'actual_weight is required for Received and must be greater than 0 and at most 9999.99'
        });
      if (Math.abs(actualWeight * 100 - Math.round(actualWeight * 100)) > 1e-6)
        return res.status(400).json({ message: 'actual_weight can have at most 2 decimal places' });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 2. Lock the order so two staff cannot update it at the same time
      const [[order]] = await conn.query(
        `SELECT o.id, o.status, s.pricing_type, s.price
         FROM orders o JOIN services s ON s.id = o.service_id
         WHERE o.order_no = ? FOR UPDATE`,
        [req.params.orderNo]);
      if (!order) {
        await conn.rollback();
        return res.status(404).json({ message: 'Order not found' });
      }

      // 3. Check the transition is allowed
      const allowed = TRANSITIONS[order.status] || [];
      if (!allowed.includes(status)) {
        await conn.rollback();
        return res.status(409).json({
          message: `Cannot change status from ${order.status} to ${status}`,
          allowed_next: allowed
        });
      }

      // 4. Update the order (and finalize the price on intake)
      let totalPrice;
      if (status === 'Received') {
        if (order.pricing_type === 'per_item' && !Number.isInteger(actualWeight)) {
          await conn.rollback();
          return res.status(400).json({ message: 'Number of items must be a whole number' });
        }
        totalPrice = Math.round(Number(order.price) * actualWeight * 100) / 100;
        await conn.query(
          'UPDATE orders SET status = ?, actual_weight = ?, total_price = ? WHERE id = ?',
          [status, actualWeight, totalPrice, order.id]);
      } else {
        await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);
      }

      // 5. Record the change in the history
      await conn.query(
        'INSERT INTO order_status_history (order_id, status, updated_by, remarks) VALUES (?,?,?,?)',
        [order.id, status, req.user.id, remarks]);

      await conn.commit();

      const response = { message: 'Status updated', order_no: req.params.orderNo, status };
      if (totalPrice !== undefined) response.total_price = totalPrice;
      res.json(response);
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      console.error(err);
      res.status(500).json({ message: 'Status update failed' });
    } finally {
      conn.release();
    }
  });

router.get('/mine', authenticate, authorize('customer'), async (req, res) => {
  const [rows] = await db.query(
    'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC', [req.user.id]);
  res.json(rows);
});

module.exports = router;