const socketIo = require('socket.io');
let io;

const init = (server) => {
  io = socketIo(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    // Join a room based on userId for targeted notifications
    socket.on('join', (userId) => {
      if (userId) {
        socket.join(userId);
        console.log(`👤 Socket ${socket.id} joined room: ${userId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

// Emit event to a specific user
const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(userId).emit(event, data);
  }
};

module.exports = { init, getIO, emitToUser };
