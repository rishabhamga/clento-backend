import cors from 'cors';
import express from 'express';
import 'express-async-errors';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import path from 'path';
import env from './config/env';
import supabase from './config/supabase';
import { setupSwagger } from './config/swagger';
import { errorHandler } from './middleware/errorHandler';
import { TemporalService } from './services/TemporalService';
import { WorkerManager } from './temporal/worker';
import './utils/expressExtensions'; // Import express extensions
import './utils/arrayExtensions'; // Import array extensions globally
import './utils/mapExtensions' // Import map extensions globally
import logger from './utils/logger';
import registerAllRoutes from './utils/registerRoutes';
import { rawBodyCapture } from './middleware/validation';

// Create Express application
const app = express();

app.use(morgan('dev'));

// Apply middleware
app.use(helmet());

// Configure CORS based on environment
const corsOptions = {
    origin:
        env.NODE_ENV === 'development'
            ? (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
                  // Allow all localhost origins and app.clento.ai in development
                  if (!origin || origin.match(/^http:\/\/localhost:\d+$/) || origin === 'https://app.clento.ai') {
                      callback(null, true);
                  } else {
                      callback(new Error('Not allowed by CORS'));
                  }
              }
            : env.CORS_ORIGIN,
    credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ verify: rawBodyCapture }));
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
    },
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
        let workerManager: WorkerManager | null = null;
        try {
            const temporalService = TemporalService.getInstance();
            await temporalService.initialize();
            logger.info('Temporal service initialized successfully');

            // Start Temporal worker if enabled
            if (env.ENABLE_TEMPORAL_WORKER) {
                workerManager = WorkerManager.getInstance();
                const workerCount = env.TEMPORAL_WORKER_COUNT || 1;

                if (workerCount > 1) {
                    await workerManager.startMultipleWorkers(workerCount);
                } else {
                    await workerManager.startWorker();
                }

                logger.info('✅ Temporal worker(s) started successfully', {
                    workerCount,
                    maxConcurrentCampaigns: 50 * workerCount, // Based on worker config
                });
            } else {
                logger.info('Temporal workers disabled by configuration');
            }

            // Log active campaigns for monitoring
            const stats = await temporalService.getCampaignStats();
            logger.info('Campaign statistics', stats);
        } catch (temporalError) {
            logger.error('Failed to initialize Temporal service', {
                error: temporalError instanceof Error ? temporalError.message : String(temporalError),
                stack: temporalError instanceof Error ? temporalError.stack : undefined,
                name: temporalError instanceof Error ? temporalError.name : undefined,
                cause: temporalError instanceof Error ? temporalError.cause : undefined,
                fullError: temporalError,
            });
            logger.info('Server will continue without Temporal functionality');
        }

        // Start server
        const server = app.listen(env.PORT, () => {
            logger.info(`🚀 Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
            logger.info(`📚 API documentation available at http://localhost:${env.PORT}/api-docs`);

            if (workerManager?.isWorkerRunning()) {
                logger.info('⚡ Temporal workers are running and processing campaigns');
            }
        });

        // Graceful shutdown handler
        const gracefulShutdown = async (signal: string) => {
            logger.info(`${signal} received, starting graceful shutdown...`);

            try {
                // Stop accepting new connections
                server.close(() => {
                    logger.info('HTTP server closed');
                });

                // Shutdown Temporal workers gracefully
                if (workerManager) {
                    await workerManager.shutdown();
                }

                logger.info('✅ Graceful shutdown completed');
                process.exit(0);
            } catch (error) {
                logger.error('Error during graceful shutdown', { error });
                process.exit(1);
            }
        };

        // Handle shutdown signals
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (err: Error) => {
            logger.error('Unhandled Rejection:', err);
            gracefulShutdown('UNHANDLED_REJECTION');
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
