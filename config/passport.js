import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';
// Configure Google OAuth Strategy for Passport
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback', 
    scope: ['profile', 'email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log(' Google Profile Received:', profile.id);
      
      // Try find by googleId first 
      let user = await User.findOne({ googleId: profile.id });
      
      if (!user && profile.emails && profile.emails.length) {
        // Try find by email to avoid duplicate accounts
        user = await User.findOne({ email: profile.emails[0].value });
      }
      
      if (!user) {
        // Create new user
        user = await User.create({
          googleId: profile.id,
          displayName: profile.displayName,
          firstName: profile.name?.givenName || '',
          lastName: profile.name?.familyName || '',
          email: profile.emails?.[0]?.value || '',
          image: profile.photos?.[0]?.value || '',
          provider: 'google',
          emails: profile.emails || [],
          photos: profile.photos || []
        });
        
        console.log(' New user created:', user.email);
      } else {
        // Update existing user if needed
        let changed = false;
        
        if (!user.googleId) {
          user.googleId = profile.id;
          changed = true;
        }
        
        if (!user.displayName && profile.displayName) {
          user.displayName = profile.displayName;
          changed = true;
        }
        
        if (!user.image && profile.photos?.[0]?.value) {
          user.image = profile.photos[0].value;
          changed = true;
        }
        
        if (!user.firstName && profile.name?.givenName) {
          user.firstName = profile.name.givenName;
          changed = true;
        }
        
        if (!user.lastName && profile.name?.familyName) {
          user.lastName = profile.name.familyName;
          changed = true;
        }
        
        if (changed) {
          await user.save();
          console.log(' User updated:', user.email);
        } else {
          console.log(' Existing user found:', user.email);
        }
      }
      
      return done(null, user);
    } catch (error) {
      console.error(' Passport Error:', error);
      return done(error, null);
    }
  }
));

// Serialize user to session (store user id)
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;