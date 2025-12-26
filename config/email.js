import nodemailer from 'nodemailer';

console.log(' Email service initializing...');

// Create transporter with Brevo SMTP configuration
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.BREVO_SMTP_KEY
  },
  tls: {
    rejectUnauthorized: true
  }
});
// Test transporter connection
transporter.verify((error) => {
  if (error) {
    console.error(' Email connection failed:', error.message);
    console.log(' Please check your EMAIL_USER and BREVO_SMTP_KEY in .env file');
  } else {
    console.log(' Email server connected successfully (Brevo SMTP)');
  }
});

// Generic email sender
const sendEmail = async (to, subject, html, text = '') => {
  try {
    const mailOptions = {
      from: `"SHOECREATIFY" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      ...(text && { text })
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(` Email sent to ${to} (Message ID: ${info.messageId})`);
    return { success: true, info };
  } catch (error) {
    console.error(` Failed to send email to ${to}:`, error.message);
    // Don't throw error - just log and continue
    return { success: false, error: error.message };
  }
};

// Send OTP email for email verification during registration
export const sendVerificationOTPEmail = async (user, otp) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email - SHOECREATIFY</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">SHOECREATIFY</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Custom Shoe Design Studio</p>
      </div>
      
      <div style="padding: 30px; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;">
        <h2 style="color: #1f2937; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px;">
          Verify Your Email Address
        </h2>
        
        <p style="color: #4b5563; margin-bottom: 15px; font-size: 16px;">
          Hello <strong style="color: #1f2937;">${user.firstName}</strong>,
        </p>
        
        <p style="color: #4b5563; margin-bottom: 25px; font-size: 16px;">
          Welcome to SHOECREATIFY! To complete your registration and start creating amazing shoe designs, 
          please verify your email address using the OTP below:
        </p>
        
        <div style="background: #f8fafc; padding: 25px; border-radius: 12px; text-align: center; margin: 30px 0; border: 2px solid #e2e8f0;">
          <p style="color: #64748b; margin: 0 0 15px 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">
            Verification Code
          </p>
          <div style="font-family: 'Courier New', monospace; font-size: 40px; font-weight: bold; color: #8b5cf6; letter-spacing: 12px; margin: 10px 0; text-align: center;">
            ${otp}
          </div>
          <p style="color: #94a3b8; margin: 15px 0 0 0; font-size: 14px;">
            Valid for 10 minutes
          </p>
        </div>
        
        <div style="background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin: 30px 0; border-radius: 6px;">
          <p style="color: #0369a1; margin: 0 0 10px 0; font-size: 14px; font-weight: 500;">
            🎨 Start Your Creative Journey:
          </p>
          <ul style="color: #0369a1; margin: 10px 0 0 20px; padding: 0; font-size: 14px;">
            <li>Design custom shoes with our advanced editor</li>
            <li>Choose from premium shoe models</li>
            <li>Save and share your unique designs</li>
            <li>Join our creative community</li>
          </ul>
        </div>
        
        <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; margin: 30px 0; border-radius: 6px;">
          <p style="color: #92400e; margin: 0 0 10px 0; font-size: 14px; font-weight: 500;">
            ⚠️ Security Note:
          </p>
          <p style="color: #92400e; margin: 0; font-size: 14px;">
            This OTP is for verifying your email address. Never share it with anyone. 
            SHOECREATIFY will never ask for your verification code.
          </p>
        </div>
        
        <div style="text-align: center; margin: 40px 0 30px 0;">
          <p style="color: #6b7280; font-size: 14px; font-style: italic;">
            "Design shoes that tell your story"
          </p>
        </div>
        
        <div style="border-top: 1px solid #e5e7eb; margin-top: 40px; padding-top: 20px;">
          <p style="color: #6b7280; font-size: 12px; margin: 0; text-align: center;">
            SHOECREATIFY • Custom Shoe Design Studio<br>
            This is an automated message, please do not reply.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `SHOECREATIFY Email Verification\n\nHello ${user.firstName},\n\nWelcome to SHOECREATIFY! To complete your registration, please verify your email address.\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nEnter this code on the verification page to activate your account and start creating amazing shoe designs.\n\nIf you didn't create an account with SHOECREATIFY, please ignore this email.\n\nSHOECREATIFY Team`;

  return sendEmail(
    user.email,
    `🔐 SHOECREATIFY - Verify Your Email: ${otp}`,
    html,
    text
  );
};

// Send OTP email for password reset
export const sendPasswordResetOTPEmail = async (user, otp) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset - SHOECREATIFY</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">SHOECREATIFY</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Custom Shoe Design Studio</p>
      </div>
      
      <div style="padding: 30px; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;">
        <h2 style="color: #1f2937; margin-bottom: 20px; font-size: 24px; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px;">
          Password Reset Verification
        </h2>
        
        <p style="color: #4b5563; margin-bottom: 15px; font-size: 16px;">
          Hello <strong style="color: #1f2937;">${user.firstName || user.displayName || 'User'}</strong>,
        </p>
        
        <p style="color: #4b5563; margin-bottom: 25px; font-size: 16px;">
          You requested to reset your password for your SHOECREATIFY account. 
          Use the verification code below to complete the process:
        </p>
        
        <div style="background: #f8fafc; padding: 25px; border-radius: 12px; text-align: center; margin: 30px 0; border: 2px solid #e2e8f0;">
          <p style="color: #64748b; margin: 0 0 15px 0; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">
            One-Time Password
          </p>
          <div style="font-family: 'Courier New', monospace; font-size: 40px; font-weight: bold; color: #4F46E5; letter-spacing: 12px; margin: 10px 0; text-align: center;">
            ${otp}
          </div>
          <p style="color: #94a3b8; margin: 15px 0 0 0; font-size: 14px;">
            Valid for 10 minutes
          </p>
        </div>
        
        <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; margin: 30px 0; border-radius: 6px;">
          <p style="color: #92400e; margin: 0 0 10px 0; font-size: 14px; font-weight: 500;">
            ⚠️ Security Guidelines:
          </p>
          <ul style="color: #92400e; margin: 10px 0 0 20px; padding: 0; font-size: 14px;">
            <li>Never share this OTP with anyone</li>
            <li>SHOECREATIFY will never ask for your OTP</li>
            <li>This code will expire in 10 minutes</li>
            <li>If you didn't request this, please ignore this email</li>
          </ul>
        </div>
        
        <div style="border-top: 1px solid #e5e7eb; margin-top: 40px; padding-top: 20px;">
          <p style="color: #6b7280; font-size: 12px; margin: 0; text-align: center;">
            SHOECREATIFY • Custom Shoe Design Studio<br>
            This is an automated message, please do not reply.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `SHOECREATIFY Password Reset\n\nHello ${user.firstName || 'User'},\n\nYour password reset OTP is: ${otp}\n\nThis OTP expires in 10 minutes.\n\nIf you didn't request this password reset, please ignore this email.\n\nSHOECREATIFY Team`;

  return sendEmail(
    user.email,
    `SHOECREATIFY - Password Reset Code: ${otp}`,
    html,
    text
  );
};

// Send password changed confirmation email
export const sendPasswordChangedEmail = async (user) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Changed - SHOECREATIFY</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">SHOECREATIFY</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Custom Shoe Design Studio</p>
      </div>
      
      <div style="padding: 30px; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); width: 80px; height: 80px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 40px; color: white; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);">
            ✓
          </div>
        </div>
        
        <h2 style="color: #1f2937; margin-bottom: 20px; font-size: 24px; text-align: center;">
          Password Changed Successfully
        </h2>
        
        <p style="color: #4b5563; margin-bottom: 15px; font-size: 16px; text-align: center;">
          Hello <strong style="color: #1f2937;">${user.firstName || user.displayName || 'User'}</strong>,
        </p>
        
        <p style="color: #4b5563; margin-bottom: 25px; font-size: 16px; text-align: center;">
          Your SHOECREATIFY account password has been successfully updated.
        </p>
        
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 20px; margin: 30px 0; border-radius: 8px;">
          <p style="color: #065f46; margin: 0 0 10px 0; font-size: 14px; font-weight: 500;">
            ✅ Security Update Details:
          </p>
          <ul style="color: #065f46; margin: 0 0 0 20px; padding: 0; font-size: 14px;">
            <li>Password changed on: ${new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</li>
            <li>Account: ${user.email}</li>
          </ul>
        </div>
        
        <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; margin: 30px 0; border-radius: 6px;">
          <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 500;">
            ⚠️ Important Security Notice:
          </p>
          <p style="color: #92400e; margin: 10px 0 0 0; font-size: 14px;">
            If you did not make this change, please secure your account immediately.
          </p>
        </div>
        
        <div style="text-align: center; margin: 40px 0 30px 0;">
          <p style="color: #6b7280; font-size: 14px;">
            Thank you for using SHOECREATIFY!
          </p>
        </div>
        
        <div style="border-top: 1px solid #e5e7eb; margin-top: 40px; padding-top: 20px;">
          <p style="color: #6b7280; font-size: 12px; margin: 0; text-align: center;">
            SHOECREATIFY • Custom Shoe Design Studio<br>
            This is an automated message, please do not reply.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `SHOECREATIFY Password Changed\n\nHello ${user.firstName || 'User'},\n\nYour password has been successfully changed.\n\nDate: ${new Date().toLocaleString()}\nAccount: ${user.email}\n\nIf you did not make this change, please secure your account immediately.\n\nSHOECREATIFY Team`;

  return sendEmail(
    user.email,
    '✅ SHOECREATIFY - Password Successfully Updated',
    html,
    text
  );
};

// Send welcome email (updated for OTP verification flow)
export const sendWelcomeEmail = async (user) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to SHOECREATIFY</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%); padding: 40px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 32px; font-weight: bold;">Welcome to SHOECREATIFY! 👟</h1>
        <p style="color: rgba(255,255,255,0.95); margin: 10px 0 0 0; font-size: 16px;">Let's create amazing shoe designs together</p>
      </div>
      
      <div style="padding: 30px; background: white; border-radius: 0 0 10px 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%); width: 80px; height: 80px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 40px; color: white; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);">
            ✓
          </div>
        </div>
        
        <h2 style="color: #1f2937; margin-bottom: 20px; font-size: 24px; text-align: center;">
          Account Successfully Verified!
        </h2>
        
        <p style="color: #4b5563; margin-bottom: 15px; font-size: 16px; text-align: center;">
          Hello <strong style="color: #1f2937; font-size: 18px;">${user.firstName}</strong>,
        </p>
        
        <p style="color: #4b5563; margin-bottom: 25px; font-size: 16px; text-align: center;">
          Congratulations! Your SHOECREATIFY account has been successfully verified. 
          You can now log in and start creating unique shoe designs that reflect your style and personality.
        </p>
        
        <div style="background: #f0f9ff; border: 2px dashed #0ea5e9; padding: 25px; margin: 30px 0; border-radius: 10px; text-align: center;">
          <p style="color: #0369a1; margin: 0; font-size: 16px; font-weight: 500;">
            Ready to start designing? 
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="color: #8b5cf6; text-decoration: none; font-weight: bold;">Login Now →</a>
            <p style="color: #64748b; margin: 10px 0 0 0; font-size: 14px;">
                      Project is not live so login link may not work.
            </p>
          </p>
        </div>
        
        <div style="border-top: 1px solid #e5e7eb; margin-top: 40px; padding-top: 30px;">
          <p style="color: #1f2937; font-size: 18px; font-weight: bold; margin-bottom: 15px;">
            What you can do with SHOECREATIFY:
          </p>
          <ul style="color: #4b5563; margin: 0 0 0 20px; padding: 0; font-size: 15px;">
            <li>🎨 Design custom shoes with our intuitive editor</li>
            <li>👟 Choose from various shoe models and styles</li>
            <li>🌈 Apply colors, patterns, and textures</li>
            <li>📦 Save and share your designs with the community</li>
            <li>💡 Get inspiration from other creators</li>
          </ul>
        </div>
        
        <div style="background: #fef3c7; border-radius: 8px; padding: 20px; margin: 30px 0;">
          <p style="color: #92400e; margin: 0; font-size: 14px; font-weight: 500;">
            💡 Pro Tip:
          </p>
          <p style="color: #92400e; margin: 10px 0 0 0; font-size: 14px;">
            Start with our template gallery for inspiration, then customize to make it your own!
          </p>
        </div>
        
        <div style="border-top: 1px solid #e5e7eb; margin-top: 40px; padding-top: 20px;">
          <p style="color: #6b7280; font-size: 12px; margin: 0; text-align: center;">
            SHOECREATIFY • Unleash Your Creativity<br>
            This is an automated message, please do not reply.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `Welcome to SHOECREATIFY!\n\nHello ${user.firstName},\n\nCongratulations! Your SHOECREATIFY account has been successfully verified.\n\nYou can now log in and start creating amazing shoe designs:\n\n${process.env.FRONTEND_URL || 'http://localhost:5173'}/login\n\nStart creating today:\n• Design custom shoes with our advanced editor\n• Choose from premium shoe models\n• Apply colors, patterns, and textures\n• Save and share your unique designs\n\nWelcome to our creative community!\n\nSHOECREATIFY Team`;

  return sendEmail(
    user.email,
    '🎉 SHOECREATIFY - Account Verified! Start Creating',
    html,
    text
  );
};

// Optional login alert (simplified)
export const sendLoginAlertEmail = async (user, loginInfo) => {
  // Optional feature - you can implement this later
  console.log(` Login alert for ${user.email} from IP: ${loginInfo.ip}`);
  return { success: true };
};