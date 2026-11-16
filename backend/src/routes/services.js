const router = require('express').Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const PRICING_TYPES = ['per_kilo', 'per_item'];

const isMoney = (n) =>
  Number.isFinite(n) && n > 0 && n <= 99999999.99 &&
  Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const normalizeTime = (t) => {
  if (typeof t !== 'string') return null;
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t.trim());
  if (!m) return null;
  const [h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3] || 0)];
  if (h > 23 || mi > 59 || s > 59) return null;
  return `${m[1]}:${m[2]}:${String(s).padStart(2, '0')}`;
};

const isValidDate = (d) => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d;
};

const parseBool = (v) => {
  if (v === true || v === 1 || v === '1') return 1;
  if (v === false || v === 0 || v === '0') return 0;
  return null;
};

/* ---------------- SERVICES ---------------- */

// List services. Customers/staff see active only; admin can add ?include_inactive=true
router.get('/', authenticate, async (req, res) => {
  try {
    const showAll = req.user.role === 'admin' && req.query.include_inactive === 'true';
    const [rows] = await db.query(
      `SELECT id, name, pricing_type, price, description, is_addon, is_active
       FROM services ${showAll ? '' : 'WHERE is_active = TRUE'}
       ORDER BY name`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load services' });
  }
});

// Add a service (admin)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 100)
      return res.status(400).json({ message: 'name is required (max 100 characters)' });

    if (!PRICING_TYPES.includes(req.body.pricing_type))
      return res.status(400).json({ message: 'pricing_type must be per_kilo or per_item' });

    const price = Number(req.body.price);
    if (!isMoney(price))
      return res.status(400).json({ message: 'price must be greater than 0, with at most 2 decimals' });

    let description = null;
    if (req.body.description !== undefined && req.body.description !== null && req.body.description !== '') {
      if (typeof req.body.description !== 'string' || req.body.description.trim().length > 500)
        return res.status(400).json({ message: 'description must be text of at most 500 characters' });
      description = req.body.description.trim();
    }

    let isAddon = 0;
    if (req.body.is_addon !== undefined) {
      isAddon = parseBool(req.body.is_addon);
      if (isAddon === null)
        return res.status(400).json({ message: 'is_addon must be true or false' });
    }

    const [result] = await db.query(
      'INSERT INTO services (name, pricing_type, price, description, is_addon) VALUES (?,?,?,?,?)',
      [name, req.body.pricing_type, price, description, isAddon]);
    res.status(201).json({ message: 'Service added', id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not add service' });
  }
});

/* ---------------- SLOTS (defined before /:id routes) ---------------- */

// List slots with remaining capacity. Customers see open, not-yet-started slots.
// Admin can add ?all=true to include closed slots and slots that already started today.
router.get('/slots', authenticate, async (req, res) => {
  try {
    const showAll = req.user.role === 'admin' && req.query.all === 'true';
    const where = showAll
      ? 't.slot_date >= CURDATE()'
      : 't.is_open = 1 AND TIMESTAMP(t.slot_date, t.start_time) > NOW()';
    const [rows] = await db.query(
      `SELECT t.id, t.slot_date, t.start_time, t.end_time, t.max_bookings, t.is_open,
              t.max_bookings - COUNT(o.id) AS remaining
       FROM time_slots t
       LEFT JOIN orders o ON o.slot_id = t.id AND o.status <> 'Cancelled'
       WHERE ${where}
       GROUP BY t.id
       ORDER BY t.slot_date, t.start_time`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load time slots' });
  }
});

// Create a slot (admin)
router.post('/slots', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { slot_date } = req.body;
    if (!isValidDate(slot_date))
      return res.status(400).json({ message: 'slot_date must be a valid date like 2026-12-01' });

    const start = normalizeTime(req.body.start_time);
    const end = normalizeTime(req.body.end_time);
    if (!start || !end)
      return res.status(400).json({ message: 'start_time and end_time must look like 09:00 or 09:00:00' });
    if (end <= start)
      return res.status(400).json({ message: 'end_time must be after start_time' });

    let maxBookings = 5;
    if (req.body.max_bookings !== undefined) {
      maxBookings = Number(req.body.max_bookings);
      if (!Number.isInteger(maxBookings) || maxBookings < 1 || maxBookings > 100)
        return res.status(400).json({ message: 'max_bookings must be a whole number from 1 to 100' });
    }

    const [[check]] = await db.query('SELECT TIMESTAMP(?, ?) > NOW() AS in_future', [slot_date, start]);
    if (!check.in_future)
      return res.status(400).json({ message: 'Slot must start in the future' });

    try {
      const [result] = await db.query(
        'INSERT INTO time_slots (slot_date, start_time, end_time, max_bookings) VALUES (?,?,?,?)',
        [slot_date, start, end, maxBookings]);
      res.status(201).json({ message: 'Slot added', id: result.insertId });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY')
        return res.status(409).json({ message: 'A slot already exists for that date and start time' });
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not add slot' });
  }
});

