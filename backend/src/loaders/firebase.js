const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const initFirebase = () => {
  try {
    if (admin.apps.length === 0) {
      const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
      let serviceAccount = null;

      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } catch (e) {
          logger.warn('⚠️ Invalid FIREBASE_SERVICE_ACCOUNT JSON in env');
        }
      } else if (fs.existsSync(serviceAccountPath)) {
        serviceAccount = require(serviceAccountPath);
      }

      if (serviceAccount) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
        });
        logger.info('✅ Firebase Admin initialized successfully');
      } else {
        logger.warn('⚠️ No Firebase Service Account found. FCM may not work.');
      }
    } else {
      logger.info('✅ Firebase Admin already initialized');
    }
  } catch (error) {
    logger.warn('⚠️ Firebase Admin initialization warning: %s', error.message);
  }
};

module.exports = initFirebase;
