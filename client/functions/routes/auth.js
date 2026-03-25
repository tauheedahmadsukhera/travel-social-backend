const express = require('express');
const { firebaseLoginHandler } = require('./firebaseAuth');
const router = express.Router();

// POST /auth/firebase-login
router.post('/firebase-login', firebaseLoginHandler);

module.exports = router;
