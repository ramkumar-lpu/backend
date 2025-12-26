

//idhar wala code pahle ka working code me razorpay payment gateway integration krna hai

import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cors from 'cors';
import passport from './config/passport.js';
import authRoutes from './routes/auth.js';
import designRoutes from './routes/designRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import { suggestionRouter } from './routes/suggestion.route.js';
import profileRoutes from './routes/profile.js'; 

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/shoecreatify')
  .then(() => console.log(' MongoDB Connected'))
  .catch(err => {
    console.error(' MongoDB Connection Error:', err.message);
    process.exit(1);
  });

// Middleware - INCREASED PAYLOAD LIMIT TO FIX PayloadTooLargeError
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/shoecreatify',
    ttl: 24 * 60 * 60
  }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// ========== MOUNT ROUTES ==========
app.use('/api/auth', authRoutes);
app.use('/api/designs', designRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/shoe', suggestionRouter);
app.use('/api/profile', profileRoutes); 

// Health check route
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    time: new Date().toISOString(),
    authRoutes: true
  });
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Test endpoint works!' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  // Handle PayloadTooLargeError specifically
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ 
      error: 'Payload too large',
      message: 'The request payload exceeds the maximum allowed size'
    });
  }
  
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n Server running on http://localhost:${PORT}`);
  console.log(` Google Auth: http://localhost:${PORT}/api/auth/google`);
  console.log(`\nPress Ctrl+C to stop\n`);
});