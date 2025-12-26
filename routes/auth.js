import express from 'express';
import passport from 'passport';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import crypto from 'crypto';
import User from '../models/User.js';
import { 
  sendPasswordResetOTPEmail, 
  sendPasswordChangedEmail,
  sendWelcomeEmail,
  sendLoginAlertEmail,
  sendVerificationOTPEmail
} from '../config/email.js';

const router = express.Router();

// ========== AUTH MIDDLEWARE ==========
const authMiddleware = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({
    success: false,
    error: 'Not authenticated. Please log in.'
  });
};

// ========== RATE LIMITING MIDDLEWARE ==========
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many attempts, please try again later.'
  },
  skipSuccessfulRequests: true
});

// Separate limiters for OTP-related routes
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: 'Too many OTP requests. Please try again later.'
  }
});

// Limiter for OTP verification attempts
const otpVerifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many verification attempts. Please request a new OTP.'
  }
});

// Limiter for registration OTP requests
const registrationOTPLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many registration OTP requests. Please try again later.'
  }
});

// ========== INPUT VALIDATION MIDDLEWARE ==========
const validateRegisterInput = (req, res, next) => {
  const { firstName, lastName, email, password } = req.body;
  
  const errors = [];
  
  if (!firstName || firstName.trim().length < 3) {
    errors.push('First name must be at least 3 characters');
  }
  
  if (!lastName || lastName.trim().length < 3) {
    errors.push('Last name must be at least 3 characters');
  }
  
  if (!email || !validator.isEmail(email) || email.length > 100) {
    errors.push('Valid email is required');
  }
  
  if (!password || password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

// Login input validation
const validateLoginInput = (req, res, next) => {
  const { email, password } = req.body;
  
  if (!email || !validator.isEmail(email) || email.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Valid email is required'
    });
  }
  
  if (!password || password.length < 1) {
    return res.status(400).json({
      success: false,
      message: 'Password is required'
    });
  }
  
  next();
};

// ========== AUTH API INFO ==========
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Auth API is working',
    endpoints: {
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      logout: 'POST /api/auth/logout',
      user: 'GET /api/auth/user',
      googleAuth: 'GET /api/auth/google',
      resetPassword: 'POST /api/auth/forgot-password',
      verifyOTP: 'POST /api/auth/verify-otp'
    }
  });
});

