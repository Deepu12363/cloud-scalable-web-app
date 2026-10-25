import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiError,
  getDevices,
  getInfrastructureStatus,
  getLatestTelemetry,
  getTelemetryHistory,
  registerDevice
} from '../src/services/api.js';

const token = 'test-user-token';

const mockResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
});

test('requests infrastructure diagnostics with the current user token', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return mockResponse({ backends: [], mongodb: { status: 'healthy' } });
  };

  try {
    const response = await getInfrastructureStatus(token);
    assert.equal(request.url, '/api/health/infrastructure');
    assert.equal(request.options.cache, 'no-store');
    assert.equal(request.options.headers.Authorization, `Bearer ${token}`);
    assert.equal(response.mongodb.status, 'healthy');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses authenticated, owner-scoped device and telemetry API paths', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return mockResponse({ devices: [], reading: null, readings: [], pagination: {} });
  };

  try {
    await getDevices(token);
    await getLatestTelemetry(token, 'sensor-01');
    await getTelemetryHistory(token, 'sensor-01', 2, 10);

    assert.deepEqual(requests.map(({ url }) => url), [
      '/api/devices',
      '/api/telemetry/latest/sensor-01',
      '/api/telemetry/history/sensor-01?page=2&limit=10'
    ]);
    assert.ok(requests.every(({ options }) => options.cache === 'no-store'));
    assert.ok(requests.every(({ options }) => options.headers.Authorization === `Bearer ${token}`));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('registers a device using the authenticated user token', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return mockResponse({ device: { deviceId: 'sensor-a-01' }, deviceSecret: 'one-time-secret' }, 201);
  };

  try {
    const device = { deviceId: 'sensor-a-01', name: 'Room sensor', location: 'Lab', deviceType: 'esp32' };
    const response = await registerDevice(token, device);

    assert.equal(captured.url, '/api/devices');
    assert.equal(captured.options.method, 'POST');
    assert.equal(captured.options.headers.Authorization, `Bearer ${token}`);
    assert.deepEqual(JSON.parse(captured.options.body), device);
    assert.equal(response.deviceSecret, 'one-time-secret');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preserves HTTP status for unauthorized and other dashboard error states', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => mockResponse({ message: 'Authentication required' }, 401);

  try {
    await assert.rejects(getDevices(token), (error) => (
      error instanceof ApiError && error.status === 401
    ));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns empty device collections without fabricating devices', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => mockResponse({ devices: [] });

  try {
    assert.deepEqual(await getDevices(token), { devices: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preserves latest-reading and history HTTP errors for dashboard states', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (
    url.includes('/latest/')
      ? mockResponse({ message: 'No telemetry found for this device' }, 404)
      : mockResponse({ message: 'Authentication required' }, 401)
  );

  try {
    await assert.rejects(getLatestTelemetry(token, 'sensor-01'), (error) => (
      error instanceof ApiError && error.status === 404
    ));
    await assert.rejects(getTelemetryHistory(token, 'sensor-01'), (error) => (
      error instanceof ApiError && error.status === 401
    ));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reports network failures separately from HTTP errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  try {
    await assert.rejects(getDevices(token), {
      message: 'Unable to reach the backend. Please try again.'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
