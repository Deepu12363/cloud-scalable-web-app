import request from 'supertest';
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createDeviceSecret, verifyDeviceSecret } from '../src/utils/deviceCredentials.js';

const mockDeviceModel = {
  create: jest.fn(),
  exists: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  updateOne: jest.fn()
};

const mockTelemetryModel = {
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn()
};

const mockUserModel = {
  findById: jest.fn()
};

jest.unstable_mockModule('../src/models/Device.js', () => ({ default: mockDeviceModel }));
jest.unstable_mockModule('../src/models/Telemetry.js', () => ({ default: mockTelemetryModel }));
jest.unstable_mockModule('../src/models/User.js', () => ({ default: mockUserModel }));

process.env.JWT_SECRET = 'iot-test-secret';
process.env.NODE_ENV = 'test';
process.env.MIN_TEMPERATURE_C = '-40';
process.env.MAX_TEMPERATURE_C = '80';
process.env.MIN_HUMIDITY_PERCENT = '0';
process.env.MAX_HUMIDITY_PERCENT = '100';
process.env.BACKEND_HEALTH_URLS = [
  'backend-1=http://backend1:5000/api/health',
  'backend-2=http://backend2:5000/api/health',
  'backend-3=http://backend3:5000/api/health'
].join(',');

const { default: app } = await import('../src/app.js');

const userId = '507f1f77bcf86cd799439011';
const secondUserId = '507f1f77bcf86cd799439012';
const owner = { _id: userId, name: 'Test User', email: 'test@example.com' };
const secondOwner = { _id: secondUserId, name: 'Second User', email: 'second@example.com' };
const token = jwt.sign({ userId }, process.env.JWT_SECRET);
const secondToken = jwt.sign({ userId: secondUserId }, process.env.JWT_SECRET);
const secretPair = await createDeviceSecret();
const device = {
  _id: '507f191e810c19729de860ea',
  deviceId: 'esp32-room-01',
  owner: userId,
  deviceSecretHash: secretPair.hash,
  lastSequence: 124
};
const secondDevice = {
  _id: '507f191e810c19729de860eb',
  deviceId: 'esp32-account-b-01',
  owner: secondUserId,
  deviceSecretHash: secretPair.hash,
  lastSequence: 124
};
const readingBody = {
  deviceId: device.deviceId,
  temperatureC: 28.4,
  humidityPercent: 64.2,
  timestamp: '2026-10-21T06:00:00.000Z',
  sequence: 125
};
const userAuth = { Authorization: `Bearer ${token}` };
const deviceAuth = {
  'X-Device-ID': device.deviceId,
  'X-Device-Secret': secretPair.secret
};

