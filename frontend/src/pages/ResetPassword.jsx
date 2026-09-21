import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as api from '../services/api.js';

function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!form.password || !form.confirmPassword) {
      setError('Enter and confirm your new password.');
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
      await api.resetPassword(token, form.password);
      navigate('/login', { replace: true, state: { message: 'Password reset successful. Please sign in.' } });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page container">
      <section className="form-card">
        <p className="eyebrow">Account recovery</p>
        <h1>Set a new password</h1>
        <p className="form-intro">Choose a new password for your CloudApp account.</p>
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="reset-password">New password</label>
          <input id="reset-password" name="password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" />
          <label htmlFor="reset-confirm-password">Confirm new password</label>
          <input id="reset-confirm-password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} autoComplete="new-password" />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary button-full" type="submit" disabled={submitting}>
            {submitting ? 'Updating password...' : 'Update password'}
          </button>
        </form>
        <p className="form-footer"><Link to="/login">Return to sign in</Link></p>
      </section>
    </main>
  );
}

export default ResetPassword;