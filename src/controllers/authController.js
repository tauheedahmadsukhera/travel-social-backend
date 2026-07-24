'use strict';
/**
 * authController.js
 *
 * Handles all authentication logic extracted from src/routes/auth.js.
 * Keeping handlers here keeps routes thin (route = path + middleware + controller call).
 *
 * Migration status: STUB — handlers are still in routes/auth.js.
 * To fully activate: move handler functions here and require() from auth.js.
 *
 * Pattern:
 *   exports.register    = async (req, res) => { ... }
 *   exports.login       = async (req, res) => { ... }
 *   exports.logout      = async (req, res) => { ... }
 *   exports.refreshToken = async (req, res) => { ... }
 *   exports.deleteAccount = async (req, res) => { ... }
 */

const logger = require('../utils/logger');

/**
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  // TODO: Extract from src/routes/auth.js → POST /register
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};

/**
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  // TODO: Extract from src/routes/auth.js → POST /login
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};

/**
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
  // TODO: Extract from src/routes/auth.js → POST /logout
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};

/**
 * POST /api/auth/refresh-token
 */
exports.refreshToken = async (req, res) => {
  // TODO: Extract from src/routes/auth.js → POST /refresh-token
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};

/**
 * DELETE /api/auth/delete-account
 */
exports.deleteAccount = async (req, res) => {
  // TODO: Extract from src/routes/auth.js → DELETE /delete-account
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};
