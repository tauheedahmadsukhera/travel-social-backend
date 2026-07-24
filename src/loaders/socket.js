const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const { registerMessagingSocket } = require('../socket/registerMessagingSocket');
const { toObjectId } = require('../utils/userUtils');
const { sendExpoPushToUser } = require('../services/notificationService');

const initSockets = (server, secret) => {
  // SECURITY: Use same origin policy as Express CORS — no wildcard in production
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
  const io = new Server(server, { 
    pingInterval: 5000,
    pingTimeout: 4000,
    cors: { 
      origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
      methods: ['GET', 'POST']
    } 
  });
  
  // Secure WebSocket Middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }
    try {
      const decoded = jwt.verify(token, secret);
      
      // Verify user status in database in real-time
      const User = mongoose.model('User');
      const user = await User.findById(decoded.userId).select('status').lean();
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }
      
      if (user.status === 'suspended' || user.status === 'banned') {
        return next(new Error(`Authentication error: Account ${user.status}`));
      }

      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  try {
    registerMessagingSocket({ io, mongoose, toObjectId, sendExpoPushToUser });
    logger.info('✅ Socket.IO handlers registered (Authenticated)');
  } catch (e) {
    logger.error('❌ Socket.IO Registration Error: %s', e.message);
  }

  return io;
};

module.exports = initSockets;
