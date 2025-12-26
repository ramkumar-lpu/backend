import express from 'express';
import { sendEmail as sendEmailAPI } from '../config/email.js';
import { body, validationResult } from 'express-validator'; 
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Get contact route status
router.get('/', async (req, res) => {
  res.json({ success: true, message: 'Contact API is working', endpoint: '/api/contact/send' });
});

// Rate limiting to prevent abuse
const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: 'Too many contact attempts from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Input validation using express-validator (removed recaptchaToken)
const contactValidationRules = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
        .matches(/^[a-zA-Z\s\-'.]+$/).withMessage('Name can only contain letters, spaces, hyphens, apostrophes, and periods'),
    
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please provide a valid email address')
        .normalizeEmail(),
    
    body('subject')
        .trim()
        .notEmpty().withMessage('Subject is required')
        .isLength({ min: 5, max: 200 }).withMessage('Subject must be between 5 and 200 characters'),
    
    body('message')
        .trim()
        .notEmpty().withMessage('Message is required')
        .isLength({ min: 10, max: 5000 }).withMessage('Message must be between 10 and 5000 characters'),
    
    body('contactType')
        .optional()
        .isIn(['general', 'support', 'business', 'feedback', 'technical'])
        .withMessage('Invalid contact type')
        .default('general'),
    
    body('toEmail')
        .optional()
        .isEmail().withMessage('Invalid recipient email address'),
    
    body('replyTo')
        .optional()
        .isEmail().withMessage('Invalid reply-to email address')
];

// Custom sanitization middleware
const sanitizeInput = (req, res, next) => {
    if (req.body.name) req.body.name = req.body.name.trim();
    if (req.body.subject) req.body.subject = req.body.subject.trim();
    if (req.body.message) req.body.message = req.body.message.trim();
    if (req.body.email) req.body.email = req.body.email.trim().toLowerCase();
    next();
};

// Brevo API is used; validate env variables
const validateEmailConfig = () => {
    const requiredEnvVars = ['EMAIL_USER'];
    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
};

// Helper function to sanitize HTML
const sanitizeHTML = (input) => {
    if (typeof input !== 'string') return input;

    // Basic HTML entity escaping
    const htmlEscapes = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;'
    };

    return input.replace(/[&<>"'/]/g, char => htmlEscapes[char] || char);
};

// Helper function to format contact type
const formatContactType = (type) => {
    const types = {
        'general': 'General Inquiry',
        'support': 'Customer Support',
        'business': 'Business Partnership',
        'feedback': 'Feedback',
        'technical': 'Technical Issue'
    };
    return types[type] || 'General Inquiry';
};

// Format validation errors
const formatValidationErrors = (errors) => {
    return errors.array().map(error => ({
        field: error.path,
        message: error.msg
    }));
};

// Timestamp helper functions
const formatTimestamp = (date = new Date()) => {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZoneName: 'short'
    });
};

const formatDateISO = (date = new Date()) => {
    return date.toISOString();
};

