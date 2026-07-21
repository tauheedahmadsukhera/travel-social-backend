const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const s3Service = require('../utils/s3Service');
const { verifyToken } = require('../middleware/authMiddleware');

// Use diskStorage to avoid holding large video files in RAM (OOM fix)
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.tmp';
      cb(null, `media-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
  }),
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
  let tempFilePath = null;
  try {
    const mediaType = req.body.mediaType || 'auto';

    let uploadInput; // Buffer or file path accepted by s3Service.uploadMedia
    let originalName = 'file';

    if (req.file) {
      // Multipart upload — file is on disk, pass path to avoid re-buffering in memory
      tempFilePath = req.file.path;
      uploadInput = req.file.path;
      originalName = req.file.originalname || 'file';
    } else {
      // Base64 body upload (typically for small images/avatars)
      const file = req.body.file || req.body.image;
      if (!file) {
        return res.status(400).json({ success: false, error: 'No file provided' });
      }
      if (file.startsWith('data:') && file.includes(';base64,')) {
        const parsed = base64ToBuffer(file);
        uploadInput = parsed.buffer;
      } else {
        uploadInput = Buffer.from(file.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');
      }
    }

    const result = await s3Service.uploadMedia(uploadInput, 'trave-social', 'media', mediaType, originalName);

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
  } finally {
    // Always clean up the temp disk file to avoid accumulating stale uploads
    if (tempFilePath) {
      try { await fs.unlink(tempFilePath); } catch (_) {}
    }
  }
});

module.exports = router;
