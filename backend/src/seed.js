require('dotenv').config();
const db = require('./config/db');

(async () => {
  await db.query(
    `INSERT INTO services (name, pricing_type, price) VALUES
     ('Wash-Dry-Fold', 'per_kilo', 60),
     ('Dry Cleaning', 'per_item', 150),
     ('Ironing', 'per_kilo', 40),
     ('Comforter Cleaning', 'per_item', 200)`);

  const times = [['08:00','10:00'],['10:00','12:00'],['13:00','15:00'],['15:00','17:00']];
  for (let d = 0; d < 7; d++) {
    const date = new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
    for (const [s, e] of times) {
      await db.query(
        'INSERT IGNORE INTO time_slots (slot_date, start_time, end_time, max_bookings) VALUES (?,?,?,5)',
        [date, s, e]);
    }
  }
  console.log('Seed done. No user accounts were created.');
  process.exit();
})();