const formatDateForEmail = (date = new Date()) => {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

router.post('/send', contactLimiter, sanitizeInput, contactValidationRules, async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: formatValidationErrors(errors)
            });
        }

        const { name, email, subject, message, contactType, toEmail, replyTo } = req.body;

        // Sanitize inputs for HTML content
        const sanitizedName = sanitizeHTML(name);
        const sanitizedSubject = sanitizeHTML(subject);
        const sanitizedMessage = sanitizeHTML(message);
        const formattedContactType = formatContactType(contactType);

        // Ensure config is valid
        validateEmailConfig();

        // Create the HTML template without the info reference in the footer
        const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Contact Message</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .field { margin-bottom: 15px; }
        .field-label { font-weight: bold; color: #4F46E5; }
        .message-box { background-color: white; padding: 20px; border-radius: 5px; border-left: 4px solid #4F46E5; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
        .timestamp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; margin-bottom: 20px; background: white; padding: 15px; border-radius: 5px; border: 1px solid #e5e7eb; }
        .timestamp-item { margin-bottom: 5px; }
        .timestamp-label { font-weight: 600; color: #6b7280; font-size: 0.9em; }
        .timestamp-value { color: #111827; }
        .utc-badge { background-color: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; font-family: monospace; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>New Contact Message</h1>
            <p>ShoeCreatify Contact Form</p>
        </div>
        <div class="content">
            <div class="timestamp-grid">
                <div class="timestamp-item">
                    <div class="timestamp-label">Local Date & Time</div>
                    <div class="timestamp-value">${formatDateForEmail()}</div>
                </div>
                <div class="timestamp-item">
                    <div class="timestamp-label">Full Timestamp</div>
                    <div class="timestamp-value">${formatTimestamp()}</div>
                </div>
                <div class="timestamp-item">
                    <div class="timestamp-label">UTC Reference</div>
                    <div class="utc-badge">${formatDateISO()}</div>
                </div>
            </div>
            
            <div class="field">
                <span class="field-label">Name:</span> ${sanitizedName}
            </div>
            <div class="field">
                <span class="field-label">Email:</span> <a href="mailto:${email}">${email}</a>
            </div>
            <div class="field">
                <span class="field-label">Inquiry Type:</span> ${formattedContactType}
            </div>
            
            <div class="message-box">
                <h3>Message:</h3>
                <p>${sanitizedMessage.replace(/\n/g, '<br>')}</p>
            </div>
            
            <div class="field">
                <span class="field-label">IP Address:</span> ${req.ip}
            </div>
            <div class="field">
                <span class="field-label">User Agent:</span> ${req.get('User-Agent') || 'Not available'}
            </div>
            
            <div class="footer">
                <p>📧 This message was generated by ShoeCreatify Contact Form System</p>
                <p>🕒 Server processed at: ${formatDateISO()}</p>
                <p>⚠️ This is an automated message. Do not reply to this email address.</p>
            </div>
        </div>
    </div>
</body>
</html>
        `.trim();

        // Prepare email options
        const mailOptions = {
            from: {
                name: process.env.EMAIL_FROM_NAME || 'ShoeCreatify Contact Form',
                address: process.env.EMAIL_USER
            },
            to: toEmail || process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
            replyTo: replyTo || email,
            subject: `[ShoeCreatify Contact] ${formattedContactType}: ${sanitizedSubject}`,
            text: `
CONTACT FORM SUBMISSION
=======================
Timestamp: ${formatTimestamp()}
Local Time: ${formatDateForEmail()}
UTC Reference: ${formatDateISO()}

Name: ${sanitizedName}
Email: ${email}
Inquiry Type: ${formattedContactType}

MESSAGE:
${sanitizedMessage}

---
This message was sent via the ShoeCreatify contact form.
Generated at: ${formatDateISO()}
            `.trim(),
            html: htmlTemplate,
            // Add headers for better email client compatibility
            headers: {
                'X-Priority': '1',
                'X-Mailer': 'ShoeCreatify Contact Form',
                'X-Contact-Form': 'true',
                'X-IP-Address': req.ip
            }
        };

        // Send email via Brevo API
        const info = await sendEmailAPI(
            mailOptions.to,
            mailOptions.subject,
            mailOptions.html,
            mailOptions.text,
            { replyTo: mailOptions.replyTo, senderName: mailOptions.from?.name }
        );

        // Log result
        console.log('Email send result:', {
            success: info.success,
            info: info.info,
            timestamp: formatDateISO(),
            to: mailOptions.to,
            subject: mailOptions.subject,
            contactType: contactType,
            ip: req.ip
        });

        // Send success response
        if (info.success) {
            res.json({
                success: true,
                message: 'Email sent successfully',
                info: info.info,
                timestamp: formatDateISO()
            });
        } else {
            throw new Error(info.error || 'Email send failed');
        }

    } catch (error) {
        console.error('Error sending email:', {
            error: error.message,
            stack: error.stack,
            timestamp: formatDateISO(),
            ip: req.ip,
            endpoint: '/contact/send'
        });

        // Determine appropriate status code
        let statusCode = 500;
        let userMessage = 'Failed to send email. Please try again later.';

        if (error.message.includes('timeout')) {
            statusCode = 504;
            userMessage = 'Email sending timed out. Please try again.';
        } else if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
            statusCode = 503;
            userMessage = 'Email service configuration error.';
        } else if (error.message.includes('temporarily unavailable')) {
            statusCode = 503;
            userMessage = 'Email service is temporarily unavailable.';
        }

        res.status(statusCode).json({
            success: false,
            message: userMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            timestamp: formatDateISO()
        });
    }
});

// Health check endpoint
router.get('/health', async (req, res) => {
    try {
        const hasApiKey = !!(process.env.BREVO_API_KEY || process.env.BREVO_SMTP_KEY);
        if (hasApiKey && process.env.EMAIL_USER) {
            res.json({
                status: 'healthy',
                service: 'email-api',
                timestamp: formatDateISO(),
                serverTime: formatTimestamp(),
                uptime: process.uptime()
            });
        } else {
            res.status(503).json({
                status: 'unavailable',
                service: 'email-api',
                timestamp: formatDateISO(),
                serverTime: formatTimestamp()
            });
        }
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            service: 'email-api',
            error: error.message,
            timestamp: formatDateISO(),
            serverTime: formatTimestamp()
        });
    }
});

export default router;