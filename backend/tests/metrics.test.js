import request from 'supertest';
import app from '../src/app.js';

const metricValue = (metrics, metricName, labels) => {
  const sample = metrics.split('\n').find((line) => (
    line.startsWith(`${metricName}{`) &&
    Object.entries(labels).every(([name, value]) => line.includes(`${name}="${value}"`))
  ));

  return sample ? Number(sample.split(' ').at(-1)) : 0;
};

const healthLabels = {
  method: 'GET',
  route: '/api/health',
  status_code: '200'
};

describe('Prometheus metrics endpoint', () => {
  test('returns Prometheus text exposition with application and process metrics', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);
    expect(response.text).toContain('# HELP http_requests_total');
    expect(response.text).toContain('# HELP http_request_duration_seconds');
    expect(response.text).toContain('# HELP process_resident_memory_bytes');
  });

  test('counts normal application requests using the route template', async () => {
    const before = await request(app).get('/metrics');
    const priorCount = metricValue(before.text, 'http_requests_total', healthLabels);

    const health = await request(app).get('/api/health');
    const after = await request(app).get('/metrics');

    expect(health.status).toBe(200);
    expect(metricValue(after.text, 'http_requests_total', healthLabels)).toBe(priorCount + 1);
    expect(metricValue(
      after.text,
      'http_request_duration_seconds_count',
      healthLabels
    )).toBe(priorCount + 1);
  });

  test('uses route templates instead of dynamic URL values', async () => {
    const response = await request(app).get('/api/telemetry/latest/sensor-123');
    const metrics = await request(app).get('/metrics');

    expect(response.status).toBe(401);
    expect(metrics.text).toContain(
      'route="/api/telemetry/latest/:deviceId",status_code="401"'
    );
    expect(metrics.text).not.toContain('sensor-123');
  });

  test('does not count requests to the metrics endpoint', async () => {
    const before = await request(app).get('/metrics');
    const priorSamples = before.text
      .split('\n')
      .filter((line) => line.startsWith('http_requests_total{'));

    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.text
      .split('\n')
      .filter((line) => line.startsWith('http_requests_total{')))
      .toEqual(priorSamples);
    expect(response.text).not.toContain('route="/metrics"');
  });
});
