import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import * as api from '../services/api.js';
import { ApiError } from '../services/api.js';
import Loading from '../components/Loading.jsx';

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—');

const getStatusLabel = (status) => {
  if (status === 'healthy') return 'Healthy';
  if (status === 'reachable') return 'Reachable';
  if (status === 'ok') return 'Healthy';
  if (status === 'unavailable') return 'Unavailable';
  if (status === 'unknown') return 'Unknown';
  return status || 'Unknown';
};

function StatusValue({ status }) {
  const modifier = status === 'healthy' || status === 'reachable'
    ? 'healthy'
    : status === 'unavailable'
      ? 'unavailable'
      : 'unknown';
  return <span className={`dashboard-status dashboard-status-${modifier}`}>{getStatusLabel(status)}</span>;
}

function Dashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(user);
  const [refreshing, setRefreshing] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [infrastructure, setInfrastructure] = useState(null);
  const [infrastructureError, setInfrastructureError] = useState('');
  const [gatewayStatus, setGatewayStatus] = useState('unknown');
  const [gatewayLatencyMs, setGatewayLatencyMs] = useState(null);
  const [healthResponses, setHealthResponses] = useState([]);
  const [healthError, setHealthError] = useState('');
  const [devices, setDevices] = useState([]);
  const [latestReadings, setLatestReadings] = useState({});
  const [devicesError, setDevicesError] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [deviceForm, setDeviceForm] = useState({
    deviceId: '',
    name: '',
    location: '',
    deviceType: 'esp32'
  });
  const [registeringDevice, setRegisteringDevice] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const [registeredSecret, setRegisteredSecret] = useState(null);

  const loadDashboard = useCallback(async () => {
    setRefreshing(true);
    setInfrastructureError('');
    setHealthError('');
    setDevicesError('');

    const infrastructureRequest = (async () => {
      const startedAt = performance.now();

      try {
        const value = await api.getInfrastructureStatus(token);
        return { status: 'fulfilled', value, durationMs: Math.round(performance.now() - startedAt) };
      } catch (reason) {
        return { status: 'rejected', reason, durationMs: Math.round(performance.now() - startedAt) };
      }
    })();
    const [profileResult, infrastructureResult, devicesResult, healthResults] = await Promise.all([
      api.getCurrentUser(token).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason })
      ),
      infrastructureRequest,
      api.getDevices(token).then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason })
      ),
      Promise.allSettled([api.getHealth(), api.getHealth(), api.getHealth()])
    ]);

    if (profileResult.status === 'fulfilled') {
      setProfile(profileResult.value.user);
    }

    const protectedResults = [profileResult, infrastructureResult, devicesResult];
    setUnauthorized(protectedResults.some(
      (result) => result.status === 'rejected' && result.reason instanceof ApiError && result.reason.status === 401
    ));

    if (infrastructureResult.status === 'fulfilled') {
      setInfrastructure(infrastructureResult.value);
      setGatewayStatus('reachable');
      setGatewayLatencyMs(infrastructureResult.durationMs);
    } else {
      setInfrastructure(null);
      setInfrastructureError(infrastructureResult.reason.message);
      const responseReceived = infrastructureResult.reason instanceof ApiError;
      setGatewayStatus(responseReceived ? 'reachable' : 'unknown');
      setGatewayLatencyMs(responseReceived ? infrastructureResult.durationMs : null);
    }

    const responses = healthResults.map((result, index) => (
      result.status === 'fulfilled'
        ? { instance: result.value.instance, status: result.value.status, observedAt: new Date(), index }
        : { error: result.reason.message, observedAt: new Date(), index }
    ));
    setHealthResponses(responses);
    setHealthError(responses.every((response) => response.error) ? 'No health responses were received.' : '');

    if (devicesResult.status === 'fulfilled') {
      const ownedDevices = devicesResult.value.devices;
      setDevices(ownedDevices);
      setDevicesError('');

      const readings = await Promise.all(ownedDevices.map(async (device) => {
        try {
          const result = await api.getLatestTelemetry(token, device.deviceId);
          return [device.deviceId, { reading: result.reading, error: '' }];
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            return [device.deviceId, { reading: null, error: '' }];
          }
          if (error instanceof ApiError && error.status === 401) {
            setUnauthorized(true);
          }
          return [device.deviceId, { reading: null, error: error.message }];
        }
      }));
      setLatestReadings(Object.fromEntries(readings));

      setSelectedDeviceId((current) => (
        ownedDevices.some((device) => device.deviceId === current)
          ? current
          : ownedDevices[0]?.deviceId ?? ''
      ));
    } else {
      setDevices([]);
      setLatestReadings({});
      setDevicesError(devicesResult.reason.message);
      setSelectedDeviceId('');
    }

    setUpdatedAt(new Date());
    setRefreshing(false);
  }, [token]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleRegisterDevice = async (event) => {
    event.preventDefault();
    setRegisteringDevice(true);
    setRegistrationError('');
    setRegisteredSecret(null);

    try {
      const registration = await api.registerDevice(token, {
        deviceId: deviceForm.deviceId.trim(),
        name: deviceForm.name.trim(),
        location: deviceForm.location.trim(),
        deviceType: deviceForm.deviceType.trim()
      });
      setRegisteredSecret({
        deviceId: registration.device.deviceId,
        secret: registration.deviceSecret
      });
      setDeviceForm({ deviceId: '', name: '', location: '', deviceType: 'esp32' });
      await loadDashboard();
    } catch (error) {
      setRegistrationError(error.message);
      if (error instanceof ApiError && error.status === 401) setUnauthorized(true);
    } finally {
      setRegisteringDevice(false);
    }
  };

  useEffect(() => {
    if (!selectedDeviceId) {
      setHistory(null);
      setHistoryError('');
      return undefined;
    }

    let active = true;
    setHistoryLoading(true);
    setHistoryError('');

    api.getTelemetryHistory(token, selectedDeviceId, historyPage, 10)
      .then((result) => {
        if (active) setHistory(result);
      })
      .catch((error) => {
        if (!active) return;
        setHistory(null);
        setHistoryError(error.message);
        if (error instanceof ApiError && error.status === 401) setUnauthorized(true);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token, selectedDeviceId, historyPage]);

  if (!profile) return <Loading message="Loading dashboard..." />;

  const continueToLogin = () => {
    logout();
    navigate('/login', { state: { from: '/dashboard' } });
  };

  const selectedDevice = devices.find((device) => device.deviceId === selectedDeviceId);

  return (
    <main className="dashboard-page container">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Authenticated workspace</p>
          <h1>Project dashboard</h1>
        </div>
        <div className="dashboard-actions">
          <span className="status-pill">
            <span className={`status-dot ${unauthorized ? 'status-dot-muted' : ''}`} />
            {unauthorized ? 'Session issue' : 'Authenticated'}
          </span>
          <button className="button button-outline button-small" type="button" onClick={loadDashboard} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh status'}
          </button>
        </div>
      </div>

      {unauthorized ? (
        <div className="notice notice-error" role="alert">
          Your session is no longer authorized for protected dashboard data.{' '}
          <button className="text-button" type="button" onClick={continueToLogin}>Sign in again</button>
        </div>
      ) : null}

      <section className="dashboard-grid dashboard-overview" aria-label="Account overview">
        <article className="dashboard-card welcome-card">
          <p className="card-label">Welcome</p>
          <h2>{profile.name}</h2>
          <p>Your authenticated project and IoT service overview.</p>
        </article>
        <article className="dashboard-card">
          <p className="card-label">Account details</p>
          <dl>
            <div><dt>Name</dt><dd>{profile.name}</dd></div>
            <div><dt>Email</dt><dd>{profile.email}</dd></div>
          </dl>
        </article>
        <article className="dashboard-card">
          <p className="card-label">Dashboard data</p>
          <p className="dashboard-updated">{updatedAt ? `Updated ${formatDate(updatedAt)}` : 'Waiting for first status check'}</p>
          <p className="muted">Status values come from the running services, not fixed UI defaults.</p>
        </article>
      </section>

      <section className="dashboard-section" aria-labelledby="infrastructure-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Infrastructure</p>
            <h2 id="infrastructure-title">Infrastructure health</h2>
          </div>
          <p className="muted">Direct backend probes and a MongoDB ping, refreshed on request.</p>
        </div>
        {refreshing && !infrastructure ? <p role="status">Checking infrastructure…</p> : null}
        {infrastructureError ? <p className="notice notice-error" role="alert">{infrastructureError}</p> : null}
        <div className="dashboard-grid dashboard-grid-four">
          <article className="dashboard-card service-card">
            <p className="card-label">Nginx gateway</p>
            <StatusValue status={gatewayStatus} />
            <p className="muted">A response through the configured Nginx route verifies reachability for this request only.</p>
          </article>
          {(infrastructure?.backends ?? ['backend-1', 'backend-2', 'backend-3'].map((name) => ({
            name,
            status: 'unknown',
            latencyMs: null
          }))).map((backend) => (
            <article className="dashboard-card service-card" key={backend.name}>
              <p className="card-label">{backend.name.replace('backend-', 'Backend ')}</p>
              <StatusValue status={backend.status} />
              <p className="muted">{backend.latencyMs === null ? 'Probe latency unavailable' : `Probe: ${backend.latencyMs} ms`}</p>
            </article>
          ))}
          <article className="dashboard-card service-card">
            <p className="card-label">MongoDB</p>
            <StatusValue status={infrastructure?.mongodb.status ?? 'unknown'} />
            <p className="muted">
              {infrastructure?.mongodb.latencyMs == null ? 'Ping latency unavailable' : `Ping: ${infrastructure.mongodb.latencyMs} ms`}
            </p>
          </article>
        </div>
        {infrastructure?.configuration.backendProbes === 'unavailable' ? (
          <p className="notice notice-warning" role="status">Backend peer probes are not configured in this deployment.</p>
        ) : null}
      </section>

      <section className="dashboard-section" aria-labelledby="balancing-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Observed responses</p>
            <h2 id="balancing-title">Load balancing</h2>
          </div>
          <p className="muted">Each row is the actual instance named by one `/api/health` response through Nginx. This is a sample, not traffic statistics.</p>
        </div>
        {healthError ? <p className="notice notice-error" role="alert">{healthError}</p> : null}
        <div className="table-scroll">
          <table>
            <thead><tr><th>Observed at</th><th>Responding instance</th><th>Health</th></tr></thead>
            <tbody>
              {healthResponses.map((response) => (
                <tr key={response.index}>
                  <td>{formatDate(response.observedAt)}</td>
                  <td>{response.instance ?? 'No response'}</td>
                  <td>{response.error ? <span className="dashboard-status dashboard-status-unavailable">Unavailable</span> : getStatusLabel(response.status)}</td>
                </tr>
              ))}
              {!healthResponses.length ? <tr><td colSpan="3">Waiting for health responses…</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="performance-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Measured values</p>
            <h2 id="performance-title">Performance and reliability</h2>
          </div>
          <p className="muted">Point-in-time measurements only; no request counters or synthetic traffic rates.</p>
        </div>
        <div className="dashboard-grid dashboard-grid-four">
          <article className="dashboard-card metric-card">
            <p className="card-label">Dashboard API round trip</p>
            <strong>{gatewayLatencyMs === null ? '—' : `${gatewayLatencyMs} ms`}</strong>
            <p className="muted">Browser-measured authenticated diagnostics request via Nginx.</p>
          </article>
          <article className="dashboard-card metric-card">
            <p className="card-label">Responding backend uptime</p>
            <strong>{infrastructure ? `${infrastructure.process.uptimeSeconds} s` : '—'}</strong>
            <p className="muted">{infrastructure ? `Process: ${infrastructure.process.instanceId}` : 'No process measurement available'}</p>
          </article>
          <article className="dashboard-card metric-card">
            <p className="card-label">Backend resident memory</p>
            <strong>{infrastructure ? `${infrastructure.process.residentMemoryMiB} MiB` : '—'}</strong>
            <p className="muted">RSS of the backend serving the diagnostics request.</p>
          </article>
          <article className="dashboard-card metric-card">
            <p className="card-label">MongoDB ping</p>
            <strong>{infrastructure?.mongodb.latencyMs == null ? '—' : `${infrastructure.mongodb.latencyMs} ms`}</strong>
            <p className="muted">Measured MongoDB ping from the responding backend.</p>
          </article>
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="iot-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Owned devices</p>
            <h2 id="iot-title">IoT monitoring</h2>
          </div>
          <p className="muted">Device and telemetry responses are scoped to your authenticated account.</p>
        </div>
        <div className="dashboard-card device-registration">
          <h3>Register a device</h3>
          <p className="muted">Register a simulated sensor or compatible hardware. The generated secret is shown once.</p>
          <form className="device-registration-form" onSubmit={handleRegisterDevice}>
            <div>
              <label htmlFor="device-id">Device ID</label>
              <input
                id="device-id"
                name="deviceId"
                value={deviceForm.deviceId}
                onChange={(event) => setDeviceForm({ ...deviceForm, deviceId: event.target.value })}
                pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,63}"
                maxLength="64"
                required
              />
            </div>
            <div>
              <label htmlFor="device-name">Name</label>
              <input
                id="device-name"
                name="name"
                value={deviceForm.name}
                onChange={(event) => setDeviceForm({ ...deviceForm, name: event.target.value })}
                maxLength="100"
                required
              />
            </div>
            <div>
              <label htmlFor="device-location">Location</label>
              <input
                id="device-location"
                name="location"
                value={deviceForm.location}
                onChange={(event) => setDeviceForm({ ...deviceForm, location: event.target.value })}
                maxLength="100"
              />
            </div>
            <div>
              <label htmlFor="device-type">Device type</label>
              <input
                id="device-type"
                name="deviceType"
                value={deviceForm.deviceType}
                onChange={(event) => setDeviceForm({ ...deviceForm, deviceType: event.target.value })}
                pattern="[A-Za-z0-9_-]{2,40}"
                maxLength="40"
                required
              />
            </div>
            <button className="button button-primary" type="submit" disabled={registeringDevice || unauthorized}>
              {registeringDevice ? 'Registering…' : 'Register device'}
            </button>
          </form>
          {registrationError ? <p className="notice notice-error" role="alert">{registrationError}</p> : null}
          {registeredSecret ? (
            <div className="device-secret" role="status">
              <p><strong>Save this device secret now.</strong> It will not be shown again.</p>
              <p>Device ID: <code>{registeredSecret.deviceId}</code></p>
              <code className="device-secret-value">{registeredSecret.secret}</code>
              <button className="text-button" type="button" onClick={() => setRegisteredSecret(null)}>Dismiss secret</button>
            </div>
          ) : null}
        </div>
        {devicesError ? <p className="notice notice-error" role="alert">{devicesError}</p> : null}
        {refreshing && !devices.length && !devicesError ? <p role="status">Loading your devices…</p> : null}
        {!refreshing && !devicesError && !devices.length ? (
          <div className="dashboard-card empty-state">
            <h3>No devices registered</h3>
            <p>Devices registered to your account will appear here with their latest readings and history.</p>
          </div>
        ) : null}
        {devices.length ? (
          <>
            <div className="device-grid">
              {devices.map((device) => {
                const latest = latestReadings[device.deviceId];
                return (
                  <article className="dashboard-card device-card" key={device.deviceId}>
                    <div className="device-card-heading">
                      <div>
                        <p className="card-label">{device.deviceType}</p>
                        <h3>{device.name}</h3>
                      </div>
                      <span className="muted">{device.location || 'No location set'}</span>
                    </div>
                    <p className="device-id">{device.deviceId}</p>
                    {latest?.error ? <p className="notice notice-error" role="alert">{latest.error}</p> : null}
                    {latest?.reading ? (
                      <>
                        <p>
                          <span className="dashboard-status dashboard-status-healthy">
                            {latest.reading.source === 'simulated'
                              ? 'Simulated'
                              : latest.reading.source === 'device'
                                ? 'Device'
                                : 'Source not recorded'}
                          </span>
                        </p>
                        <div className="reading-values">
                          <div><span>Temperature</span><strong>{latest.reading.temperatureC} °C</strong></div>
                          <div><span>Humidity</span><strong>{latest.reading.humidityPercent} %</strong></div>
                        </div>
                        <p className="muted">Measured {formatDate(latest.reading.timestamp)}</p>
                      </>
                    ) : !latest?.error && !latest && refreshing ? (
                      <p className="muted" role="status">Loading latest reading…</p>
                    ) : !latest?.error ? (
                      <p className="muted">No telemetry has been received for this device yet.</p>
                    ) : null}
                    <button
                      className="button button-outline button-small"
                      type="button"
                      aria-pressed={selectedDeviceId === device.deviceId}
                      onClick={() => {
                        setSelectedDeviceId(device.deviceId);
                        setHistoryPage(1);
                      }}
                    >
                      {selectedDeviceId === device.deviceId ? 'Viewing history' : 'View history'}
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="dashboard-card history-card">
              <div className="section-heading">
                <div>
                  <p className="card-label">Telemetry history</p>
                  <h3>{selectedDevice?.name ?? 'Select a device'}</h3>
                </div>
                {history?.pagination ? (
                  <div className="pagination-actions">
                    <button
                      className="button button-outline button-small"
                      type="button"
                      onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                      disabled={historyPage <= 1 || historyLoading}
                    >Previous</button>
                    <span>Page {history.pagination.page} of {Math.max(1, history.pagination.totalPages)}</span>
                    <button
                      className="button button-outline button-small"
                      type="button"
                      onClick={() => setHistoryPage((page) => page + 1)}
                      disabled={historyPage >= history.pagination.totalPages || historyLoading}
                    >Next</button>
                  </div>
                ) : null}
              </div>
              {historyLoading ? <p role="status">Loading telemetry history…</p> : null}
              {historyError ? <p className="notice notice-error" role="alert">{historyError}</p> : null}
              {!historyLoading && history && !history.readings.length ? <p className="muted">No historical readings for this device.</p> : null}
              {history?.readings.length ? (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Measured at</th><th>Temperature</th><th>Humidity</th><th>Source</th><th>Sequence</th></tr></thead>
                    <tbody>
                      {history.readings.map((reading) => (
                        <tr key={reading._id}>
                          <td>{formatDate(reading.timestamp)}</td>
                          <td>{reading.temperatureC} °C</td>
                          <td>{reading.humidityPercent} %</td>
                          <td>{reading.source === 'simulated' ? 'Simulated' : reading.source === 'device' ? 'Device' : 'Not recorded'}</td>
                          <td>{reading.sequence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

export default Dashboard;
