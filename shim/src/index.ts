import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import multer from 'multer';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './services/logger';
import certificatesRouter from './routes/certificates';
import authRouter from './routes/auth';

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Create upload directory
const uploadDir = process.env.CERT_STORAGE_DIR || path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const upload = multer({ 
  dest: uploadDir,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(p12|pfx)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only .p12 or .pfx files are allowed'));
    }
  }
});

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
  credentials: true
}));

app.use(bodyParser.json({ limit: process.env.MAX_UPLOAD_SIZE || '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: process.env.MAX_UPLOAD_SIZE || '5mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/certificates', upload.single('certificate'), certificatesRouter);
app.use('/api/auth', authRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Gematik Authenticator Shim',
    version: '1.0.0',
    description: 'Non-interactive authentication service for Gematik SMB-C authentication',
    endpoints: {
      health: 'GET /health',
      certificates: {
        upload: 'POST /api/certificates/upload',
        list: 'GET /api/certificates',
        get: 'GET /api/certificates/:id',
        delete: 'DELETE /api/certificates/:id'
      },
      auth: {
        authenticate: 'POST /api/auth/authenticate',
        challenge: 'POST /api/auth/challenge',
        sign: 'POST /api/auth/sign'
      }
    }
  });
});

// OAuth callback endpoint (for redirects)
app.get('/callback', (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  
  if (error) {
    logger.error('OAuth callback error:', error);
    return res.status(400).json({ error, state });
  }
  
  logger.info('OAuth callback received', { code: code ? 'present' : 'missing', state });
  
  res.json({
    message: 'Authorization callback received',
    code,
    state
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Application error:', err);
  
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const server = app.listen(PORT, HOST, () => {
  logger.info(`Gematik Authenticator Shim started on ${HOST}:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Upload directory: ${uploadDir}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
