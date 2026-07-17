const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const s3Service = require('../utils/s3Service');
const rateLimiter = require('../middleware/rateLimiter');

// Rate limit uploads to 30 requests per hour per user/IP
const uploadLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyPrefix: 'rl:upload:'
});

router.use(uploadLimiter);

// Configure multer for memory storage with strict limits
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

const uploadStory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Global Multer Error Handler
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    logger.warn('Multer Error: %s', err.message);
    return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
  }
  next(err);
};

// POST /api/upload/avatar - Upload user avatar
router.post('/avatar', verifyToken, upload.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });
    const userId = req.userId || 'anonymous';
    const result = await s3Service.uploadMedia(req.file.buffer, `avatars/${userId}`, 'avatar', 'image', req.file.originalname || 'avatar.jpg');
    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    logger.error('Error uploading avatar: %s', err.message);
    res.status(500).json({ success: false, error: `Upload failed: ${err.message}` });
  }
});

// POST /api/upload/post - Upload post media
router.post('/post', verifyToken, upload.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });
    const userId = req.userId || 'anonymous';
    const mediaType = req.body.mediaType || 'auto';
    
    const result = await s3Service.uploadMedia(req.file.buffer, `posts/${userId}`, 'post', mediaType, req.file.originalname || 'file');
    
    res.json({ 
      success: true, 
      url: result.secure_url, 
      mediaType: result.resource_type,
      width: result.width,
      height: result.height,
      aspectRatio: result.width && result.height ? result.width / result.height : 1
    });
  } catch (err) {
    logger.error('Error uploading post media: %s', err.message);
    res.status(500).json({ success: false, error: `Upload failed: ${err.message}` });
  }
});

// POST /api/upload/story - Upload story media
router.post('/story', verifyToken, uploadStory.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });
    const userId = req.userId || 'anonymous';
    const mediaType = req.body.mediaType || 'auto';

    const result = await s3Service.uploadMedia(req.file.buffer, `stories/${userId}`, 'story', mediaType, req.file.originalname || 'file');

    res.json({ success: true, url: result.secure_url, mediaType: result.resource_type, thumbnailUrl: result.thumbnailUrl });
  } catch (err) {
    logger.error('Error uploading story media: %s', err.message);
    res.status(500).json({ success: false, error: `Upload failed: ${err.message}` });
  }
});

// Alias route for industrial standard binary upload
router.post('/upload', verifyToken, upload.single('file'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No binary file provided. Use multipart/form-data.' });
    
    const userId = req.userId || 'anonymous';
    const folder = req.body.path || `media/${userId}`;

    const result = await s3Service.uploadMedia(req.file.buffer, folder, 'media', req.body.mediaType || 'auto', req.file.originalname || 'file');

    res.json({ 
      success: true, 
      url: result.secure_url, 
      thumbnailUrl: result.thumbnailUrl,
      data: { 
        url: result.secure_url,
        thumbnailUrl: result.thumbnailUrl,
        width: result.width,
        height: result.height,
        aspectRatio: result.width && result.height ? result.width / result.height : 1
      } 
    });
  } catch (err) {
    logger.error('Error in industrial upload: %s', err.message);
    res.status(500).json({ success: false, error: `Upload failed: ${err.message}` });
  }
});

module.exports = router;
