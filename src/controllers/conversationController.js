'use strict';
/**
 * conversationController.js
 *
 * Handles all conversation/messaging logic extracted from src/routes/conversations.js.
 *
 * Migration status: STUB
 *
 * Handlers to extract:
 *   exports.getConversations  = async (req, res) => { ... }
 *   exports.getOrCreate       = async (req, res) => { ... }
 *   exports.getMessages       = async (req, res) => { ... }
 *   exports.sendMessage       = async (req, res) => { ... }
 *   exports.deleteMessage     = async (req, res) => { ... }
 *   exports.markRead          = async (req, res) => { ... }
 */

exports.getConversations = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};

exports.getOrCreate = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};

exports.getMessages = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};

exports.sendMessage = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};

exports.deleteMessage = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};

exports.markRead = async (req, res) => {
  res.status(501).json({ success: false, error: 'Not yet extracted to controller' });
};
