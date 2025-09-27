import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import env from './config/env';
import logger from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { setupSwagger } from './config/swagger';
import supabase from './config/supabase';
import registerAllRoutes from './utils/registerRoutes';
import morgan from 'morgan';
import './utils/expressExtensions'; // Import express extensions
import path from 'path';
import { ConnectedAccountService } from './services/ConnectedAccountService';
import { TemporalService } from './services/TemporalService';
import { initializeTemporalWorker } from './temporal/worker';

// Create Express application
const app = express();

app.use(morgan("dev"));

// Apply middleware
app.use(helmet());

// Configure CORS based on environment
const corsOptions = {
  origin: env.NODE_ENV === 'development'
    ? (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow all localhost origins in development
        if (!origin || origin.match(/^http:\/\/localhost:\d+$/)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
    : env.CORS_ORIGIN,
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow CSV files
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    }
});

// Apply multer middleware globally
app.use(upload.any());

// Setup Swagger
setupSwagger(app);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// Unipile webhook endpoint (bypassing ClentoAPI authentication issues)
app.post('/api/accounts/webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    
    console.log('=== UNIPILE WEBHOOK RECEIVED (DIRECT) ===', {
      timestamp: new Date().toISOString(),
      status: webhookData.status,
      account_id: webhookData.account_id,
      name: webhookData.name,
      fullPayload: webhookData
    });

    // Validate required fields from Unipile webhook
    if (!webhookData.status || !webhookData.account_id || !webhookData.name) {
      console.error('Invalid webhook payload - missing required fields', { webhookData });
      return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
    }

    // Handle successful account creation (as per Unipile documentation)
    if (webhookData.status === 'CREATION_SUCCESS') {
      console.log('Processing account creation success');
      
      // Use the imported service
      const connectedAccountService = new ConnectedAccountService();
      
      await connectedAccountService.handleAccountConnected({
        unipileAccountId: webhookData.account_id,
        pendingAccountId: webhookData.name, // This is our internal pending account ID
        accountData: webhookData
      });
      
      console.log('Account connection webhook processed successfully', {
        unipileAccountId: webhookData.account_id,
        pendingAccountId: webhookData.name
      });
    } else {
      console.warn('Unhandled webhook status', { 
        status: webhookData.status,
        account_id: webhookData.account_id
      });
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Error processing Unipile webhook', { error, body: req.body });
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

// Auto-register all API routes
const routesPath = path.join(__dirname, 'routes');
registerAllRoutes(app, routesPath);

// Error handling middleware
app.use(errorHandler);

// Initialize database and start server
const startServer = async () => {
  try {
    // Initialize Supabase connection
    await supabase.initSupabase();

    // Initialize Temporal service
    try {
      const temporalService = TemporalService.getInstance();
      await temporalService.initialize();
      logger.info('Temporal service initialized successfully');

      // Initialize Temporal worker (only if enabled)
      await initializeTemporalWorker();
    } catch (temporalError) {
      logger.warn('Failed to initialize Temporal service', { error: temporalError });
      logger.info('Server will continue without Temporal functionality');
    }

    // Start server
    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
      logger.info(`API documentation available at http://localhost:${env.PORT}/api-docs`);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err: Error) => {
      logger.error('Unhandled Rejection:', err);
      // Close server and exit process
      server.close(() => {
        process.exit(1);
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start server when run directly
if (require.main === module) {
  startServer();
}

export default app;