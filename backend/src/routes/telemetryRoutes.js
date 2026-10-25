import { Router } from 'express';
import {
  ingestTelemetry,
  latestTelemetry,
  telemetryHistory
} from '../controllers/telemetryController.js';
import protect from '../middleware/authMiddleware.js';
import authenticateDevice from '../middleware/deviceAuthMiddleware.js';

const router = Router();

router.post('/', authenticateDevice, ingestTelemetry);
router.get('/latest/:deviceId', protect, latestTelemetry);
router.get('/history/:deviceId', protect, telemetryHistory);

export default router;
