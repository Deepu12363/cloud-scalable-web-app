import 'dotenv/config';

if (process.env.NODE_ENV === 'production') {
  console.error('The telemetry simulator is disabled in production.');
  process.exit(1);
}

const apiUrl = process.env.SIMULATOR_API_URL || 'http://localhost:8081/api/telemetry';
const deviceId = process.env.SIMULATOR_DEVICE_ID;
const deviceSecret = process.env.SIMULATOR_DEVICE_SECRET;
const intervalMs = Number(process.env.SIMULATOR_INTERVAL_MS || 5000);
let sequence = Number(process.env.SIMULATOR_SEQUENCE ?? Date.now());

if (!deviceId || !deviceSecret) {
  console.error('Set SIMULATOR_DEVICE_ID and SIMULATOR_DEVICE_SECRET before starting the simulator.');
  process.exit(1);
}

if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > 3600000) {
  console.error('SIMULATOR_INTERVAL_MS must be an integer from 1000 to 3600000.');
  process.exit(1);
}

if (!Number.isSafeInteger(sequence) || sequence < 0) {
  console.error('SIMULATOR_SEQUENCE must be a non-negative integer.');
  process.exit(1);
}

try {
  const parsedUrl = new URL(apiUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Unsupported URL protocol');
  }
} catch {
  console.error('SIMULATOR_API_URL must be a valid HTTP or HTTPS URL.');
  process.exit(1);
}

let running = true;
let submitting = false;
let temperature = 23;
let humidity = 50;

const submitReading = async () => {
  if (!running || submitting) return;
  submitting = true;
  sequence += 1;
  temperature = Math.max(-10, Math.min(45, temperature + (Math.random() - 0.5) * 0.8));
  humidity = Math.max(15, Math.min(90, humidity + (Math.random() - 0.5) * 2));

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': deviceId,
        'X-Device-Secret': deviceSecret
      },
      body: JSON.stringify({
        deviceId,
        temperatureC: Number(temperature.toFixed(1)),
        humidityPercent: Number(humidity.toFixed(1)),
        source: 'simulated',
        timestamp: new Date().toISOString(),
        sequence
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      console.error(`[simulated] Submission ${sequence} failed (HTTP ${response.status}): ${result.message || 'request failed'}`);
      return;
    }

    console.log(`[simulated] Submission ${sequence} accepted (HTTP ${response.status})`);
  } catch (error) {
    console.error(`[simulated] Submission ${sequence} failed: ${error.message}`);
  } finally {
    submitting = false;
  }
};

const stop = () => {
  if (!running) return;
  running = false;
  clearInterval(timer);
  console.log('Stopping telemetry simulator after any in-flight request completes.');
};

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

const timer = setInterval(submitReading, intervalMs);
console.log(`[simulated] Sending readings for ${deviceId} every ${intervalMs}ms. Press Ctrl+C to stop.`);
await submitReading();
