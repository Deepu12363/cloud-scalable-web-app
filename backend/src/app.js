import cors from 'cors';
import express from 'express';
import authRoutes from './routes/authRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import telemetryRoutes from './routes/telemetryRoutes.js';
import { metricsHandler, metricsMiddleware } from './utils/metrics.js';

const app = express();

app.use(cors());
app.use(metricsMiddleware);
app.use(express.json({ limit: '16kb' }));

app.get('/metrics', metricsHandler);
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/telemetry', telemetryRoutes);

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body exceeds the 16kb limit' });
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ message: 'Request body must contain valid JSON' });
  }

  console.error('Unhandled request error');
  return res.status(500).json({ message: 'Unable to process request' });
});

export default app;
