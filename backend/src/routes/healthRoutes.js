import { Router } from 'express';
import os from 'node:os';

const router = Router();

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