import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../services/api.js';

const genericMessage = 'If an account exists for this email, password reset instructions have been generated.';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.forgotPassword(email.trim());
      setMessage(response.message || genericMessage);
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
        <h1>Forgot your password?</h1>
        <p className="form-intro">Enter your email and we will check for a matching account.</p>
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="forgot-email">Email</label>
          <input id="forgot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {message ? <p className="form-success" role="status">{message}</p> : null}
          <button className="button button-primary button-full" type="submit" disabled={submitting}>
            {submitting ? 'Checking...' : 'Request reset'}
          </button>
        </form>
        <p className="form-footer"><Link to="/login">Return to sign in</Link></p>
      </section>
    </main>
  );
}

export default ForgotPassword;