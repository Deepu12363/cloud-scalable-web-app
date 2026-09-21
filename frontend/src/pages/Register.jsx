import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.name.trim() || !form.email || !form.password || !form.confirmPassword) {
      setError('Complete every field.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await register({ name: form.name, email: form.email, password: form.password });
      navigate('/login', { replace: true, state: { message: 'Account created. Please sign in.' } });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page container">
      <section className="form-card">
        <p className="eyebrow">Get started</p>
        <h1>Create your account</h1>
        <p className="form-intro">Register to access the authenticated project dashboard.</p>
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="register-name">Name</label>
          <input id="register-name" name="name" value={form.name} onChange={handleChange} autoComplete="name" />
          <label htmlFor="register-email">Email</label>
          <input id="register-email" name="email" type="email" value={form.email} onChange={handleChange} autoComplete="email" />
          <label htmlFor="register-password">Password</label>
          <input id="register-password" name="password" type="password" value={form.password} onChange={handleChange} autoComplete="new-password" />
          <label htmlFor="register-confirm-password">Confirm password</label>
          <input id="register-confirm-password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} autoComplete="new-password" />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary button-full" type="submit" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="form-footer">Already registered? <Link to="/login">Sign in</Link></p>
      </section>
    </main>
  );
}

export default Register;