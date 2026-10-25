import { Counter, collectDefaultMetrics, Histogram, Registry } from 'prom-client';

const register = new Registry();

collectDefaultMetrics({ register });

const requestLabels = ['method', 'route', 'status_code'];

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: requestLabels,
  registers: [register]
});

const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: requestLabels,
  registers: [register]
});

export const metricsMiddleware = (req, res, next) => {
  if (req.path === '/metrics') {
    return next();
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const route = typeof req.route?.path === 'string'
      ? `${req.baseUrl}${req.route.path}`
      : 'unmatched';
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode)
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(
      labels,
      Number(process.hrtime.bigint() - startedAt) / 1e9
    );
  });

  return next();
};

export const metricsHandler = async (req, res, next) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    return res.end(await register.metrics());
  } catch (error) {
    return next(error);
  }
};
