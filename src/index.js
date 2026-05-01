require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const fs = require('fs');

// Config & Utils
const { validateEnv } = require('./config/validateEnv');
validateEnv();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Hardening
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Middleware
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(mongoSanitize());
app.use(hpp());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static Assets
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/stamps', express.static(path.join(__dirname, '../stamps')));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ====== MODELS AUTO-REGISTRATION ======
const modelsPath = path.resolve(__dirname, '../models');
if (fs.existsSync(modelsPath)) {
  fs.readdirSync(modelsPath).forEach(file => {
    if (file.endsWith('.js')) require(path.join(modelsPath, file));
  });
  console.log('✅ Models registered');
}

// Socket.IO
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);
const { registerMessagingSocket } = require('./socket/registerMessagingSocket');
const { toObjectId } = require('./utils/userUtils');
const { sendExpoPushToUser } = require('./services/notificationService');

try {
  registerMessagingSocket({ io, mongoose, toObjectId, sendExpoPushToUser });
  console.log('✅ Socket.IO handlers registered');
} catch (e) {
  console.error('❌ Socket.IO Registration Error:', e.message);
}

// --- API Routes ---
console.log('🔧 Loading API routes...');
app.use('/api/users', require('../routes/users'));
app.use('/api/posts', require('../routes/posts'));
app.use('/api/comments', require('../routes/comments'));
app.use('/api/conversations', require('../routes/conversations'));
app.use('/api/messages', require('../routes/messages'));
app.use('/api/notifications', require('../routes/notification'));
app.use('/api/stories', require('../routes/stories'));
app.use('/api/live-streams', require('../routes/live'));
app.use('/api/feed', require('../routes/feed'));
app.use('/api/upload', require('../routes/upload'));
app.use('/api/passport', require('../routes/passport'));
app.use('/api/groups', require('../routes/groups'));
app.use('/api/moderation', require('../routes/moderation'));
app.use('/api/admin', require('../routes/admin'));
app.use('/api/public', require('../routes/public'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Error Handler:', err.message);
  res.status(err.status || 500).json({ success: false, error: err.message });
});

// Process Protection
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught Exception:', err);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 API Base: http://localhost:${PORT}/api`);
});

module.exports = app;
