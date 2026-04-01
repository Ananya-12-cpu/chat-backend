const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getPool, sql } = require('../db');

function setupSocket(io) {
  // Authenticate socket connections via JWT in handshake
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.user.username} (${socket.id})`);

    // Join a room
    socket.on('room:join', async (roomId, callback) => {
      try {
        const pool = await getPool();

        const result = await pool.request()
          .input('id', sql.NVarChar, roomId)
          .query('SELECT id, name FROM rooms WHERE id = @id');

        if (result.recordset.length === 0) {
          return callback?.({ error: 'Room not found' });
        }

        socket.join(roomId);

        // Upsert membership
        await pool.request()
          .input('room_id', sql.NVarChar, roomId)
          .input('user_id', sql.NVarChar, socket.user.id)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM room_members WHERE room_id = @room_id AND user_id = @user_id)
              INSERT INTO room_members (room_id, user_id) VALUES (@room_id, @user_id)
          `);

        // Send message history to the joining user
        const history = await pool.request()
          .input('room_id', sql.NVarChar, roomId)
          .query(`
            SELECT id, room_id AS roomId, sender_id AS senderId,
                   sender_name AS senderName, text, timestamp
            FROM messages
            WHERE room_id = @room_id
            ORDER BY timestamp ASC
          `);

        socket.emit('room:history', { roomId, messages: history.recordset });

        // Notify others in the room
        socket.to(roomId).emit('room:user_joined', {
          roomId,
          user: { id: socket.user.id, username: socket.user.username },
        });

        callback?.({ ok: true });
        console.log(`[socket] ${socket.user.username} joined room ${result.recordset[0].name}`);
      } catch (err) {
        console.error('[socket room:join]', err);
        callback?.({ error: 'Server error' });
      }
    });

    // Leave a room
    socket.on('room:leave', (roomId, callback) => {
      socket.leave(roomId);
      socket.to(roomId).emit('room:user_left', {
        roomId,
        user: { id: socket.user.id, username: socket.user.username },
      });
      callback?.({ ok: true });
    });

    // Send a message
    socket.on('message:send', async ({ roomId, text }, callback) => {
      if (!roomId || !text || typeof text !== 'string' || !text.trim()) {
        return callback?.({ error: 'roomId and non-empty text are required' });
      }

      if (!socket.rooms.has(roomId)) {
        return callback?.({ error: 'You must join the room first' });
      }

      try {
        const pool = await getPool();

        const roomCheck = await pool.request()
          .input('id', sql.NVarChar, roomId)
          .query('SELECT id FROM rooms WHERE id = @id');

        if (roomCheck.recordset.length === 0) {
          return callback?.({ error: 'Room not found' });
        }

        const message = {
          id: uuidv4(),
          roomId,
          senderId: socket.user.id,
          senderName: socket.user.username,
          text: text.trim(),
          timestamp: new Date().toISOString(),
        };

        await pool.request()
          .input('id', sql.NVarChar, message.id)
          .input('room_id', sql.NVarChar, message.roomId)
          .input('sender_id', sql.NVarChar, message.senderId)
          .input('sender_name', sql.NVarChar, message.senderName)
          .input('text', sql.NVarChar, message.text)
          .query(`
            INSERT INTO messages (id, room_id, sender_id, sender_name, text)
            VALUES (@id, @room_id, @sender_id, @sender_name, @text)
          `);

        io.to(roomId).emit('message:new', message);
        callback?.({ ok: true, message });
      } catch (err) {
        console.error('[socket message:send]', err);
        callback?.({ error: 'Server error' });
      }
    });

    // Typing indicators (no DB interaction needed)
    socket.on('typing:start', ({ roomId }) => {
      socket.to(roomId).emit('typing:start', {
        roomId,
        user: { id: socket.user.id, username: socket.user.username },
      });
    });

    socket.on('typing:stop', ({ roomId }) => {
      socket.to(roomId).emit('typing:stop', {
        roomId,
        user: { id: socket.user.id, username: socket.user.username },
      });
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.user.username} (${socket.id})`);
    });
  });
}

module.exports = setupSocket;
