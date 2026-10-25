import { Router } from 'express';
import { listDevices, registerDevice } from '../controllers/deviceController.js';
import protect from '../middleware/authMiddleware.js';

const router = Router();

router.use(protect);
router.post('/', registerDevice);
router.get('/', listDevices);

export default router;
