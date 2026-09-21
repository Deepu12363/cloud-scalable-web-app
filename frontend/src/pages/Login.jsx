import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(location.state?.message || '');

  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!form.email || !form.password) {
      setError('Enter your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await login(form);
      navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page container">
      <section className="form-card">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in to CloudApp</h1>
        <p className="form-intro">Use your registered account to open the project dashboard.</p>
        {message ? <p className="form-success" role="status">{message}</p> : null}
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="login-email">Email</label>
          <input id="login-email" name="email" type="email" value={form.email} onChange={handleChange} autoComplete="email" />
          <label htmlFor="login-password">Password</label>
          <input id="login-password" name="password" type="password" value={form.password} onChange={handleChange} autoComplete="current-password" />
          <p className="form-helper"><Link to="/forgot-password">Forgot Password?</Link></p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary button-full" type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="form-footer">New to the project? <Link to="/register">Create an account</Link></p>
      </section>
    </main>
  );
}

export default Login;