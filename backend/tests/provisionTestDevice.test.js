import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../scripts/provisionTestDevice.js', import.meta.url));
const testSecret = 'test-only-device-secret';
const testToken = 'test-only-user-token';
const readingStore = new Map();

const runHelper = (apiBaseUrl, localAppData) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      IOT_TEST_EMAIL: 'test@example.com',
      IOT_TEST_PASSWORD: 'test-password',
      IOT_TEST_API_BASE_URL: apiBaseUrl,
      LOCALAPPDATA: localAppData
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  child.once('error', reject);
  child.once('close', (code) => resolve({ code, stdout, stderr }));
});

describe('IoT test-device provisioning helper', () => {
  test('provisions and verifies simulated data without printing credentials', async () => {
    readingStore.clear();
    const registeredDeviceIds = new Set();
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      res.setHeader('Content-Type', 'application/json');

      if (req.url === '/api/auth/login' && req.method === 'POST') {
        res.end(JSON.stringify({ token: testToken }));
        return;
      }

      if (req.url === '/api/devices' && req.method === 'GET') {
        res.end(JSON.stringify({
          devices: [...registeredDeviceIds].map((deviceId) => ({ deviceId }))
        }));
        return;
      }

      if (req.url === '/api/devices' && req.method === 'POST') {
        if (req.headers.authorization !== `Bearer ${testToken}`) {
          res.writeHead(401).end(JSON.stringify({ message: 'Authentication required' }));
          return;
        }

        if (registeredDeviceIds.has(body.deviceId)) {
          res.writeHead(409).end(JSON.stringify({ message: 'Device ID is already registered' }));
          return;
        }
        registeredDeviceIds.add(body.deviceId);
        res.writeHead(201).end(JSON.stringify({
          device: { deviceId: body.deviceId },
          deviceSecret: testSecret
        }));
        return;
      }

      if (req.url === '/api/telemetry' && req.method === 'POST') {
        if (
          req.headers['x-device-id'] !== body.deviceId ||
          req.headers['x-device-secret'] !== testSecret ||
          body.source !== 'simulated'
        ) {
          res.writeHead(401).end(JSON.stringify({ message: 'Invalid device request' }));
          return;
        }
        readingStore.set(body.deviceId, body);
        res.writeHead(201).end(JSON.stringify({ message: 'accepted' }));
        return;
      }

      const deviceId = decodeURIComponent(req.url.split('/').at(-1).split('?')[0]);
      const reading = readingStore.get(deviceId);
      if (req.headers.authorization !== `Bearer ${testToken}` || !reading) {
        res.writeHead(404).end(JSON.stringify({ message: 'Device not found' }));
        return;
      }

      if (req.url.includes('/latest/')) {
        res.end(JSON.stringify({ reading }));
        return;
      }

      if (req.url.includes('/history/')) {
        res.end(JSON.stringify({ readings: [reading] }));
        return;
      }

      res.writeHead(404).end(JSON.stringify({ message: 'Not found' }));
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    try {
      const { port } = server.address();
      const tempDirectory = await mkdtemp(join(tmpdir(), 'cloudapp-iot-helper-'));
      const apiBaseUrl = `http://127.0.0.1:${port}/api`;

      try {
        const firstRun = await runHelper(apiBaseUrl, tempDirectory);
        const secondRun = await runHelper(apiBaseUrl, tempDirectory);

        for (const result of [firstRun, secondRun]) {
          expect(result.code).toBe(0);
          expect(result.stderr).toBe('');
          expect(result.stdout).not.toContain(testSecret);
          expect(result.stdout).not.toContain(testToken);
          expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
            result: 'verified',
            registrationStatus: 'registered',
            simulatedReading: expect.objectContaining({
              temperatureC: expect.any(Number),
              humidityPercent: expect.any(Number),
              source: 'simulated'
            }),
            historyCount: 1
          }));
        }
        expect(JSON.parse(firstRun.stdout).registration).toBe('created device once');
        expect(JSON.parse(secondRun.stdout).registration).toBe('reused existing device');
        expect(registeredDeviceIds.size).toBe(1);

        await rm(join(tempDirectory, 'CloudApp', 'test-devices'), { recursive: true });
        const missingSecretRun = await runHelper(apiBaseUrl, tempDirectory);
        expect(missingSecretRun.code).toBe(1);
        expect(missingSecretRun.stdout).toBe('');
        expect(missingSecretRun.stderr).toMatch(/secret file is missing.*Refusing to register a duplicate/);
        expect(missingSecretRun.stderr).not.toContain(testSecret);
        expect(registeredDeviceIds.size).toBe(1);
      } finally {
        await rm(tempDirectory, { recursive: true, force: true });
      }
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  }, 15000);

  test('refuses to run when production is enabled', async () => {
    const { code, stdout, stderr } = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [scriptPath], {
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let output = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
      child.once('error', reject);
      child.once('close', (exitCode) => resolve({ code: exitCode, stdout: '', stderr: output }));
    });

    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/disabled in production/);
    expect(stderr).not.toMatch(/password|secret|token/i);
  });
});