const queryChain = (result) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue(result)
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUserModel.findById.mockResolvedValue(owner);
  mockDeviceModel.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue(device)
  });
  mockDeviceModel.exists.mockResolvedValue({ _id: device._id });
  mockDeviceModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe('IoT device and telemetry API', () => {
  test('keeps the existing health endpoint available', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  test('requires user authentication for infrastructure diagnostics', async () => {
    const response = await request(app).get('/api/health/infrastructure');

    expect(response.status).toBe(401);
  });

  test('reports measured replica and MongoDB health to an authenticated user', async () => {
    const originalReadyState = mongoose.connection.readyState;
    const originalDb = mongoose.connection.db;
    mongoose.connection.readyState = 1;
    mongoose.connection.db = {
      admin: () => ({
        command: jest.fn().mockResolvedValue({ ok: 1 })
      })
    };
    jest.spyOn(global, 'fetch').mockImplementation(async (endpoint) => {
      const instance = endpoint.match(/backend(\d):5000/)[0].replace(':5000', '').replace('backend', 'backend-');
      return {
        ok: true,
        json: async () => ({ status: 'ok', instance })
      };
    });

    try {
      const response = await request(app)
        .get('/api/health/infrastructure')
        .set(userAuth);

      expect(response.status).toBe(200);
      expect(response.body.backends.map(({ status }) => status)).toEqual([
        'healthy',
        'healthy',
        'healthy'
      ]);
      expect(response.body.mongodb.status).toBe('healthy');
      expect(response.body.process.uptimeSeconds).toEqual(expect.any(Number));
      expect(response.body.process.residentMemoryMiB).toEqual(expect.any(Number));
    } finally {
      mongoose.connection.readyState = originalReadyState;
      mongoose.connection.db = originalDb;
      jest.restoreAllMocks();
    }
  });

  test('marks a failed backend peer probe unavailable', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async (endpoint) => {
      if (endpoint.includes('backend2:5000')) {
        throw new Error('backend is unreachable');
      }

      const instance = endpoint.match(/backend(\d):5000/)[0].replace(':5000', '').replace('backend', 'backend-');
      return {
        ok: true,
        json: async () => ({ status: 'ok', instance })
      };
    });

    try {
      const response = await request(app)
        .get('/api/health/infrastructure')
        .set(userAuth);

      expect(response.status).toBe(200);
      expect(response.body.backends.map(({ status }) => status)).toEqual([
        'healthy',
        'unavailable',
        'healthy'
      ]);
    } finally {
      jest.restoreAllMocks();
    }
  });

  test('reports unavailable MongoDB without leaking diagnostic details', async () => {
    const originalReadyState = mongoose.connection.readyState;
    const originalDb = mongoose.connection.db;
    mongoose.connection.readyState = 1;
    mongoose.connection.db = {
      admin: () => ({
        command: jest.fn().mockRejectedValue(new Error('private database detail'))
      })
    };
    jest.spyOn(global, 'fetch').mockImplementation(async () => ({
      ok: true,
      json: async () => ({ status: 'ok', instance: 'backend-1' })
    }));

    try {
      const response = await request(app)
        .get('/api/health/infrastructure')
        .set(userAuth);

      expect(response.status).toBe(200);
      expect(response.body.mongodb.status).toBe('unavailable');
      expect(JSON.stringify(response.body)).not.toContain('private database detail');
    } finally {
      mongoose.connection.readyState = originalReadyState;
      mongoose.connection.db = originalDb;
      jest.restoreAllMocks();
    }
  });

  test('provisions a device only for an authenticated user and returns its secret once', async () => {
    mockDeviceModel.create.mockImplementation(async (data) => ({
      ...data,
      _id: device._id,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const response = await request(app)
      .post('/api/devices')
      .set(userAuth)
      .send({ deviceId: device.deviceId, name: 'Room sensor', owner: secondUserId });

    expect(response.status).toBe(201);
    expect(mockDeviceModel.create.mock.calls[0][0].owner).toBe(userId);
    expect(response.body.deviceSecret).toEqual(expect.any(String));
    expect(response.body.device.deviceSecretHash).toBeUndefined();
    expect(mockDeviceModel.create.mock.calls[0][0].deviceSecretHash).not.toBe(response.body.deviceSecret);
    expect(await verifyDeviceSecret(
      response.body.deviceSecret,
      mockDeviceModel.create.mock.calls[0][0].deviceSecretHash
    )).toBe(true);
  });

  test('rejects provisioning without user authentication', async () => {
    const response = await request(app)
      .post('/api/devices')
      .send({ deviceId: device.deviceId, name: 'Room sensor' });

    expect(response.status).toBe(401);
    expect(mockDeviceModel.create).not.toHaveBeenCalled();
  });

  test('requires user authentication for device listing and telemetry reads', async () => {
    const deviceList = await request(app).get('/api/devices');
    const latest = await request(app).get(`/api/telemetry/latest/${device.deviceId}`);
    const history = await request(app).get(`/api/telemetry/history/${device.deviceId}`);

    expect(deviceList.status).toBe(401);
    expect(latest.status).toBe(401);
    expect(history.status).toBe(401);
    expect(mockDeviceModel.find).not.toHaveBeenCalled();
    expect(mockTelemetryModel.findOne).not.toHaveBeenCalled();
    expect(mockTelemetryModel.find).not.toHaveBeenCalled();
  });

  test('rejects expired user tokens for protected device endpoints', async () => {
    const expiredToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: -1 });

    const response = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(mockDeviceModel.find).not.toHaveBeenCalled();
  });

  test('lists only the authenticated user devices without secret hashes', async () => {
    const devices = [{
      ...device,
      name: 'Room sensor',
      location: '',
      deviceType: 'esp32',
      lastSeenAt: null
    }];
    mockDeviceModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(devices)
      })
    });

    const response = await request(app).get('/api/devices').set(userAuth);

    expect(response.status).toBe(200);
    expect(response.body.devices).toHaveLength(1);
    expect(response.body.devices[0].deviceSecretHash).toBeUndefined();
    expect(mockDeviceModel.find).toHaveBeenCalledWith({ owner: userId });
  });

  test('keeps device lists and telemetry isolated between two accounts', async () => {
    const createdDevices = new Map();
    const accountDevices = new Map([
      [userId, [{ ...device, name: 'Account A sensor', location: '', deviceType: 'esp32', lastSeenAt: null }]],
      [secondUserId, [{ ...secondDevice, name: 'Account B sensor', location: '', deviceType: 'esp32', lastSeenAt: null }]]
    ]);
    mockDeviceModel.create.mockImplementation(async (data) => {
      const created = {
        ...data,
        _id: data.owner.toString() === userId ? device._id : secondDevice._id,
        lastSeenAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      createdDevices.set(data.deviceId, created);
      return created;
    });
    mockUserModel.findById.mockImplementation(async (id) => (
      id === userId ? owner : id === secondUserId ? secondOwner : null
    ));
    mockDeviceModel.find.mockImplementation(({ owner: requestedOwner }) => ({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockResolvedValue(accountDevices.get(requestedOwner) ?? [])
    }));
    mockDeviceModel.exists.mockImplementation(async ({ deviceId, owner: requestedOwner }) => (
      createdDevices.get(deviceId)?.owner.toString() === requestedOwner.toString()
        ? { _id: createdDevices.get(deviceId)._id }
        : null
    ));
    mockTelemetryModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ ...readingBody, deviceId: secondDevice.deviceId })
    });
    mockTelemetryModel.find.mockReturnValue(queryChain([
      { ...readingBody, deviceId: secondDevice.deviceId }
    ]));
    mockTelemetryModel.countDocuments.mockResolvedValue(1);

    const registrationA = await request(app)
      .post('/api/devices')
      .set(userAuth)
      .send({
        deviceId: device.deviceId,
        name: 'Account A sensor',
        owner: secondUserId
      });
    const registrationB = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${secondToken}`)
      .send({
        deviceId: secondDevice.deviceId,
        name: 'Account B sensor',
        owner: userId
      });

    const accountADevices = await request(app).get('/api/devices').set(userAuth);
    const accountBDevices = await request(app)
      .get('/api/devices')
      .set('Authorization', `Bearer ${secondToken}`);
    const accountAReading = await request(app)
      .get(`/api/telemetry/latest/${secondDevice.deviceId}`)
      .set(userAuth);
    const accountAHistory = await request(app)
      .get(`/api/telemetry/history/${secondDevice.deviceId}`)
      .set(userAuth);
    const accountBReading = await request(app)
      .get(`/api/telemetry/latest/${secondDevice.deviceId}`)
      .set('Authorization', `Bearer ${secondToken}`);
    const accountBHistory = await request(app)
      .get(`/api/telemetry/history/${secondDevice.deviceId}`)
      .set('Authorization', `Bearer ${secondToken}`);

    expect(registrationA.status).toBe(201);
    expect(registrationB.status).toBe(201);
    expect(registrationA.body.device.deviceSecretHash).toBeUndefined();
    expect(registrationB.body.device.deviceSecretHash).toBeUndefined();
    expect(registrationA.body.deviceSecret).toEqual(expect.any(String));
    expect(registrationB.body.deviceSecret).toEqual(expect.any(String));
    expect(mockDeviceModel.create.mock.calls[0][0].owner).toBe(userId);
    expect(mockDeviceModel.create.mock.calls[1][0].owner).toBe(secondUserId);
    expect(accountADevices.body.devices.map(({ deviceId }) => deviceId)).toEqual([device.deviceId]);
    expect(accountBDevices.body.devices.map(({ deviceId }) => deviceId)).toEqual([secondDevice.deviceId]);
    expect(accountADevices.body.devices[0].deviceSecretHash).toBeUndefined();
    expect(accountAReading.status).toBe(404);
    expect(accountAHistory.status).toBe(404);
    expect(accountBReading.status).toBe(200);
    expect(accountBReading.body.reading.deviceId).toBe(secondDevice.deviceId);
    expect(accountBHistory.status).toBe(200);
    expect(accountBHistory.body.readings[0].deviceId).toBe(secondDevice.deviceId);
    expect(mockDeviceModel.find).toHaveBeenNthCalledWith(1, { owner: userId });
    expect(mockDeviceModel.find).toHaveBeenNthCalledWith(2, { owner: secondUserId });
    expect(mockTelemetryModel.findOne).toHaveBeenCalledTimes(1);
    expect(mockTelemetryModel.find).toHaveBeenCalledTimes(1);
    expect(mockTelemetryModel.find).toHaveBeenCalledWith({ deviceId: secondDevice.deviceId });
    expect(mockTelemetryModel.countDocuments).toHaveBeenCalledWith({ deviceId: secondDevice.deviceId });
  });

  test('accepts valid telemetry and updates device last-seen time', async () => {
    mockTelemetryModel.create.mockResolvedValue({ ...readingBody });
    mockTelemetryModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ ...readingBody })
    });

    const response = await request(app)
      .post('/api/telemetry')
      .set(deviceAuth)
      .send({ ...readingBody, owner: secondUserId });

    expect(response.status).toBe(201);
    expect(mockTelemetryModel.create).toHaveBeenCalledWith(expect.objectContaining({
      deviceId: device.deviceId,
      temperatureC: 28.4,
      humidityPercent: 64.2,
      source: 'device',
      sequence: 125,
      receivedAt: expect.any(Date)
    }));
    expect(mockTelemetryModel.create.mock.calls[0][0]).not.toHaveProperty('owner');
    expect(mockDeviceModel.updateOne).toHaveBeenCalled();
    expect(mockDeviceModel.updateOne).toHaveBeenCalledWith(
      {
        _id: device._id,
        $or: [
          { lastSequence: { $lt: readingBody.sequence } },
          { lastSequence: { $exists: false } }
        ]
      },
      {
        $set: { lastSequence: readingBody.sequence },
        $max: { lastSeenAt: new Date(readingBody.timestamp) }
      }
    );

    const latest = await request(app)
      .get(`/api/telemetry/latest/${device.deviceId}`)
      .set(userAuth);

    expect(latest.status).toBe(200);
    expect(latest.body.reading.sequence).toBe(readingBody.sequence);
    expect(mockDeviceModel.exists).toHaveBeenCalledWith({ deviceId: device.deviceId, owner: userId });
  });

  test.each([
    [{ ...readingBody, temperatureC: undefined }],
    [{ ...readingBody, humidityPercent: undefined }],
    [{ ...readingBody, temperatureC: Number.NaN }],
    [{ ...readingBody, temperatureC: 81 }],
    [{ ...readingBody, temperatureC: -41 }],
    [{ ...readingBody, humidityPercent: 101 }],
    [{ ...readingBody, humidityPercent: -1 }],
    [{ ...readingBody, timestamp: 'not-a-timestamp' }],
    [{ ...readingBody, sequence: 1.5 }],
    [{ ...readingBody, temperatureC: '28.4' }]
  ])('rejects invalid telemetry payload %#', async (body) => {
    const response = await request(app)
      .post('/api/telemetry')
      .set(deviceAuth)
      .send(body);

    expect(response.status).toBe(400);
    expect(mockTelemetryModel.create).not.toHaveBeenCalled();
  });

  test('stores an explicit simulated source marker for sample readings', async () => {
    mockTelemetryModel.create.mockResolvedValue({ ...readingBody, source: 'simulated' });

    const response = await request(app)
      .post('/api/telemetry')
      .set(deviceAuth)
      .send({ ...readingBody, source: 'simulated' });

    expect(response.status).toBe(201);
    expect(mockTelemetryModel.create).toHaveBeenCalledWith(expect.objectContaining({
      source: 'simulated'
    }));
  });

  test('rejects unknown telemetry source labels', async () => {
    const response = await request(app)
      .post('/api/telemetry')
      .set(deviceAuth)
      .send({ ...readingBody, source: 'unknown' });

    expect(response.status).toBe(400);
    expect(mockTelemetryModel.create).not.toHaveBeenCalled();
  });

  test('rejects malformed JSON and oversized request bodies safely', async () => {
    const malformed = await request(app)
      .post('/api/telemetry')
      .set('Content-Type', 'application/json')
      .send('{');
    const oversized = await request(app)
      .post('/api/telemetry')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(17 * 1024) }));

    expect(malformed.status).toBe(400);
    expect(malformed.body.message).toMatch(/valid JSON/);
    expect(oversized.status).toBe(413);
    expect(oversized.body.message).toMatch(/16kb/);
  });

  test('rejects missing or invalid device credentials', async () => {
    const missing = await request(app).post('/api/telemetry').send(readingBody);
    const invalid = await request(app)
      .post('/api/telemetry')
      .set({ ...deviceAuth, 'X-Device-Secret': 'incorrect-secret' })
      .send(readingBody);

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(mockTelemetryModel.create).not.toHaveBeenCalled();
  });

  test('rejects an unknown device ID even when a valid secret is supplied', async () => {
    mockDeviceModel.findOne.mockImplementation(({ deviceId }) => ({
      select: jest.fn().mockResolvedValue(deviceId === device.deviceId ? device : null)
    }));

    const response = await request(app)
      .post('/api/telemetry')
      .set({ ...deviceAuth, 'X-Device-ID': 'esp32-unknown-01' })
      .send(readingBody);

    expect(response.status).toBe(401);
    expect(mockTelemetryModel.create).not.toHaveBeenCalled();
  });

  test('prevents a device from submitting telemetry for another device', async () => {
    const response = await request(app)
      .post('/api/telemetry')
      .set(deviceAuth)
      .send({ ...readingBody, deviceId: 'esp32-other-room' });

    expect(response.status).toBe(403);
    expect(mockTelemetryModel.create).not.toHaveBeenCalled();
  });

  test('rejects duplicate device sequences', async () => {
    mockTelemetryModel.create.mockRejectedValueOnce({ code: 11000 });

    const response = await request(app)
      .post('/api/telemetry')
      .set(deviceAuth)
      .send(readingBody);

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/already been submitted/);
  });

  test('rejects out-of-order telemetry sequences before persisting the reading', async () => {
    mockDeviceModel.updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });

    const response = await request(app)
      .post('/api/telemetry')
      .set(deviceAuth)
      .send({ ...readingBody, sequence: readingBody.sequence - 1 });

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/greater than the last accepted sequence/);
    expect(mockTelemetryModel.create).not.toHaveBeenCalled();
  });

  test('checks existing telemetry before accepting a sequence for a legacy device', async () => {
    mockDeviceModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ ...device, lastSequence: undefined })
    });
    mockTelemetryModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({ sequence: readingBody.sequence })
    });

    const response = await request(app)
      .post('/api/telemetry')
      .set(deviceAuth)
      .send(readingBody);

    expect(response.status).toBe(409);
    expect(mockTelemetryModel.create).not.toHaveBeenCalled();
    expect(mockDeviceModel.updateOne).not.toHaveBeenCalled();
  });

  test('returns the latest reading only after checking device ownership', async () => {
    const reading = { ...readingBody, _id: 'reading-id' };
    mockTelemetryModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(reading)
    });

    const response = await request(app)
      .get(`/api/telemetry/latest/${device.deviceId}`)
      .set(userAuth);

    expect(response.status).toBe(200);
    expect(response.body.reading.deviceId).toBe(device.deviceId);
    expect(mockDeviceModel.exists).toHaveBeenCalledWith({ deviceId: device.deviceId, owner: userId });
  });

  test('does not return another user device telemetry', async () => {
    mockDeviceModel.exists.mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/telemetry/latest/${device.deviceId}`)
      .set(userAuth);

    expect(response.status).toBe(404);
    expect(mockTelemetryModel.findOne).not.toHaveBeenCalled();
  });

  test('paginates history and enforces a maximum page size', async () => {
    mockTelemetryModel.find.mockReturnValue(queryChain([{ ...readingBody }]));
    mockTelemetryModel.countDocuments.mockResolvedValue(1);

    const response = await request(app)
      .get(`/api/telemetry/history/${device.deviceId}?page=1&limit=10`)
      .set(userAuth);

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(mockTelemetryModel.find).toHaveBeenCalledWith({ deviceId: device.deviceId });

    const oversized = await request(app)
      .get(`/api/telemetry/history/${device.deviceId}?limit=101`)
      .set(userAuth);

    expect(oversized.status).toBe(400);
  });

  test('does not return another user history', async () => {
    mockDeviceModel.exists.mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/telemetry/history/${device.deviceId}`)
      .set(userAuth);

    expect(response.status).toBe(404);
    expect(mockTelemetryModel.find).not.toHaveBeenCalled();
  });

  test('sanitizes MongoDB failures', async () => {
    mockTelemetryModel.create.mockRejectedValueOnce(new Error('private database connection detail'));

    const response = await request(app)
      .post('/api/telemetry')
      .set(deviceAuth)
      .send(readingBody);

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Unable to store telemetry');
    expect(JSON.stringify(response.body)).not.toContain('private database connection detail');
  });
});
