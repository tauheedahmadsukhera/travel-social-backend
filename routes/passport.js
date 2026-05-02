const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// This router now only handles non-user-specific passport routes if any.
// All /users/:userId/passport routes have been moved to routes/users.js for better consolidation.

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Passport service is healthy' });
});

module.exports = router;
