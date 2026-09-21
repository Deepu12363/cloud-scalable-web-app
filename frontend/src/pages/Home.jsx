import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function Home() {
  const { user } = useAuth();

  return (
    <main>
      <section className="hero-band">
        <div className="container hero-content">
          <p className="eyebrow">Phase 3 · Authentication system</p>
          <h1>Cloud-Based Scalable Web Application Infrastructure</h1>
          <p className="hero-copy">
            A practical capstone foundation connecting a React client to an Express API,
            MongoDB persistence, and JWT authentication.
          </p>
          <div className="hero-actions">
            {user ? <Link className="button button-primary" to="/dashboard">Open dashboard</Link> : (
              <>
                <Link className="button button-primary" to="/register">Create an account</Link>
                <Link className="button button-light" to="/login">Sign in</Link>
              </>
            )}
          </div>
        </div>
      </section>
      <section className="container feature-grid" aria-label="Project components">
        <article className="feature-card"><span>01</span><h2>React frontend</h2><p>Responsive pages and client-side routing provide a clear application experience.</p></article>
        <article className="feature-card"><span>02</span><h2>Express backend</h2><p>Existing API endpoints handle health checks, registration, login, and user sessions.</p></article>
        <article className="feature-card"><span>03</span><h2>Secure foundation</h2><p>MongoDB stores users while bcryptjs and JWT protect authentication flows.</p></article>
      </section>
      <p className="container roadmap-note">Docker and load balancing are planned for later phases.</p>
    </main>
  );
}

export default Home;