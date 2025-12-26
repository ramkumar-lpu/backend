import express from 'express';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

const router = express.Router();

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dg2jdhufe',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer (memory) for images
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image uploads are allowed'));
  },
});

// Simple session-based auth (no JWT)
const authMiddleware = (req, res, next) => {
  const user = req.session?.user || req.user;
  if (!user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  req.user = user;
  next();
};

// Get profile API status
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Profile API is working',
    endpoints: {
      uploadProfilePicture: 'POST /api/profile/upload-profile-picture',
      getProfile: 'GET /api/profile/me'
    }
  });
});

// Upload profile picture (multipart "file" or JSON { base64Image })
router.post(
  '/upload-profile-picture',
  authMiddleware,
  upload.single('file'),
  async (req, res) => {
    try {
      const userId = req.user._id || req.user.id;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ 
          success: false, 
          error: 'No image provided',
          payload: null
        });
      }

      const uploadOptions = {
        folder: 'users/profile-pictures',
        public_id: `user-${userId}-profile-${Date.now()}`,
        overwrite: true,
        invalidate: true,
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto:good' },
          { format: 'webp' },
        ],
      };

      const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
      const uploadResult = await cloudinary.uploader.upload(dataUri, uploadOptions);

      const User = (await import('../models/User.js')).default;
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found',
          payload: null
        });
      }

      // ✅ Update with correct field names
      user.profileImage = uploadResult.secure_url;
      user.profilePicturePublicId = uploadResult.public_id;
      await user.save();

      // ✅ Update session with correct field
      req.user.profileImage = user.profileImage;

      // ✅ Include payload in response
      return res.json({
        success: true,
        profilePictureUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        payload: {
          profileImage: uploadResult.secure_url,
          profilePicturePublicId: uploadResult.public_id
        },
        user: {
          _id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImage: user.profileImage
        },
        message: 'Profile picture uploaded successfully!',
      });
    } catch (error) {
      console.error('Profile picture upload error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to upload profile picture',
        payload: null,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
);
// Delete profile picture
router.delete('/profile-picture/:publicId', authMiddleware, async (req, res) => {
  try {
    const { publicId } = req.params;
    const result = await cloudinary.uploader.destroy(publicId);
    if (result.result === 'ok') {
      return res.json({ success: true, message: 'Profile picture deleted successfully' });
    }
    return res.status(404).json({ success: false, error: 'Image not found or already deleted' });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to delete profile picture' });
  }
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Profile routes are working!',
    cloudinaryConfigured: !!process.env.CLOUDINARY_CLOUD_NAME,
    timestamp: new Date().toISOString(),
  });
});

export default router;