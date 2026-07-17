const express = require('express');
const router = express.Router();
const multer = require('multer');
const s3Service = require('../utils/s3Service');
const { verifyToken } = require('../middleware/authMiddleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Helper: base64 helper
function base64ToBuffer(base64Str) {
  const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return {
      type: null,
      buffer: Buffer.from(base64Str, 'base64')
    };
  }
  return {
    type: matches[1],
    buffer: Buffer.from(matches[2], 'base64')
  };
}

// Upload media (POST /api/media/upload) — JWT required to prevent anonymous abuse
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const mediaType = req.body.mediaType || 'auto';

    let finalBuffer;
    let originalName = 'file';
    if (req.file) {
      finalBuffer = req.file.buffer;
      originalName = req.file.originalname || 'file';
    } else {
      const file = req.body.file || req.body.image;
      if (!file) {
        return res.status(400).json({ success: false, error: 'No file provided' });
      }
      if (file.startsWith('data:') && file.includes(';base64,')) {
        const parsed = base64ToBuffer(file);
        finalBuffer = parsed.buffer;
      } else {
        finalBuffer = Buffer.from(file.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');
      }
    }

    const result = await s3Service.uploadMedia(finalBuffer, 'trave-social', 'media', mediaType, originalName);
    
    return res.json({
      success: true,
      url: result.secure_url,
      secureUrl: result.secure_url,
      thumbnailUrl: result.thumbnailUrl,
      data: {
        url: result.secure_url,
        thumbnailUrl: result.thumbnailUrl,
        width: result.width,
        height: result.height,
        format: result.mediaType === 'image' ? 'webp' : 'mp4',
        resourceType: result.resource_type
      }
    });
  } catch (err) {
    console.error('❌ Media upload error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed' });
  }
});

module.exports = router;
