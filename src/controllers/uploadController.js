'use strict';
/**
 * uploadController.js
 *
 * Handles all media upload logic from src/routes/upload.js.
 *
 * Migration status: STUB
 *
 * Handlers to extract:
 *   exports.uploadImage    = async (req, res) => { ... }
 *   exports.uploadVideo    = async (req, res) => { ... }
 *   exports.uploadAvatar   = async (req, res) => { ... }
 *   exports.deleteMedia    = async (req, res) => { ... }
 */

exports.uploadImage = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};
exports.uploadVideo = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};
exports.uploadAvatar = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};
exports.deleteMedia = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};
