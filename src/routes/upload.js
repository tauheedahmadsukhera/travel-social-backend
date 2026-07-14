const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const { uploadMedia } = require('../utils/s3Service');

// Verify AWS S3 config
const awsKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecret = process.env.AWS_SECRET_ACCESS_KEY;
const awsRegion = process.env.AWS_REGION;
const awsBucket = process.env.AWS_S3_BUCKET_NAME;

if (!awsKeyId || !awsSecret || !awsRegion || !awsBucket) {
  logger.warn('⚠️ AWS S3 Configuration Warning: Missing required AWS S3 environment variables. Uploads will fail unless defined.');
}

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
    
    const result = await uploadMedia(
      req.file.buffer,
      `avatars/${userId}`,
      'avatar',
      'image',
      req.file.originalname
    );
    
    res.json({ success: true, url: result.url });
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
    
    const result = await uploadMedia(
      req.file.buffer,
      `posts/${userId}`,
      'post',
      mediaType,
      req.file.originalname
    );
    
    res.json({ 
      success: true, 
      url: result.url, 
      mediaType: result.mediaType,
      width: result.width,
      height: result.height,
      aspectRatio: result.aspectRatio,
      thumbnailUrl: result.thumbnailUrl
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

    const result = await uploadMedia(
      req.file.buffer,
      `stories/${userId}`,
      'story',
      mediaType,
      req.file.originalname
    );

    res.json({ 
      success: true, 
      url: result.url, 
      mediaType: result.mediaType, 
      thumbnailUrl: result.thumbnailUrl 
    });
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
    const resourceType = req.body.mediaType === 'audio' ? 'video' : (req.body.mediaType || 'auto');

    const result = await uploadMedia(
      req.file.buffer,
      folder,
      'media',
      resourceType,
      req.file.originalname
    );

    res.json({ 
      success: true, 
      url: result.url, 
      thumbnailUrl: result.thumbnailUrl,
      data: { 
        url: result.url,
        thumbnailUrl: result.thumbnailUrl,
        width: result.width,
        height: result.height,
        aspectRatio: result.aspectRatio
      } 
    });
  } catch (err) {
    logger.error('Error in industrial upload: %s', err.message);
    res.status(500).json({ success: false, error: `Upload failed: ${err.message}` });
  }
});

module.exports = router;