// ========== GOOGLE OAUTH ROUTES ==========
router.get('/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

// Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=auth_failed`,
    failureMessage: true
  }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?login=success`);
  }
);

// ========== REGISTRATION FLOW ==========

// STEP 1: Register user and send OTP
router.post('/register', registrationOTPLimiter, validateRegisterInput, async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    
    console.log(' Registration attempt for:', email);
    
    const normalizedEmail = validator.normalizeEmail(email);
    
    // Check if user exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    
    if (existingUser) {
      console.log(' User already exists:', normalizedEmail);
      
      if (existingUser.accountType === 'google') {
        return res.status(409).json({
          success: false,
          message: 'Account already exists with Google. Please use Google login.',
          accountType: 'google'
        });
      }
      
      if (existingUser.isEmailVerified) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists. Try logging in instead.'
        });
      }
      
      // Delete unverified user
      console.log(' Deleting unverified user:', existingUser._id);
      await User.deleteOne({ _id: existingUser._id });
    }
    
    // Create new user
    const user = new User({
      firstName: validator.escape(firstName.trim()),
      lastName: validator.escape(lastName.trim()),
      email: normalizedEmail,
      password,
      accountType: 'local',
      isEmailVerified: false,
      registrationIp: req.ip,
      userAgent: req.get('User-Agent'),
      registrationStatus: 'pending_verification'
    });
    
    // Generate OTP
    const otp = user.generateVerificationOTP();
    console.log(' Generated OTP for user:', user._id);
    
    await user.save();
    
    // Send verification email
    console.log(' Sending verification email to:', normalizedEmail);
    await sendVerificationOTPEmail(user, otp);
    
    res.status(201).json({
      success: true,
      message: 'Registration initiated! Please check your email for verification OTP.',
      email: normalizedEmail,
      userId: user._id
    });
    
  } catch (error) {
    console.error(' Registration error:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Account with this email already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Registration failed due to server error. Please try again.'
    });
  }
});

// STEP 2: Verify OTP and activate account 
router.post('/verify-registration-otp', otpVerifyLimiter, async (req, res) => {
  console.log(' OTP verification request received');
  
  try {
    const { email, otp } = req.body;
    if (!email || !validator.isEmail(email) || !otp || otp.length !== 6) {
      console.log(' Invalid input');
      return res.status(400).json({
        success: false,
        message: 'Valid email and 6-digit OTP are required'
      });
    }
    const normalizedEmail = validator.normalizeEmail(email);
    
    // CRITICAL: Select OTP fields since they're marked select: false
    const user = await User.findOne({ 
      email: normalizedEmail,
      registrationStatus: 'pending_verification'
    }).select('+verificationOTP +verificationOTPExpires');
    
    console.log('👤 User found:', user ? 'Yes' : 'No');
    
    if (!user) {
      console.log(' No pending registration found');
      return res.status(404).json({
        success: false,
        message: 'No pending registration found. Please register again.'
      });
    }
    
    // Verify OTP
    console.log(' Verifying OTP...');
    const isValidOTP = user.verifyRegistrationOTP(otp);
    
    if (!isValidOTP) {
      console.log(' Invalid OTP');
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }
    console.log(' OTP verified successfully');
    
    // Activate user
    user.isEmailVerified = true;
    user.verificationOTP = undefined;
    user.verificationOTPExpires = undefined;
    user.registrationStatus = 'completed';
    user.emailVerifiedAt = new Date();
    user.resetFailedAttempts();
    
    await user.save();
    console.log(' User account activated:', user._id);
    
    // Send welcome email
    sendWelcomeEmail(user).catch(err => console.error('Email error:', err));
    
    // Log the user in after successful verification to establish session
    req.login(user, (err) => {
      if (err) {
        console.error(' Error logging in post-verification:', err);
        return res.status(500).json({
          success: false,
          message: 'Verified, but failed to start session. Please log in.'
        });
      }

      return res.json({
        success: true,
        message: 'Email verified successfully! Redirecting to profile...',
        redirectTo: '/profile',
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          fullName: user.fullName,
          isEmailVerified: user.isEmailVerified
        }
      });
    });
    
  } catch (error) {
    console.error(' OTP verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP. Please try again.'
    });
  }
});

// STEP 3: Resend OTP
router.post('/resend-registration-otp', registrationOTPLimiter, async (req, res) => {
  console.log(' Resend OTP request');
  
  try {
    const { email } = req.body;
    
    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Valid email is required'
      });
    }
    
    const normalizedEmail = validator.normalizeEmail(email);
    const user = await User.findOne({ 
      email: normalizedEmail,
      registrationStatus: 'pending_verification'
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No pending registration found. Please register again.'
      });
    }
    
    // Generate new OTP
    const otp = user.generateVerificationOTP();
    await user.save();
    
    console.log(' Sending new OTP to:', normalizedEmail);
    await sendVerificationOTPEmail(user, otp);
    
    res.json({
      success: true,
      message: 'New verification OTP sent to your email',
      email: normalizedEmail
    });
    
  } catch (error) {
    console.error(' Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend OTP. Please try again.'
    });
  }
});

// ========== MANUAL LOGIN ==========
router.post('/login', authLimiter, validateLoginInput, async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body;
    
    const normalizedEmail = validator.normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail })
      .select('+password +failedLoginAttempts +accountLockedUntil');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Check account lock
    if (user.isAccountLocked()) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked. Try again later.'
      });
    }
    
    if (user.accountType === 'google') {
      return res.status(401).json({
        success: false,
        message: 'Please use Google to sign in with this account',
        accountType: 'google'
      });
    }
    
    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in.',
        isEmailVerified: false,
        email: user.email
      });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.incrementFailedAttempts();
      await user.save();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    // Successful login
    user.resetFailedAttempts();
    user.lastLogin = new Date();
    user.lastLoginIp = req.ip;
    await user.save();
    
    // Configure session to persist if "Remember Me" is checked
    if (rememberMe && req.session) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    }
    
    // Log user in
    req.login(user, (err) => {
      if (err) {
        console.error('Login error:', err);
        return next(err);
      }
      
      // Send login alert
      if (user.preferences?.loginAlerts) {
        sendLoginAlertEmail(user, {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          timestamp: new Date()
        }).catch(console.error);
      }
      
      // Remove the problematic redirect
      // res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile?login=success`);
      
      // Only send JSON response
      return res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          fullName: user.fullName,
          profilePicture: user.profilePicture?.url,
          accountType: user.accountType,
          isEmailVerified: user.isEmailVerified,
          preferences: user.preferences
        }
      });
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed due to server error. Please try again.'
    });
  }
});

// ========== FORGOT PASSWORD ==========
router.post('/forgot-password', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !validator.isEmail(email) || email.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Valid email is required'
      });
    }
    
    const normalizedEmail = validator.normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });
    
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account exists, you will receive a password reset OTP.'
      });
    }
    
    if (user.accountType === 'google') {
      return res.status(400).json({
        success: false,
        message: 'This account uses Google login. Please sign in with Google.',
        accountType: 'google'
      });
    }
    
    if (!user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Please verify your email first before resetting password.',
        isEmailVerified: false
      });
    }
    
    const otp = user.generateResetOTP();
    await user.save();
    
    await sendPasswordResetOTPEmail(user, otp);
    
    res.json({
      success: true,
      message: 'Password reset OTP sent to your email'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please try again.'
    });
  }
});

