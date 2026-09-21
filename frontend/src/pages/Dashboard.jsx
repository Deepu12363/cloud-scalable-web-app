import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import * as api from '../services/api.js';
import Loading from '../components/Loading.jsx';

function Dashboard() {
  const { user, token } = useAuth();
  const [profile, setProfile] = useState(user);
  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [error, setError] = useState('');

  useEffect(() => {
    const checkServices = async () => {
      try {
        const [meData] = await Promise.all([api.getCurrentUser(token), api.getHealth()]);
        setProfile(meData.user);
        setBackendStatus('Online');
      } catch (serviceError) {
        setBackendStatus('Unavailable');
        setError(serviceError.message);
      }
    };
    checkServices();
  }, [token]);

  if (!profile) return <Loading message="Loading dashboard..." />;

  return (
    <main className="dashboard-page container">
      <div className="dashboard-heading">
        <div><p className="eyebrow">Authenticated workspace</p><h1>Project dashboard</h1></div>
        <span className="status-pill"><span className="status-dot" /> Authenticated</span>
      </div>
      {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
      <section className="dashboard-grid">
        <article className="dashboard-card welcome-card"><p className="card-label">Welcome</p><h2>{profile.name}</h2><p>Your frontend session is connected to the Phase 2 authentication API.</p></article>
        <article className="dashboard-card"><p className="card-label">Account details</p><dl><div><dt>Name</dt><dd>{profile.name}</dd></div><div><dt>Email</dt><dd>{profile.email}</dd></div></dl></article>
        <article className="dashboard-card"><p className="card-label">Backend status</p><div className="service-status"><span className={`status-dot ${backendStatus === 'Online' ? '' : 'status-dot-muted'}`} />{backendStatus}</div><p className="muted">Verified with the health and authenticated user endpoints.</p></article>
      </section>
    </main>
  );
}

export default Dashboard;