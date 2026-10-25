import mongoose from 'mongoose';
import { performance } from 'node:perf_hooks';

const expectedBackends = ['backend-1', 'backend-2', 'backend-3'];

const configuredPeers = () => {
  const entries = (process.env.BACKEND_HEALTH_URLS ?? '')
    .split(',')
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf('=');

      if (separator < 1) {
        return null;
      }

      const name = entry.slice(0, separator).trim();
      const endpoint = entry.slice(separator + 1).trim();

      try {
        const url = new URL(endpoint);
        if (
          !expectedBackends.includes(name) ||
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password
        ) {
          return null;
        }

        return { name, endpoint: url.toString() };
      } catch {
        return null;
      }
    });

  if (
    entries.length !== expectedBackends.length ||
    entries.some((entry) => entry === null) ||
    new Set(entries.map((entry) => entry.name)).size !== expectedBackends.length
  ) {
    return null;
  }

  return entries;
};

const probeBackend = async ({ name, endpoint }) => {
  const startedAt = performance.now();

  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(2000) });
    const body = await response.json();
    const latencyMs = Math.round(performance.now() - startedAt);

    return {
      name,
      status: response.ok && body.status === 'ok' && body.instance === name ? 'healthy' : 'unavailable',
      latencyMs
    };
  } catch {
    return { name, status: 'unavailable', latencyMs: Math.round(performance.now() - startedAt) };
  }
};

const checkMongoDB = async () => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return { status: 'unavailable', latencyMs: null };
  }

  const startedAt = performance.now();

  try {
    await mongoose.connection.db.admin().command({ ping: 1 }, { maxTimeMS: 2000 });
    return { status: 'healthy', latencyMs: Math.round(performance.now() - startedAt) };
  } catch {
    return { status: 'unavailable', latencyMs: Math.round(performance.now() - startedAt) };
  }
};

export const getInfrastructureStatus = async (req, res) => {
  const peers = configuredPeers();
  const [backends, mongodb] = await Promise.all([
    peers
      ? Promise.all(peers.map(probeBackend))
      : Promise.resolve(expectedBackends.map((name) => ({ name, status: 'unknown', latencyMs: null }))),
    checkMongoDB()
  ]);

  return res.json({
    backends,
    mongodb,
    configuration: {
      backendProbes: peers ? 'configured' : 'unavailable'
    },
    process: {
      instanceId: process.env.INSTANCE_ID || 'backend-local',
      uptimeSeconds: Math.floor(process.uptime()),
      residentMemoryMiB: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10
    }
  });
};
