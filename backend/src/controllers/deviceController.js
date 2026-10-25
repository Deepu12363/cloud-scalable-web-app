import Device from '../models/Device.js';
import { createDeviceSecret } from '../utils/deviceCredentials.js';

const deviceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;

const publicDevice = (device) => ({
  id: device._id,
  deviceId: device.deviceId,
  name: device.name,
  location: device.location,
  deviceType: device.deviceType,
  lastSeenAt: device.lastSeenAt,
  createdAt: device.createdAt,
  updatedAt: device.updatedAt
});

export const registerDevice = async (req, res) => {
  const { deviceId, name, location = '', deviceType = 'esp32' } = req.body ?? {};

  if (
    typeof deviceId !== 'string' ||
    !deviceIdPattern.test(deviceId) ||
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 100 ||
    typeof location !== 'string' ||
    location.length > 100 ||
    typeof deviceType !== 'string' ||
    !/^[a-zA-Z0-9_-]{2,40}$/.test(deviceType)
  ) {
    return res.status(400).json({ message: 'Provide a valid deviceId, name, location, and deviceType' });
  }

  try {
    const { secret, hash } = await createDeviceSecret();
    const device = await Device.create({
      deviceId,
      name: name.trim(),
      location: location.trim(),
      deviceType,
      owner: req.user._id,
      deviceSecretHash: hash
    });

    return res.status(201).json({
      device: publicDevice(device),
      deviceSecret: secret,
      secretNotice: 'Save this secret now. It will not be shown again.'
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Device ID is already registered' });
    }

    console.error('Device registration failed');
    return res.status(500).json({ message: 'Unable to register device' });
  }
};

export const listDevices = async (req, res) => {
  try {
    const devices = await Device.find({ owner: req.user._id })
      .select('-deviceSecretHash')
      .sort({ createdAt: -1 });

    return res.json({ devices: devices.map(publicDevice) });
  } catch (error) {
    console.error('Device listing failed');
    return res.status(500).json({ message: 'Unable to list devices' });
  }
};
