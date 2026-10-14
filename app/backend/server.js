const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '32kb' }));

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number.parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const priorities = new Set(['Low', 'Normal', 'High', 'Urgent']);
const statuses = new Set(['Open', 'In Progress', 'Resolved']);
const categories = new Set(['IT Support', 'Hostel', 'Classroom', 'Library', 'Facilities', 'Other']);

async function initializeDatabase(retries = 20) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS support_tickets (
        id BIGSERIAL PRIMARY KEY,
        title VARCHAR(120) NOT NULL,
        details VARCHAR(1000) NOT NULL DEFAULT '',
        category VARCHAR(40) NOT NULL DEFAULT 'Other',
        priority VARCHAR(10) NOT NULL DEFAULT 'Normal',
        status VARCHAR(20) NOT NULL DEFAULT 'Open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      console.log('CampusCare ticket database is ready');
      return;
    } catch (error) {
      console.error(`Database connection attempt ${attempt}/${retries} failed: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  throw new Error('Could not initialize the ticket database');
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: true, service: 'campuscare-api' });
  } catch {
    res.status(503).json({ status: 'degraded', db: false });
  }
});

app.get('/api/tickets', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, details, category, priority, status, created_at, updated_at FROM support_tickets ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) { next(error); }
});

app.post('/api/tickets', async (req, res, next) => {
  const title = String(req.body.title || '').trim();
  const details = String(req.body.details || '').trim();
  const category = categories.has(req.body.category) ? req.body.category : 'Other';
  const priority = priorities.has(req.body.priority) ? req.body.priority : 'Normal';
  if (!title) return res.status(400).json({ error: 'A title is required.' });
  if (title.length > 120 || details.length > 1000) return res.status(400).json({ error: 'Title or details exceed the allowed length.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO support_tickets(title, details, category, priority)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, details, category, priority, status, created_at, updated_at`,
      [title, details, category, priority]
    );
    res.status(201).json(rows[0]);
  } catch (error) { next(error); }
});

app.patch('/api/tickets/:id', async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  const status = req.body.status;
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid ticket ID.' });
  if (!statuses.has(status)) return res.status(400).json({ error: 'Status must be Open, In Progress, or Resolved.' });
  try {
    const { rows } = await pool.query(
      `UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, title, details, category, priority, status, created_at, updated_at`,
      [status, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ticket not found.' });
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.delete('/api/tickets/:id', async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid ticket ID.' });
  try {
    const result = await pool.query('DELETE FROM support_tickets WHERE id = $1', [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Ticket not found.' });
    res.json({ deleted: true, id });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error.message);
  res.status(500).json({ error: 'An internal service error occurred.' });
});

const port = Number.parseInt(process.env.PORT || '5000', 10);
initializeDatabase()
  .then(() => app.listen(port, () => console.log(`CampusCare API listening on ${port}`)))
  .catch(error => { console.error(error.message); process.exit(1); });
