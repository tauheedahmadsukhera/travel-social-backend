const mongoose = require('mongoose');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;
  
  logger.info('📡 Attempting to connect to MongoDB...');
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    logger.info('✅ MongoDB Connected Successfully');

    // Auto-register models
    const modelsPath = path.resolve(__dirname, '../../models');
    if (fs.existsSync(modelsPath)) {
      fs.readdirSync(modelsPath).forEach(file => {
        if (file.endsWith('.js')) require(path.join(modelsPath, file));
      });
      logger.info('✅ Models registered');
    }
  } catch (err) {
    logger.error('❌ MongoDB Connection Error: %s', err.message);
    throw err;
  }
};

module.exports = connectDB;
