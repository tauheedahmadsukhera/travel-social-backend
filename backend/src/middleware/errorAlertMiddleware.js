const logger = require('../utils/logger');

/**
 * Error Alerting Middleware
 * Monitors error responses and logs a critical alert if error rate spikes.
 * This can be easily extended to send Slack/Discord/Email notifications.
 */
const alertConfig = {
  windowMs: 60 * 1000, // 1 minute window
  threshold: 10,        // Alert if more than 10 errors occur in the window
};

let errorCount = 0;
let windowStart = Date.now();

const errorAlertMiddleware = (err, req, res, next) => {
  const now = Date.now();
  
  // Reset window if needed
  if (now - windowStart > alertConfig.windowMs) {
    errorCount = 0;
    windowStart = now;
  }

  errorCount++;

  // Trigger alert if threshold is exceeded
  if (errorCount === alertConfig.threshold) {
    logger.error('🚨 [ALERT] High Error Rate Detected: %d errors in the last minute!', errorCount);
    
    // TODO: Plug in external notification service here
    // notifySlack(`Critical Error Spike: ${errorCount} errors detected on ${process.env.NODE_ENV}`);
  }

  next(err);
};

module.exports = errorAlertMiddleware;