// Change capacity or open/closed (admin)
router.patch('/slots/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid slot id' });

  const sets = [];
  const values = [];
  let newMax = null;

  if (req.body.max_bookings !== undefined) {
    newMax = Number(req.body.max_bookings);
    if (!Number.isInteger(newMax) || newMax < 1 || newMax > 100)
      return res.status(400).json({ message: 'max_bookings must be a whole number from 1 to 100' });
    sets.push('max_bookings = ?');
    values.push(newMax);
  }
  if (req.body.is_open !== undefined) {
    const open = parseBool(req.body.is_open);
    if (open === null)
      return res.status(400).json({ message: 'is_open must be true or false' });
    sets.push('is_open = ?');
    values.push(open);
  }
  if (!sets.length)
    return res.status(400).json({ message: 'Send max_bookings and/or is_open' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[slot]] = await conn.query('SELECT id FROM time_slots WHERE id = ? FOR UPDATE', [id]);
    if (!slot) {
      await conn.rollback();
      return res.status(404).json({ message: 'Slot not found' });
    }
    if (newMax !== null) {
      const [[{ booked }]] = await conn.query(
        `SELECT COUNT(*) AS booked FROM orders WHERE slot_id = ? AND status <> 'Cancelled'`, [id]);
      if (newMax < booked) {
        await conn.rollback();
        return res.status(409).json({
          message: `Cannot set capacity to ${newMax}: ${booked} active bookings already exist`
        });
      }
    }
    await conn.query(`UPDATE time_slots SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
    await conn.commit();
    res.json({ message: 'Slot updated' });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    console.error(err);
    res.status(500).json({ message: 'Could not update slot' });
  } finally {
    conn.release();
  }
});

// Delete a slot that has never had an order (admin). Otherwise close it instead.
router.delete('/slots/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid slot id' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[slot]] = await conn.query('SELECT id FROM time_slots WHERE id = ? FOR UPDATE', [id]);
    if (!slot) {
      await conn.rollback();
      return res.status(404).json({ message: 'Slot not found' });
    }
    const [[{ total }]] = await conn.query(
      'SELECT COUNT(*) AS total FROM orders WHERE slot_id = ?', [id]);
    if (total > 0) {
      await conn.rollback();
      return res.status(409).json({
        message: 'This slot has orders and cannot be deleted. Close it instead (is_open = false).'
      });
    }
    await conn.query('DELETE FROM time_slots WHERE id = ?', [id]);
    await conn.commit();
    res.json({ message: 'Slot deleted' });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    console.error(err);
    res.status(500).json({ message: 'Could not delete slot' });
  } finally {
    conn.release();
  }
});

/* ---------------- SERVICE EDIT (admin) ---------------- */

router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid service id' });

  if (req.body.pricing_type !== undefined)
    return res.status(400).json({
      message: 'pricing_type cannot be changed. Deactivate this service and add a new one.'
    });

  const sets = [];
  const values = [];

  if (req.body.name !== undefined) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 100)
      return res.status(400).json({ message: 'name must be 1 to 100 characters' });
    sets.push('name = ?'); values.push(name);
  }
  if (req.body.price !== undefined) {
    const price = Number(req.body.price);
    if (!isMoney(price))
      return res.status(400).json({ message: 'price must be greater than 0, with at most 2 decimals' });
    sets.push('price = ?'); values.push(price);
  }
  if (req.body.description !== undefined) {
    const d = req.body.description;
    if (d !== null && d !== '' && (typeof d !== 'string' || d.trim().length > 500))
      return res.status(400).json({ message: 'description must be text of at most 500 characters' });
    sets.push('description = ?'); values.push(d ? d.trim() : null);
  }
  if (req.body.is_active !== undefined) {
    const v = parseBool(req.body.is_active);
    if (v === null) return res.status(400).json({ message: 'is_active must be true or false' });
    sets.push('is_active = ?'); values.push(v);
  }
  if (req.body.is_addon !== undefined) {
    const v = parseBool(req.body.is_addon);
    if (v === null) return res.status(400).json({ message: 'is_addon must be true or false' });
    sets.push('is_addon = ?'); values.push(v);
  }
  if (!sets.length)
    return res.status(400).json({ message: 'Send at least one of: name, price, description, is_active, is_addon' });

  try {
    const [result] = await db.query(
      `UPDATE services SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Service not found' });
    res.json({ message: 'Service updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update service' });
  }
});

module.exports = router;