// ========== VERIFY RESET OTP ==========
router.post('/verify-reset-otp', otpVerifyLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !validator.isEmail(email) || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Valid email and OTP are required'
      });
    }
    
    const normalizedEmail = validator.normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail })
      .select('+resetPasswordOTP +resetPasswordOTPExpires');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const isValidOTP = user.verifyResetOTP(otp);
    
    if (!isValidOTP) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }
    
    const frontendToken = crypto.randomBytes(32).toString('hex');
    
    res.json({
      success: true,
      message: 'OTP verified successfully',
      resetToken: frontendToken,
      expiresIn: 10 * 60 * 1000
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
});

// ========== RESET PASSWORD ==========
router.post('/reset-password', async (req, res) => {
  try {
    const { email, resetToken, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }
    
    const normalizedEmail = validator.normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail })
      .select('+resetPasswordOTP +resetPasswordOTPExpires');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (!user.resetPasswordOTP || !user.resetPasswordOTPExpires) {
      return res.status(400).json({
        success: false,
        message: 'No active OTP found. Please request a new one.'
      });
    }
    
    if (user.resetPasswordOTPExpires < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.'
      });
    }
    
    const isSamePassword = await user.comparePassword(password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password cannot be the same as old password'
      });
    }
    
    user.password = password;
    user.clearTokens();
    user.resetFailedAttempts();
    user.lastPasswordChange = new Date();
    
    await user.save();
    
    await sendPasswordChangedEmail(user);
    
    res.json({
      success: true,
      message: 'Password reset successful! You can now log in with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password reset failed. Please try again.'
    });
  }
});

// ========== UPDATE PROFILE ==========
router.put('/update-profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { profileImage, firstName, lastName } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID not found' 
      });
    }

    const updateData = {};
    
    if (profileImage) {
      if (!profileImage.startsWith('http')) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid image URL' 
        });
      }
      updateData['profilePicture.url'] = profileImage;
      updateData['profilePicture.uploadedAt'] = new Date();
    }
    
    if (firstName) {
      if (firstName.trim().length < 2) {
        return res.status(400).json({ 
          success: false, 
          error: 'First name must be at least 2 characters' 
        });
      }
      updateData.firstName = validator.escape(firstName.trim());
    }
    
    if (lastName) {
      if (lastName.trim().length < 2) {
        return res.status(400).json({ 
          success: false, 
          error: 'Last name must be at least 2 characters' 
        });
      }
      updateData.lastName = validator.escape(lastName.trim());
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No data provided for update' 
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Update session
    req.user.profilePicture = user.profilePicture;
    req.user.firstName = user.firstName;
    req.user.lastName = user.lastName;

    return res.json({
      success: true,
      user: {
        _id: user._id,
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
        accountType: user.accountType,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt
      },
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========== GET CURRENT USER (Renamed from /user to /me) ==========
router.get('/me', authMiddleware, (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        _id: req.user._id,
        id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        fullName: req.user.fullName,
        profilePicture: req.user.profilePicture,
        accountType: req.user.accountType,
        isEmailVerified: req.user.isEmailVerified,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user'
    });
  }
});

// ========== GET CURRENT USER (Keep for backward compatibility) ==========
router.get('/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      success: true,
      user: {
        _id: req.user._id,
        id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        fullName: req.user.fullName,
        profilePicture: req.user.profilePicture,
        accountType: req.user.accountType,
        isEmailVerified: req.user.isEmailVerified,
        createdAt: req.user.createdAt
      }
    });
  } else {
    res.json({ 
      success: false, 
      user: null,
      message: 'Not authenticated'
    });
  }
});

// ========== LOGOUT ==========
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
      res.clearCookie('connect.sid', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
      });
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    });
  });
});

// ========== ACCOUNT STATUS CHECK ==========
router.get('/check-account/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Valid email is required'
      });
    }
    
    const normalizedEmail = validator.normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });
    
    if (!user) {
      return res.json({
        success: true,
        exists: false,
        message: 'Account not found'
      });
    }
    
    res.json({
      success: true,
      exists: true,
      accountType: user.accountType,
      isEmailVerified: user.isEmailVerified,
      isLocked: user.isAccountLocked(),
      registrationStatus: user.registrationStatus
    });
  } catch (error) {
    console.error('Check account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check account status'
    });
  }
});

export default router;