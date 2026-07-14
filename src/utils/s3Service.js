const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('./logger');

// Configure fluent-ffmpeg to use the static binary path
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
} else {
  logger.warn('⚠️ ffmpeg-static path was not found. Video thumbnail extraction might fail.');
}

// Instantiate AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * Upload a Buffer to AWS S3 using lib-storage parallel upload
 * @param {Buffer} buffer - File buffer
 * @param {string} key - S3 object path key
 * @param {string} contentType - MIME content type of the file
 * @returns {Promise<string>} Full S3 URL of the uploaded resource
 */
async function uploadBufferToS3(buffer, key, contentType) {
  if (!process.env.AWS_S3_BUCKET_NAME) {
    throw new Error('AWS_S3_BUCKET_NAME is not defined in backend environment variables.');
  }

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    },
  });

  const result = await upload.done();
  // AWS S3 standard public URL
  return result.Location || `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}

/**
 * Optimize and resize image buffers before uploading to S3
 * @param {Buffer} buffer - Original image buffer
 * @param {string} context - Upload context ('avatar', 'post', 'story', etc.)
 * @returns {Promise<Buffer>} Optimized image buffer
 */
async function optimizeImage(buffer, context) {
  try {
    let pipeline = sharp(buffer);
    
    if (context === 'avatar') {
      // User avatars should be square-cropped and resized to 400x400
      pipeline = pipeline.resize(400, 400, { fit: 'cover' });
    } else {
      // Feed posts/stories: Resize to max width 1200px (standard size) to keep loading times fast and costs low
      pipeline = pipeline.resize(1200, null, { withoutEnlargement: true });
    }

    // Convert to JPEG with quality 80 for universal browser/mobile compatibility and low file size
    return await pipeline.jpeg({ quality: 80, force: true }).toBuffer();
  } catch (err) {
    logger.warn(`Image optimization failed, returning original buffer: ${err.message}`);
    return buffer;
  }
}

/**
 * Extract a single screenshot frame from a video buffer to use as thumbnail
 * @param {Buffer} videoBuffer - Video file buffer
 * @returns {Promise<Buffer>} JPEG image buffer of the extracted frame
 */
async function generateVideoThumbnail(videoBuffer) {
  const tempDir = os.tmpdir();
  const randomSuffix = Math.random().toString(36).substring(7);
  const tempVideoPath = path.join(tempDir, `temp_video_${randomSuffix}.mp4`);
  const tempThumbPath = path.join(tempDir, `temp_thumb_${randomSuffix}.jpg`);

  try {
    // Write the video buffer temporarily to local disk
    await fs.writeFile(tempVideoPath, videoBuffer);

    // Extract the frame at the 1 second mark using fluent-ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .screenshots({
          count: 1,
          timemarks: ['1'], // extract at 1 second
          filename: path.basename(tempThumbPath),
          folder: path.dirname(tempThumbPath),
          size: '640x?' // maximum width 640px, auto height
        })
        .on('end', resolve)
        .on('error', (err) => {
          reject(err);
        });
    });

    // Read the generated screenshot file
    const thumbBuffer = await fs.readFile(tempThumbPath);
    return thumbBuffer;
  } finally {
    // Clean up temporary files asynchronously
    try {
      await fs.unlink(tempVideoPath);
    } catch (_) {}
    try {
      await fs.unlink(tempThumbPath);
    } catch (_) {}
  }
}

/**
 * Unified entry point to handle client media uploads and optimization
 * @param {Buffer} fileBuffer - Media file buffer
 * @param {string} folder - Upload folder path prefix
 * @param {string} context - Context (e.g. 'avatar', 'post', 'story')
 * @param {string} mediaType - Type of media: 'image', 'video', 'audio', or 'auto'
 * @param {string} originalName - Original file name for ext identification
 */
async function uploadMedia(fileBuffer, folder, context, mediaType = 'auto', originalName = 'file') {
  const extension = path.extname(originalName) || (mediaType === 'video' ? '.mp4' : '.jpg');
  const randomSuffix = Math.random().toString(36).substring(7);
  // Generate file prefix
  const baseKey = `${folder}/${Date.now()}-${randomSuffix}`;

  let finalBuffer = fileBuffer;
  let finalMediaType = mediaType;
  let width = null;
  let height = null;
  let thumbnailUrl = null;

  // 1. Handle Image Optimization & Dimension Parsing
  if (mediaType === 'image' || mediaType === 'auto') {
    try {
      const metadata = await sharp(fileBuffer).metadata();
      if (metadata.format) {
        finalMediaType = 'image';
        finalBuffer = await optimizeImage(fileBuffer, context);
        // Extract size parameters from optimized buffer
        const optimizedMeta = await sharp(finalBuffer).metadata();
        width = optimizedMeta.width || null;
        height = optimizedMeta.height || null;
      }
    } catch (err) {
      if (mediaType === 'image') {
        throw new Error(`Failed to parse image file: ${err.message}`);
      }
      // If it fails auto-detection, we fall through and check other types
    }
  }

  // 2. Handle Video Thumbnailing
  if (finalMediaType === 'video' || (mediaType === 'auto' && finalMediaType !== 'image')) {
    finalMediaType = 'video';
    try {
      const thumbBuffer = await generateVideoThumbnail(fileBuffer);
      const thumbKey = `${baseKey}-thumb.jpg`;
      thumbnailUrl = await uploadBufferToS3(thumbBuffer, thumbKey, 'image/jpeg');
    } catch (err) {
      logger.warn(`Could not generate thumbnail for video: ${err.message}`);
    }
  }

  // 3. Upload Main File
  const contentType = finalMediaType === 'image' 
    ? 'image/jpeg' 
    : (finalMediaType === 'video' ? 'video/mp4' : 'application/octet-stream');
  
  const mainKey = `${baseKey}${finalMediaType === 'image' ? '.jpg' : extension}`;
  const s3Url = await uploadBufferToS3(finalBuffer, mainKey, contentType);

  return {
    url: s3Url,
    secure_url: s3Url, // For backwards compatibility
    mediaType: finalMediaType,
    resource_type: finalMediaType, // For backwards compatibility
    width,
    height,
    aspectRatio: width && height ? width / height : 1,
    thumbnailUrl
  };
}

module.exports = {
  uploadBufferToS3,
  uploadMedia
};
