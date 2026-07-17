const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
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

// Configure Cloudinary
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  logger.error('🚨 Cloudinary Configuration Error: Missing required environment variables (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET). Please verify your environment settings.');
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret
});

// Configure multer for memory storage with strict limits
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

const uploadStory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

/**
 * Upload file to Cloudinary
 */
async function uploadToCloudinary(fileBuffer, folder, resourceType = 'auto', options = {}) {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary environment variables are missing on the server. Please define CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your server environment variables (e.g. Render Dashboard).');
  }
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: folder,
      resource_type: resourceType,
      upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET || undefined,
      transformation: [
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    };

    // Enable chunked upload for large files (bypasses 10MB single upload limit)
    const isLarge = fileBuffer.length > 6 * 1024 * 1024;
    if (isLarge) {
      uploadOptions.chunk_size = 6 * 1024 * 1024; // 6MB chunks
    }

    const uploadStream = isLarge
      ? cloudinary.uploader.upload_chunked_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              logger.error('❌ Cloudinary upload error: %O', error);
              reject(error);
            } else {
              logger.info('✅ Cloudinary upload success: %s', result.secure_url);
              resolve(options.returnResult ? result : result.secure_url);
            }
          }
        )
      : cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              logger.error('❌ Cloudinary upload error: %O', error);
              reject(error);
            } else {
              logger.info('✅ Cloudinary upload success: %s', result.secure_url);
              resolve(options.returnResult ? result : result.secure_url);
            }
          }
        );
    uploadStream.end(fileBuffer);
  });
}

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
    let url;
    if (process.env.STORAGE_PROVIDER === 's3') {
      const result = await s3Service.uploadMedia(req.file.buffer, `avatars/${userId}`, 'avatar', 'image', req.file.originalname || 'avatar.jpg');
      url = result.secure_url;
    } else {
      url = await uploadToCloudinary(req.file.buffer, `avatars/${userId}`, 'image');
    }
    res.json({ success: true, url });
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
    
    let result;
    if (process.env.STORAGE_PROVIDER === 's3') {
      result = await s3Service.uploadMedia(req.file.buffer, `posts/${userId}`, 'post', mediaType, req.file.originalname || 'file');
    } else {
      result = await uploadToCloudinary(req.file.buffer, `posts/${userId}`, mediaType, { returnResult: true });
    }
    
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

    let result;
    let thumbnailUrl;

    if (process.env.STORAGE_PROVIDER === 's3') {
      result = await s3Service.uploadMedia(req.file.buffer, `stories/${userId}`, 'story', mediaType, req.file.originalname || 'file');
      thumbnailUrl = result.thumbnailUrl;
    } else {
      result = await uploadToCloudinary(req.file.buffer, `stories/${userId}`, mediaType, { returnResult: true });
      if (result.resource_type === 'video') {
        thumbnailUrl = cloudinary.url(result.public_id, {
          resource_type: 'video', format: 'jpg', secure: true,
          transformation: [{ width: 300, height: 300, crop: 'fill' }, { quality: 'auto' }]
        });
      }
    }

    res.json({ success: true, url: result.secure_url, mediaType: result.resource_type, thumbnailUrl });
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

    let result;
    let thumbnailUrl;

    if (process.env.STORAGE_PROVIDER === 's3') {
      result = await s3Service.uploadMedia(req.file.buffer, folder, 'media', req.body.mediaType || 'auto', req.file.originalname || 'file');
      thumbnailUrl = result.thumbnailUrl;
    } else {
      result = await uploadToCloudinary(req.file.buffer, folder, resourceType, { returnResult: true });
      if (result.resource_type === 'video') {
        thumbnailUrl = cloudinary.url(result.public_id, {
          resource_type: 'video', format: 'jpg', secure: true,
          transformation: [{ width: 300, height: 300, crop: 'fill' }, { quality: 'auto' }]
        });
      }
    }

    res.json({ 
      success: true, 
      url: result.secure_url, 
      thumbnailUrl,
      data: { 
        url: result.secure_url,
        thumbnailUrl,
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
