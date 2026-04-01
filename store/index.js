// In-memory store (replace with a database in production)

const users = new Map();    // userId -> { id, username, passwordHash }
const rooms = new Map();    // roomId -> { id, name, createdBy, members: Set<userId> }
const messages = new Map(); // roomId -> [{ id, roomId, senderId, senderName, text, timestamp }]

module.exports = { users, rooms, messages };
