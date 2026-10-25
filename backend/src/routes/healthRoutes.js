import { Router } from 'express';
import os from 'node:os';
import { getInfrastructureStatus } from '../controllers/infrastructureController.js';
import protect from '../middleware/authMiddleware.js';

const router = Router();

router.get('/health/infrastructure', protect, getInfrastructureStatus);

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is running',
    instance: process.env.INSTANCE_ID || 'backend-local'
  });
});

router.get('/instance', (req, res) => {
  res.json({
    instance: process.env.INSTANCE_ID || 'backend-local',
    hostname: os.hostname()
  });
});

export default router;