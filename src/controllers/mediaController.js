const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload media (image/video/audio) to Cloudinary
// Accepts base64 data URI or remote URL in req.body.file OR req.body.image
exports.uploadImage = async (req, res) => {
  try {
    const file = req.body.file || req.body.image; // Accept both field names
    const mediaType = req.body.mediaType || 'auto';
    
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    // Cloudinary resource_type: audio files should use 'video' resource type
    const resourceType = mediaType === 'audio' ? 'video' : (mediaType === 'video' ? 'video' : 'auto');

    const result = await cloudinary.uploader.upload(file, { 
      folder: 'trave-social',
      resource_type: resourceType
    });

    res.json({ 
      success: true, 
      url: result.secure_url,
      secureUrl: result.secure_url,
      data: {
        url: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        resourceType: result.resource_type
      }
    });
  } catch (err) {
    console.error('❌ Media upload error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};
