import express from 'express';
import mongoose from 'mongoose';
import Design from '../models/Design.js';
import cloudinary from 'cloudinary'; // ADD THIS IMPORT

const router = express.Router();

// Configure Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Get all designs
router.get('/', async (req, res) => {
  try {
    const designs = await Design.find().populate('user', 'firstName lastName email').limit(50);
    res.json({ success: true, count: designs.length, designs });
  } catch (error) {
    console.error('Error fetching designs:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch designs' });
  }
});

// Upload base64 to Cloudinary
router.post('/upload-base64', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { base64Image } = req.body;

    if (!base64Image) {
      return res.status(400).json({ success: false, message: 'No image provided' });
    }

    console.log('Uploading base64 image to Cloudinary...');

    // Upload base64 to Cloudinary
    const result = await cloudinary.v2.uploader.upload(base64Image, {
      folder: 'shoecreatify/designs',
      transformation: [
        { width: 800, height: 600, crop: 'limit' },
        { quality: 'auto:good' }
      ]
    });

    console.log('Cloudinary upload successful:', result.secure_url);

    res.json({
      success: true,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      message: 'Image uploaded to Cloudinary'
    });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Image upload failed',
      error: error.message 
    });
  }
});

// Save a new design with Cloudinary URL
router.post('/', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { name, description, imageUrl, templateId, price, customization } = req.body;

    // Determine design type
    const is3DDesign = customization?.type === '3d-custom';
    const isAIDesign = customization?.type === 'ai-generated' || 
                      (description && description.includes('AI')) ||
                      (!customization && description);

    // Convert templateId to NUMBER
    const templateIdNumber = parseInt(templateId) || Date.now();
    
    // Create new design
   // In the POST route - fix the design creation
const newDesign = new Design({
  user: req.user._id,
  templateId: templateIdNumber,
  name: name || 'Untitled Design',
  description: description || '',
  designType: is3DDesign ? '3d-custom' : 'ai-generated', // SET THIS
  customization: customization || {
    type: is3DDesign ? '3d-custom' : 'ai-generated',
    prompt: description || ''
  },
  price: price || 0,
  imageUrl: imageUrl || '',
  preview: is3DDesign && imageUrl.length > 50000 ? imageUrl : null, // Store large images in preview
  cloudinaryUrl: imageUrl && imageUrl.includes('res.cloudinary.com') ? imageUrl : null,
  createdAt: new Date()
});

    const savedDesign = await newDesign.save();

    console.log('Design saved successfully:', {
      id: savedDesign._id,
      name: savedDesign.name,
      type: savedDesign.designType,
      imageUrl: savedDesign.imageUrl ? 'Has URL' : 'No URL',
      imageUrlStartsWith: savedDesign.imageUrl ? savedDesign.imageUrl.substring(0, 50) + '...' : 'none'
    });

    res.status(201).json({
      success: true,
      design: savedDesign,
      message: 'Design saved successfully'
    });
  } catch (error) {
    console.error('Error saving design:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Get user's designs
router.get('/my-designs', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const designs = await Design.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    console.log(`Fetched ${designs.length} designs for user ${req.user._id}`);
    
    // Log design details for debugging
    designs.forEach((design, index) => {
      console.log(`Design ${index}:`, {
        id: design._id,
        name: design.name,
        designType: design.designType,
        hasImageUrl: !!design.imageUrl,
        imageUrlType: design.imageUrl ? typeof design.imageUrl : 'none',
        imageUrlStart: design.imageUrl ? design.imageUrl.substring(0, 50) : 'none'
      });
    });

    res.json({
      success: true,
      designs
    });
  } catch (error) {
    console.error('Error fetching designs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Delete a design
router.delete('/:id', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid design ID format' 
      });
    }

    const design = await Design.findById(req.params.id);
    
    if (!design) {
      return res.status(404).json({ 
        success: false, 
        message: 'Design not found' 
      });
    }

    // Check if user owns the design
    if (design.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to delete this design' 
      });
    }

    // Delete from Cloudinary if there's a publicId
    if (design.customization?.publicId) {
      try {
        await cloudinary.v2.uploader.destroy(design.customization.publicId);
        console.log('Deleted from Cloudinary:', design.customization.publicId);
      } catch (cloudinaryError) {
        console.warn('Cloudinary delete failed:', cloudinaryError);
      }
    }

    await design.deleteOne();
    
    console.log(`Design deleted successfully: ${req.params.id} by user ${req.user._id}`);
    
    res.json({
      success: true,
      message: 'Design deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting design:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid design ID' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error deleting design',
      error: error.message 
    });
  }
});

// Get a single design by ID
router.get('/:id', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid design ID format' 
      });
    }

    const design = await Design.findById(req.params.id);
    
    if (!design) {
      return res.status(404).json({ 
        success: false, 
        message: 'Design not found' 
      });
    }

    // Check if user owns the design
    if (design.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to view this design' 
      });
    }

    res.json({
      success: true,
      design
    });
  } catch (error) {
    console.error('Error fetching design:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid design ID format',
        error: error.message 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Check if design exists by localId
router.get('/check/:localId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const localId = parseInt(req.params.localId);
    if (isNaN(localId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid local ID format' 
      });
    }

    const design = await Design.findOne({ 
      user: req.user._id,
      templateId: localId
    });

    res.json({
      success: true,
      exists: !!design,
      design: design
    });
  } catch (error) {
    console.error('Check error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

export default router;