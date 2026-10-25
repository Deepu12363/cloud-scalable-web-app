import Device from '../models/Device.js';
import { verifyDeviceSecret } from '../utils/deviceCredentials.js';

const authenticateDevice = async (req, res, next) => {
  const deviceId = req.get('X-Device-ID');
  const secret = req.get('X-Device-Secret');

  if (!deviceId || !secret) {
    return res.status(401).json({ message: 'Device credentials are required' });
  }

  try {
    const device = await Device.findOne({ deviceId }).select('+deviceSecretHash');

    if (!device || !(await verifyDeviceSecret(secret, device.deviceSecretHash))) {
      return res.status(401).json({ message: 'Invalid device credentials' });
    }

    if (req.body?.deviceId !== device.deviceId) {
      return res.status(403).json({ message: 'Device may only submit its own telemetry' });
    }

    req.device = device;
    return next();
  } catch (error) {
    console.error('Device authentication failed');
    return res.status(500).json({ message: 'Unable to authenticate device' });
  }
};

export default authenticateDevice;
