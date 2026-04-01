require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const initDb = require('./db/init');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// Swagger docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// REST API routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Socket.IO
setupSocket(io);

const PORT = process.env.PORT || 4000;

initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Chat server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[startup] Failed to initialise database:', err);
    process.exit(1);
  });
