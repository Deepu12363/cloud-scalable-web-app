import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

if (process.env.NODE_ENV === 'production') {
  console.error('The IoT test-device helper is disabled in production.');
  process.exit(1);
}

const email = process.env.IOT_TEST_EMAIL;
const password = process.env.IOT_TEST_PASSWORD;
const apiBaseUrl = process.env.IOT_TEST_API_BASE_URL || 'http://localhost:8081/api';

if (!email || !password) {
  console.error('Set IOT_TEST_EMAIL and IOT_TEST_PASSWORD before running the test-device helper.');
  process.exit(1);
}

let baseUrl;

try {
  baseUrl = new URL(apiBaseUrl);
  if (
    !['http:', 'https:'].includes(baseUrl.protocol) ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new Error('Unsupported API URL');
  }
} catch {
  console.error('IOT_TEST_API_BASE_URL must be a valid HTTP or HTTPS API URL.');
  process.exit(1);
}

const apiRoot = baseUrl.toString().replace(/\/+$/, '');
const accountKey = createHash('sha256')
  .update(`${apiRoot}\0${email.trim().toLowerCase()}`)
  .digest('hex');
const deviceId = `sim-test-${accountKey.slice(0, 24)}`;
const defaultStoreDirectory = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'CloudApp', 'test-devices')
  : join(homedir(), '.local', 'share', 'cloudapp', 'test-devices');
const secretFile = join(defaultStoreDirectory, `${accountKey}.json`);

const callApi = async (path, { token, ...options } = {}) => {
  const response = await fetch(`${apiRoot}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    },
    signal: AbortSignal.timeout(10000)
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${path} failed with HTTP ${response.status}: ${body.message || 'request failed'}`);
  }

  return body;
};

try {
  const login = await callApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  const token = login.token;

  if (typeof token !== 'string' || !token) {
    throw new Error('Login response did not include an access token.');
  }

  const deviceList = await callApi('/devices', { token });
  if (!Array.isArray(deviceList.devices)) {
    throw new Error('Device list response was invalid.');
  }

  let savedCredentials;
  try {
    savedCredentials = JSON.parse(await readFile(secretFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error('Unable to read the local test-device secret file.');
    }
  }

  const existingDevice = deviceList.devices.find((device) => device.deviceId === deviceId);
  let deviceSecret;

  if (savedCredentials) {
    if (
      savedCredentials.deviceId !== deviceId ||
      typeof savedCredentials.deviceSecret !== 'string' ||
      !savedCredentials.deviceSecret ||
      !existingDevice
    ) {
      throw new Error('The saved test-device credentials do not match an owned device. Refusing to register another device.');
    }
    deviceSecret = savedCredentials.deviceSecret;
  } else {
    if (existingDevice) {
      throw new Error('The test device already exists but its local secret file is missing. Refusing to register a duplicate.');
    }

    const registration = await callApi('/devices', {
      method: 'POST',
      token,
      body: JSON.stringify({
        deviceId,
        name: 'Simulated capstone test device',
        location: 'Development test',
        deviceType: 'simulator'
      })
    });

    deviceSecret = registration.deviceSecret;
    if (registration.device?.deviceId !== deviceId || typeof deviceSecret !== 'string' || !deviceSecret) {
      throw new Error('Device registration response was incomplete.');
    }

    await mkdir(dirname(secretFile), { recursive: true });
    const temporaryFile = `${secretFile}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    let fileHandle;
    try {
      fileHandle = await open(temporaryFile, 'wx', 0o600);
      await fileHandle.writeFile(JSON.stringify({ deviceId, deviceSecret }), 'utf8');
      await fileHandle.close();
      fileHandle = undefined;
      await rename(temporaryFile, secretFile);
    } catch (error) {
      if (fileHandle) await fileHandle.close();
      await unlink(temporaryFile).catch((cleanupError) => {
        if (cleanupError.code !== 'ENOENT') throw cleanupError;
      });
      throw new Error(`Unable to save the test-device secret locally; the device was registered but cannot be reused automatically (${error.code || 'file error'}).`);
    }
  }

  const reading = {
    deviceId,
    temperatureC: Number((20 + Math.random() * 10).toFixed(1)),
    humidityPercent: Number((35 + Math.random() * 30).toFixed(1)),
    source: 'simulated',
    timestamp: new Date().toISOString(),
    sequence: Date.now()
  };

  await callApi('/telemetry', {
    method: 'POST',
    headers: {
      'X-Device-ID': deviceId,
      'X-Device-Secret': deviceSecret
    },
    body: JSON.stringify(reading)
  });

  const [latestResult, historyResult] = await Promise.all([
    callApi(`/telemetry/latest/${encodeURIComponent(deviceId)}`, { token }),
    callApi(`/telemetry/history/${encodeURIComponent(deviceId)}?page=1&limit=10`, { token })
  ]);
  const latest = latestResult.reading;

  if (
    latest?.deviceId !== deviceId ||
    latest.source !== 'simulated' ||
    !Array.isArray(historyResult.readings) ||
    !historyResult.readings.some((item) => item.sequence === reading.sequence && item.source === 'simulated')
  ) {
    throw new Error('Persisted simulated telemetry did not match the submitted reading.');
  }

  console.log(JSON.stringify({
    result: 'verified',
    deviceId,
    registration: existingDevice ? 'reused existing device' : 'created device once',
    registrationStatus: 'registered',
    simulatedReading: {
      temperatureC: latest.temperatureC,
      humidityPercent: latest.humidityPercent,
      timestamp: latest.timestamp,
      source: latest.source
    },
    historyCount: historyResult.readings.length
  }, null, 2));
} catch (error) {
  console.error(`IoT test-device workflow failed: ${error.message}`);
  process.exitCode = 1;
}
