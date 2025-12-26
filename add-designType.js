// backend/add-designType.js
import mongoose from 'mongoose';
import Design from './models/Design.js';

async function addDesignTypeField() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/shoecreatify', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to MongoDB');
    
    // First, check how many designs exist
    const totalDesigns = await Design.countDocuments();
    console.log(`📊 Total designs in database: ${totalDesigns}`);
    
    // Add designType to all existing designs that don't have it
    const result = await Design.updateMany(
      { designType: { $exists: false } }, // Find docs without designType
      { 
        $set: { 
          designType: 'ai-generated', // Default value
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`✅ Added designType to ${result.modifiedCount} designs`);
    
    // Also check for 3D designs and update their designType
    const threeDDesigns = await Design.updateMany(
      { 
        $or: [
          { 'customization.type': '3d-custom' },
          { 'customization.type': '3d-customization' },
          { designType: '3d-custom' }
        ]
      },
      { 
        $set: { 
          designType: '3d-custom',
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`✅ Updated ${threeDDesigns.modifiedCount} 3D designs`);
    
    // Check for template-based designs
    const templateDesigns = await Design.updateMany(
      { 
        $or: [
          { templateId: { $exists: true, $ne: null } },
          { designType: 'template' }
        ]
      },
      { 
        $set: { 
          designType: 'template',
          updatedAt: new Date()
        }
      }
    );
    
    console.log(` Updated ${templateDesigns.modifiedCount} template designs`);
    
    // Verify the update
    const designTypes = await Design.aggregate([
      {
        $group: {
          _id: '$designType',
          count: { $sum: 1 }
        }
      }
    ]);
    
    console.log('\n Design Types Distribution:');
    designTypes.forEach(type => {
      console.log(`   ${type._id || 'null'}: ${type.count} designs`);
    });
    
    const missingDesignType = await Design.countDocuments({ 
      designType: { $exists: false } 
    });
    
    console.log(`\n Designs still missing designType: ${missingDesignType}`);
    
    process.exit(0);
  } catch (error) {
    console.error(' Error:', error);
    process.exit(1);
  }
}

addDesignTypeField();