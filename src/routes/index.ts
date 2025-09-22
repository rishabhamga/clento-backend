import { Router } from 'express';
import { defaultAuth } from '../middleware/auth';
import userRoutes from './userRoutes';
import organizationRoutes from './organizationRoutes';
import accountRoutes from './accountRoutes';
import leadListRoutes from './leadListRoutes';

const router = Router();

// Apply authentication middleware to all routes by default
router.use(defaultAuth);

// Register all routes
router.use('/users', userRoutes);
router.use('/organizations', organizationRoutes);
router.use('/accounts', accountRoutes);
router.use('/lead-lists', leadListRoutes);

// Add more routes here as needed

export default router;