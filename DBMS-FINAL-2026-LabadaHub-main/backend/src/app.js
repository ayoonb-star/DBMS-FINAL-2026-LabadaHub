require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');

const app = express();
app.use(cors());
app.use(express.json());

// Health check (no login needed)
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'up' });
  } catch (err) {
    console.error('Health check failed:', err.message);
    res.status(503).json({ status: 'error', database: 'down' });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/services', require('./routes/services'));
app.use('/api/orders', require('./routes/orders'));

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler (must be last, must have 4 parameters)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed')
    return res.status(400).json({ message: 'Invalid JSON in request body' });
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

// Keep the server alive if something slips through, but log it
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

const port = process.env.PORT || 5000;
app.listen(port, '0.0.0.0', () => console.log(`API running on port ${port}`));