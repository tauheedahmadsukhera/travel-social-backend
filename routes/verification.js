const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken } = require('../src/middleware/authMiddleware');
const logger = require('../src/utils/logger');

// Load models
const User = mongoose.model('User');
const VerificationRequest = mongoose.model('VerificationRequest');

/**
 * @route   POST /api/users/verification/request
 * @desc    Submit a new verification (blue tick) request
 * @access  Private
 */
router.post('/request', verifyToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    const { fullName, category, documentUrl } = req.body;

    // Validation
    if (!fullName || !category || !documentUrl) {
      return res.status(400).json({ success: false, error: 'Full name, category, and document URL are required.' });
    }

    const validCategories = ['Travel Blogger', 'Influencer', 'Photographer', 'Journalist', 'Business', 'Other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ success: false, error: 'Invalid category selected.' });
    }

    // Check if user is already verified
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    if (user.isVerified) {
      return res.status(400).json({ success: false, error: 'Your account is already verified.' });
    }

    // Check if there is already a pending verification request
    const existingPending = await VerificationRequest.findOne({ userId, status: 'pending' });
    if (existingPending) {
      return res.status(400).json({ success: false, error: 'You already have a pending verification request.' });
    }

    // Check if there is a rejected verification request
    // If there is, we'll delete it or update it. Let's delete it so the history is cleaned,
    // or keep it but update it. Deleting is simple and starts fresh.
    await VerificationRequest.deleteMany({ userId, status: { $in: ['rejected', 'approved'] } });

    // Create request
    const verificationRequest = new VerificationRequest({
      userId,
      fullName,
      category,
      documentUrl,
      status: 'pending'
    });

    await verificationRequest.save();
    logger.info(`✅ Verification request submitted for user ${userId}`);

    res.status(201).json({
      success: true,
      message: 'Verification request submitted successfully.',
      data: verificationRequest
    });
  } catch (err) {
    logger.error('Error submitting verification request: %s', err.message);
    next(err);
  }
});

/**
 * @route   GET /api/users/verification/status
 * @desc    Get the current verification status of the user
 * @access  Private
 */
router.get('/status', verifyToken, async (req, res, next) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // If user is already verified, return verified status directly
    if (user.isVerified) {
      return res.json({
        success: true,
        data: {
          status: 'approved',
          isVerified: true
        }
      });
    }

    const latestRequest = await VerificationRequest.findOne({ userId }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: latestRequest ? {
        id: latestRequest._id,
        fullName: latestRequest.fullName,
        category: latestRequest.category,
        documentUrl: latestRequest.documentUrl,
        status: latestRequest.status,
        rejectionReason: latestRequest.rejectionReason,
        createdAt: latestRequest.createdAt,
        isVerified: false
      } : null
    });
  } catch (err) {
    logger.error('Error checking verification status: %s', err.message);
    next(err);
  }
});

module.exports = router;
