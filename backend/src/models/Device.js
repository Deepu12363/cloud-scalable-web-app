import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      match: /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    location: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ''
    },
    deviceType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 40,
      default: 'esp32'
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    deviceSecretHash: {
      type: String,
      required: true,
      select: false
    },
    lastSeenAt: {
      type: Date,
      default: null
    },
    lastSequence: {
      type: Number,
      min: 0,
      validate: Number.isSafeInteger
    }
  },
  { timestamps: true }
);

const Device = mongoose.model('Device', deviceSchema);

export default Device;
