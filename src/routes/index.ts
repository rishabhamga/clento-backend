import { Router } from 'express';
import userRoutes from './userRoutes';
import webhookRoutes from './webhookRoutes';
import organizationRoutes from './organizationRoutes';
import accountRoutes from './accountRoutes';
import leadListRoutes from './leadListRoutes';

const router = Router();

// Register all routes
router.use('/users', userRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/organizations', organizationRoutes);
router.use('/accounts', accountRoutes);
router.use('/lead-lists', leadListRoutes);

// Add more routes here as needed

export default router;