import Device from '../models/Device.js';
import Telemetry from '../models/Telemetry.js';

const deviceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const minTemperatureC = Number(process.env.MIN_TEMPERATURE_C ?? -40);
const maxTemperatureC = Number(process.env.MAX_TEMPERATURE_C ?? 80);
const minHumidityPercent = Number(process.env.MIN_HUMIDITY_PERCENT ?? 0);
const maxHumidityPercent = Number(process.env.MAX_HUMIDITY_PERCENT ?? 100);

if (
  !Number.isFinite(minTemperatureC) ||
  !Number.isFinite(maxTemperatureC) ||
  minTemperatureC >= maxTemperatureC ||
  !Number.isFinite(minHumidityPercent) ||
  !Number.isFinite(maxHumidityPercent) ||
  minHumidityPercent < 0 ||
  maxHumidityPercent > 100 ||
  minHumidityPercent >= maxHumidityPercent
) {
  throw new Error('Telemetry measurement bounds are invalid');
}

const validTimestamp = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};

const ownsDevice = async (userId, deviceId) => Device.exists({ deviceId, owner: userId });

export const ingestTelemetry = async (req, res) => {
  const { deviceId, temperatureC, humidityPercent, timestamp, sequence } = req.body ?? {};
  const source = req.body?.source ?? 'device';

  if (
    typeof deviceId !== 'string' ||
    !deviceIdPattern.test(deviceId) ||
    typeof temperatureC !== 'number' ||
    !Number.isFinite(temperatureC) ||
    temperatureC < minTemperatureC ||
    temperatureC > maxTemperatureC ||
    typeof humidityPercent !== 'number' ||
    !Number.isFinite(humidityPercent) ||
    humidityPercent < minHumidityPercent ||
    humidityPercent > maxHumidityPercent ||
    !validTimestamp(timestamp) ||
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    !['device', 'simulated'].includes(source)
  ) {
    return res.status(400).json({
      message: `Invalid telemetry. Temperature must be ${minTemperatureC} to ${maxTemperatureC} C, humidity ${minHumidityPercent} to ${maxHumidityPercent} percent, timestamp must be ISO UTC, and sequence must be a non-negative integer.`
    });
  }

  try {
    if (req.device.lastSequence === undefined) {
      const previousReading = await Telemetry.findOne({ deviceId })
        .sort({ sequence: -1 })
        .select('sequence');

      if (previousReading && sequence <= previousReading.sequence) {
        return res.status(409).json({ message: 'Telemetry sequence must be greater than the last accepted sequence' });
      }
    }

    const sequenceReservation = await Device.updateOne(
      {
        _id: req.device._id,
        $or: [
          { lastSequence: { $lt: sequence } },
          { lastSequence: { $exists: false } }
        ]
      },
      {
        $set: { lastSequence: sequence },
        $max: { lastSeenAt: new Date(timestamp) }
      }
    );

    if (sequenceReservation.modifiedCount !== 1) {
      return res.status(409).json({ message: 'Telemetry sequence must be greater than the last accepted sequence' });
    }

    await Telemetry.create({
      deviceId,
      temperatureC,
      humidityPercent,
      source,
      timestamp: new Date(timestamp),
      receivedAt: new Date(),
      sequence
    });

    return res.status(201).json({ message: 'Telemetry accepted', deviceId, sequence });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Telemetry sequence has already been submitted' });
    }

    console.error('Telemetry ingestion failed');
    return res.status(500).json({ message: 'Unable to store telemetry' });
  }
};

export const latestTelemetry = async (req, res) => {
  const { deviceId } = req.params;

  if (!deviceIdPattern.test(deviceId)) {
    return res.status(400).json({ message: 'Invalid device ID' });
  }

  try {
    if (!(await ownsDevice(req.user._id, deviceId))) {
      return res.status(404).json({ message: 'Device not found' });
    }

    const reading = await Telemetry.findOne({ deviceId }).sort({ timestamp: -1, _id: -1 });

    if (!reading) {
      return res.status(404).json({ message: 'No telemetry found for this device' });
    }

    return res.json({ reading });
  } catch (error) {
    console.error('Latest telemetry lookup failed');
    return res.status(500).json({ message: 'Unable to retrieve telemetry' });
  }
};

export const telemetryHistory = async (req, res) => {
  const { deviceId } = req.params;
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  const page = req.query.page === undefined ? 1 : Number(req.query.page);

  if (
    !deviceIdPattern.test(deviceId) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(page) ||
    page < 1
  ) {
    return res.status(400).json({ message: 'Device ID, page, or limit is invalid (limit must be 1 to 100)' });
  }

  try {
    if (!(await ownsDevice(req.user._id, deviceId))) {
      return res.status(404).json({ message: 'Device not found' });
    }

    const [readings, total] = await Promise.all([
      Telemetry.find({ deviceId })
        .sort({ timestamp: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Telemetry.countDocuments({ deviceId })
    ]);

    return res.json({
      readings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Telemetry history lookup failed');
    return res.status(500).json({ message: 'Unable to retrieve telemetry history' });
  }
};
