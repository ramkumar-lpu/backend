import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  // Authentication providers
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  
  // Personal information
  firstName: {
    type: String,
    required: function() { return !this.googleId; } // Required only for manual signup
  },
  lastName: {
    type: String,
    required: function() { return !this.googleId; }
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  
  // Profile image - using URL approach
  // profilePicture: {
  //   url: {
  //     type: String,
  //     default: 'https://res.cloudinary.com/your-cloud/image/upload/v1/defaults/default-avatar.png'
  //   },
  //   publicId: String, // For cloud storage like Cloudinary
  //   uploadedAt: Date
  // },
   profileImage: {
    type: String,
    default: null
  },
  profilePicturePublicId: {
    type: String,
    default: null
  },
  
  // Password fields (only for manual login)
  password: {
    type: String,
    minlength: 6,
    select: false // Won't be included in queries by default
  },
  
  // Account status
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  
  // OTP fields for verification
  verificationOTP: {
    type: String,
    select: false
  },
  verificationOTPExpires: {
    type: Date,
    select: false
  },
  
  // Password reset fields
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  resetPasswordOTP: String,
  resetPasswordOTPExpires: Date,
  
  // Registration status
  registrationStatus: {
    type: String,
    enum: ['pending_verification', 'completed', 'active'],
    default: 'pending_verification'
  },
  
  // Account security
  lastPasswordChange: Date,
  failedLoginAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  accountLockedUntil: Date,
  
  // Registration info
  registrationIp: String,
  userAgent: String,
  lastLogin: Date,
  lastLoginIp: String,
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // User preferences
  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    loginAlerts: {
      type: Boolean,
      default: true
    }
  },
  
  // Account type
  accountType: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  
  // Active status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Email verification timestamp
  emailVerifiedAt: Date
}, {
  timestamps: true, // Automatically manages createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.email.split('@')[0]; // Fallback to email username
});

// Virtual for display name (if you need it separately)
userSchema.virtual('displayName').get(function() {
  return this.fullName;
});

// Middleware to update 'updatedAt' on save
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Hash password before saving (only for local accounts)
userSchema.pre('save', async function(next) {
  if (this.accountType !== 'local' || !this.isModified('password')) {
    return next();
  }
  
  try {
    // Check if password meets requirements
    if (this.password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }
    
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.lastPasswordChange = Date.now();
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password || this.accountType !== 'local') return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// ========== OTP METHODS ==========

// Generate OTP for email verification (for registration)
userSchema.methods.generateVerificationOTP = function() {
  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Hash the OTP before storing
  this.verificationOTP = crypto
    .createHash('sha256')
    .update(otp)
    .digest('hex');
    
  this.verificationOTPExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return otp;
};

// Verify registration OTP
userSchema.methods.verifyRegistrationOTP = function(candidateOTP) {
  if (!this.verificationOTP || !this.verificationOTPExpires) {
    return false;
  }
  
  // Hash the candidate OTP for comparison
  const hashedCandidateOTP = crypto
    .createHash('sha256')
    .update(candidateOTP)
    .digest('hex');
    
  // Check if OTP matches and hasn't expired
  const isValid = this.verificationOTP === hashedCandidateOTP && 
                  Date.now() < this.verificationOTPExpires;
  
  return isValid;
};

// Generate OTP for password reset
userSchema.methods.generateResetOTP = function() {
  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  this.resetPasswordOTP = crypto
    .createHash('sha256')
    .update(otp)
    .digest('hex');
    
  this.resetPasswordOTPExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return otp;
};

// Verify OTP for password reset
userSchema.methods.verifyResetOTP = function(candidateOTP) {
  if (!this.resetPasswordOTP || !this.resetPasswordOTPExpires) {
    return false;
  }
  
  const hashedCandidateOTP = crypto
    .createHash('sha256')
    .update(candidateOTP)
    .digest('hex');
    
  return this.resetPasswordOTP === hashedCandidateOTP && 
         Date.now() < this.resetPasswordOTPExpires;
};

// ========== TOKEN METHODS ==========

// Generate email verification token (for link-based verification)
userSchema.methods.generateEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
    
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return verificationToken;
};

// Generate password reset token (for link-based reset)
userSchema.methods.generatePasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  this.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
  
  return resetToken;
};

// Clear all reset/verification tokens
userSchema.methods.clearTokens = function() {
  this.resetPasswordToken = undefined;
  this.resetPasswordExpires = undefined;
  this.resetPasswordOTP = undefined;
  this.resetPasswordOTPExpires = undefined;
  this.emailVerificationToken = undefined;
  this.emailVerificationExpires = undefined;
  this.verificationOTP = undefined;
  this.verificationOTPExpires = undefined;
};

// ========== ACCOUNT SECURITY METHODS ==========

// Check if account is locked
userSchema.methods.isAccountLocked = function() {
  return this.accountLockedUntil && this.accountLockedUntil > Date.now();
};

// Increment failed login attempts
userSchema.methods.incrementFailedAttempts = function() {
  this.failedLoginAttempts += 1;
  
  if (this.failedLoginAttempts >= 5) {
    this.accountLockedUntil = Date.now() + 15 * 60 * 1000; // Lock for 15 minutes
  }
  
  return this.failedLoginAttempts;
};

// Reset failed login attempts
userSchema.methods.resetFailedAttempts = function() {
  this.failedLoginAttempts = 0;
  this.accountLockedUntil = undefined;
};

// ========== PROFILE METHODS ==========

// Method to update profile picture
// Remove the old updateProfilePicture method and replace with:
userSchema.methods.updateProfilePicture = function(imageUrl, publicId = null) {
  this.profileImage = imageUrl;
  this.profilePicturePublicId = publicId;
};

// ========== STATIC METHODS ==========

// Static method to find by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

// Static method to find user with verification OTP (for registration)
userSchema.statics.findByEmailWithVerificationOTP = function(email) {
  return this.findOne({ email: email.toLowerCase().trim() })
    .select('+verificationOTP +verificationOTPExpires');
};

// Static method to find user with password reset OTP
userSchema.statics.findByEmailWithResetOTP = function(email) {
  return this.findOne({ email: email.toLowerCase().trim() })
    .select('+resetPasswordOTP +resetPasswordOTPExpires');
};

// Static method to find user with security fields
userSchema.statics.findByEmailWithSecurity = function(email) {
  return this.findOne({ email: email.toLowerCase().trim() })
    .select('+password +failedLoginAttempts +accountLockedUntil');
};

// ========== INDEXES ==========

// Indexes for better query performance
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ resetPasswordToken: 1 });
userSchema.index({ resetPasswordOTP: 1 });
userSchema.index({ emailVerificationToken: 1 });
userSchema.index({ verificationOTP: 1 });
userSchema.index({ accountLockedUntil: 1 });
userSchema.index({ registrationStatus: 1 });

const User = mongoose.model('User', userSchema);

export default User;