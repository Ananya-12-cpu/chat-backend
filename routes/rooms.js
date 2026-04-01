const express = require('express');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/auth');
const { getPool, sql } = require('../db');

const router = express.Router();

// GET /api/rooms — list all rooms
router.get('/', auth, async (_req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT r.id, r.name, r.created_by AS createdBy,
             COUNT(rm.user_id) AS memberCount
      FROM rooms r
      LEFT JOIN room_members rm ON rm.room_id = r.id
      GROUP BY r.id, r.name, r.created_by
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[rooms/list]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rooms — create a room
router.post('/', auth, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const pool = await getPool();

    const existing = await pool.request()
      .input('name', sql.NVarChar, name)
      .query('SELECT id FROM rooms WHERE name = @name');

    if (existing.recordset.length > 0) {
      return res.status(409).json({ error: 'Room name already exists' });
    }

    const id = uuidv4();
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('created_by', sql.NVarChar, req.user.id)
      .query('INSERT INTO rooms (id, name, created_by) VALUES (@id, @name, @created_by)');

    await pool.request()
      .input('room_id', sql.NVarChar, id)
      .input('user_id', sql.NVarChar, req.user.id)
      .query('INSERT INTO room_members (room_id, user_id) VALUES (@room_id, @user_id)');

    res.status(201).json({ id, name, createdBy: req.user.id, memberCount: 1 });
  } catch (err) {
    console.error('[rooms/create]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rooms/:roomId/messages — get message history
router.get('/:roomId/messages', auth, async (req, res) => {
  try {
    const pool = await getPool();

    const room = await pool.request()
      .input('id', sql.NVarChar, req.params.roomId)
      .query('SELECT id FROM rooms WHERE id = @id');

    if (room.recordset.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const result = await pool.request()
      .input('room_id', sql.NVarChar, req.params.roomId)
      .query(`
        SELECT id, room_id AS roomId, sender_id AS senderId,
               sender_name AS senderName, text, timestamp
        FROM messages
        WHERE room_id = @room_id
        ORDER BY timestamp ASC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('[rooms/messages]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
