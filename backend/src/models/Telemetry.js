import mongoose from 'mongoose';

const telemetrySchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true
    },
    temperatureC: {
      type: Number,
      required: true,
      min: -100,
      max: 150
    },
    humidityPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    source: {
      type: String,
      enum: ['device', 'simulated'],
      default: 'device'
    },
    timestamp: {
      type: Date,
      required: true
    },
    receivedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    sequence: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger
    }
  },
  { timestamps: true }
);

telemetrySchema.index({ deviceId: 1, sequence: 1 }, { unique: true });
telemetrySchema.index({ deviceId: 1, timestamp: -1, _id: -1 });

const Telemetry = mongoose.model('Telemetry', telemetrySchema);

export default Telemetry;
