const { getPool } = require('./index');

async function initDb() {
  const pool = await getPool();

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
    CREATE TABLE users (
      id          NVARCHAR(36)  NOT NULL PRIMARY KEY,
      username    NVARCHAR(50)  NOT NULL UNIQUE,
      password_hash NVARCHAR(255) NOT NULL,
      created_at  DATETIME2     NOT NULL DEFAULT GETUTCDATE()
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='rooms' AND xtype='U')
    CREATE TABLE rooms (
      id          NVARCHAR(36)  NOT NULL PRIMARY KEY,
      name        NVARCHAR(100) NOT NULL UNIQUE,
      created_by  NVARCHAR(36)  NOT NULL REFERENCES users(id),
      created_at  DATETIME2     NOT NULL DEFAULT GETUTCDATE()
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='room_members' AND xtype='U')
    CREATE TABLE room_members (
      room_id   NVARCHAR(36) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id   NVARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at DATETIME2    NOT NULL DEFAULT GETUTCDATE(),
      PRIMARY KEY (room_id, user_id)
    );
  `);

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='messages' AND xtype='U')
    CREATE TABLE messages (
      id           NVARCHAR(36)   NOT NULL PRIMARY KEY,
      room_id      NVARCHAR(36)   NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      sender_id    NVARCHAR(36)   NOT NULL REFERENCES users(id),
      sender_name  NVARCHAR(50)   NOT NULL,
      text         NVARCHAR(MAX)  NOT NULL,
      timestamp    DATETIME2      NOT NULL DEFAULT GETUTCDATE()
    );
  `);

  console.log('[db] Tables ready');
}

module.exports = initDb;
