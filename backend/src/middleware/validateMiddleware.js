const { z } = require('zod');
const logger = require('../utils/logger');

/**
 * Generic validation middleware for Zod schemas
 * @param {z.ZodSchema} schema 
 */
const validate = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error) {
    logger.warn('Validation failed for %s %s: %o', req.method, req.originalUrl, {
      error: error.errors || error.message,
      body: req.body,
      query: req.query,
      params: req.params
    });
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      name: error.name,
      message: error.message,
      details: (error.errors || []).map(err => ({
        path: err.path ? err.path.join('.') : 'unknown',
        message: err.message
      }))
    });
  }
};

module.exports = validate;
