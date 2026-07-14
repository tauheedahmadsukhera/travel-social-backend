const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadMedia } = require('../utils/s3Service');

// Multer for multipart/form-data uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const { verifyToken } = require('../middleware/authMiddleware');

// Upload media (POST /api/media/upload) — JWT required to prevent anonymous abuse
// Supports BOTH:
//   1) multipart/form-data with file field (from XHR/FormData)
//   2) JSON body with { file: "base64...", mediaType: "image" }
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const mediaType = req.body.mediaType || 'auto';
    const userId = req.userId || 'anonymous';
    const folder = `media/${userId}`;

    let fileBuffer;
    let originalName = 'file';

    if (req.file) {
      // Multipart upload - file is in memory buffer
      fileBuffer = req.file.buffer;
      originalName = req.file.originalname;
    } else {
      // JSON body - base64 data URI or remote URL
      const file = req.body.file || req.body.image;
      if (!file) {
        return res.status(400).json({ success: false, error: 'No file provided' });
      }

      // Check if it's base64 data URI
      if (typeof file === 'string' && file.startsWith('data:')) {
        const matches = file.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return res.status(400).json({ success: false, error: 'Invalid base64 data URI format' });
        }
        fileBuffer = Buffer.from(matches[2], 'base64');
      } else if (typeof file === 'string') {
        // Assume pure base64 string
        fileBuffer = Buffer.from(file, 'base64');
      } else {
        return res.status(400).json({ success: false, error: 'Unsupported file payload format' });
      }
    }

    const uploadSource = await uploadMedia(
      fileBuffer,
      folder,
      'media',
      mediaType,
      originalName
    );

    return res.json({
      success: true,
      url: uploadSource.secure_url,
      secureUrl: uploadSource.secure_url,
      data: {
        url: uploadSource.secure_url,
        width: uploadSource.width,
        height: uploadSource.height,
        format: uploadSource.mediaType === 'image' ? 'jpg' : 'mp4',
        resourceType: uploadSource.mediaType,
        thumbnailUrl: uploadSource.thumbnailUrl
      }
    });
  } catch (err) {
    console.error('❌ Media upload error:', err.message);
    return res.status(500).json({ success: false, error: 'Operation failed: ' + err.message });
  }
});

module.exports = router;
